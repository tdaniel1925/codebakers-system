/**
 * webhook-sender-with-retry.ts
 * Outbound webhook dispatcher with HMAC signing, exponential backoff,
 * dead letter queue, and endpoint management.
 *
 * Usage:
 *   import { emitWebhookEvent, registerEndpoint } from '@/lib/webhooks/sender';
 *   await emitWebhookEvent('invoice.paid', { invoice_id: 'inv_123', amount: 5000 });
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebhookEndpoint {
  id: string;
  org_id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
}

interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed' | 'dead_letter';
  attempt: number;
  response_status?: number;
  response_body?: string;
  next_retry_at?: string;
}

// ─── Signing ────────────────────────────────────────────────────────────────

function signPayload(payload: string, secret: string): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedContent = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  return { signature: `t=${timestamp},v1=${signature}`, timestamp };
}

// ─── Retry Logic ────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const AUTO_DISABLE_THRESHOLD = 10; // Consecutive failures before disabling endpoint

function calculateNextRetry(attempt: number): Date {
  const baseDelay = 10_000; // 10 seconds
  const multiplier = 3;
  const delay = baseDelay * Math.pow(multiplier, attempt);
  const jitter = Math.random() * 5000;
  return new Date(Date.now() + delay + jitter);
}

// ─── Endpoint Management ────────────────────────────────────────────────────

export async function registerEndpoint(
  orgId: string,
  url: string,
  events: string[]
): Promise<{ id: string; secret: string }> {
  // Validate URL
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('HTTPS required');
  } catch {
    throw new Error('Invalid webhook URL. Must be a valid HTTPS URL.');
  }

  const secret = crypto.randomBytes(32).toString('hex');

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      org_id: orgId,
      url,
      secret,
      events,
      is_active: true,
      failure_count: 0,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to register endpoint: ${error.message}`);

  return { id: data.id, secret };
}

export async function removeEndpoint(endpointId: string, orgId: string): Promise<void> {
  await supabase
    .from('webhook_endpoints')
    .delete()
    .eq('id', endpointId)
    .eq('org_id', orgId);
}

export async function listEndpoints(orgId: string): Promise<WebhookEndpoint[]> {
  const { data } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  return data ?? [];
}

// ─── Event Emission ─────────────────────────────────────────────────────────

export async function emitWebhookEvent(
  eventType: string,
  data: Record<string, unknown>,
  orgId?: string
) {
  // Find all active endpoints subscribed to this event type
  let query = supabase
    .from('webhook_endpoints')
    .select('*')
    .contains('events', [eventType])
    .eq('is_active', true);

  if (orgId) query = query.eq('org_id', orgId);

  const { data: endpoints } = await query;
  if (!endpoints?.length) return;

  // Create delivery records
  const deliveries = endpoints.map((ep) => ({
    endpoint_id: ep.id,
    event_type: eventType,
    payload: { event: eventType, data, timestamp: new Date().toISOString() },
    status: 'pending' as const,
    attempt: 0,
  }));

  await supabase.from('webhook_deliveries').insert(deliveries);

  // Process each delivery
  for (const endpoint of endpoints) {
    await processDelivery(endpoint, eventType, data);
  }
}

// ─── Delivery Processing ────────────────────────────────────────────────────

async function processDelivery(
  endpoint: WebhookEndpoint,
  eventType: string,
  data: Record<string, unknown>
) {
  const payload = JSON.stringify({
    event: eventType,
    data,
    timestamp: new Date().toISOString(),
  });

  const { signature, timestamp } = signPayload(payload, endpoint.secret);

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-Event': eventType,
        'X-Webhook-Id': crypto.randomUUID(),
        'User-Agent': 'YourApp-Webhooks/1.0',
      },
      body: payload,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      // Success
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'success',
          response_status: response.status,
          response_body: responseBody.slice(0, 1000),
        })
        .eq('endpoint_id', endpoint.id)
        .eq('event_type', eventType)
        .eq('status', 'pending');

      // Reset failure count
      await supabase
        .from('webhook_endpoints')
        .update({ failure_count: 0, last_success_at: new Date().toISOString() })
        .eq('id', endpoint.id);
    } else {
      await handleDeliveryFailure(endpoint, eventType, response.status, responseBody);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await handleDeliveryFailure(endpoint, eventType, 0, errorMsg);
  }
}

async function handleDeliveryFailure(
  endpoint: WebhookEndpoint,
  eventType: string,
  responseStatus: number,
  responseBody: string
) {
  const currentAttempt = endpoint.failure_count + 1;

  if (currentAttempt >= MAX_ATTEMPTS) {
    // Move to dead letter
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'dead_letter',
        response_status: responseStatus,
        response_body: responseBody.slice(0, 1000),
        attempt: currentAttempt,
      })
      .eq('endpoint_id', endpoint.id)
      .eq('event_type', eventType)
      .eq('status', 'pending');

    console.error(`[webhook] Dead letter: endpoint=${endpoint.id} event=${eventType} after ${currentAttempt} attempts`);
  } else {
    // Schedule retry
    const nextRetry = calculateNextRetry(currentAttempt);
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'failed',
        response_status: responseStatus,
        response_body: responseBody.slice(0, 1000),
        attempt: currentAttempt,
        next_retry_at: nextRetry.toISOString(),
      })
      .eq('endpoint_id', endpoint.id)
      .eq('event_type', eventType)
      .eq('status', 'pending');
  }

  // Increment failure count and maybe disable
  const newFailureCount = endpoint.failure_count + 1;
  const updates: Record<string, unknown> = {
    failure_count: newFailureCount,
    last_failure_at: new Date().toISOString(),
  };

  if (newFailureCount >= AUTO_DISABLE_THRESHOLD) {
    updates.is_active = false;
    console.warn(`[webhook] Auto-disabled endpoint ${endpoint.id} after ${AUTO_DISABLE_THRESHOLD} consecutive failures`);
    // TODO: Notify endpoint owner via email
  }

  await supabase
    .from('webhook_endpoints')
    .update(updates)
    .eq('id', endpoint.id);
}

// ─── Retry Processor (run via cron) ─────────────────────────────────────────

export async function processRetries() {
  const { data: pendingRetries } = await supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints(*)')
    .eq('status', 'failed')
    .lt('next_retry_at', new Date().toISOString())
    .limit(50);

  for (const delivery of pendingRetries ?? []) {
    const endpoint = delivery.webhook_endpoints as WebhookEndpoint;
    if (!endpoint?.is_active) continue;

    await processDelivery(endpoint, delivery.event_type, delivery.payload.data);
  }
}

// ─── Dead Letter Management ─────────────────────────────────────────────────

export async function getDeadLetters(orgId: string) {
  const { data } = await supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints!inner(org_id, url)')
    .eq('status', 'dead_letter')
    .eq('webhook_endpoints.org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  return data ?? [];
}

export async function replayDeadLetter(deliveryId: string) {
  const { data: delivery } = await supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints(*)')
    .eq('id', deliveryId)
    .eq('status', 'dead_letter')
    .single();

  if (!delivery) throw new Error('Dead letter not found');

  // Reset and reprocess
  await supabase
    .from('webhook_deliveries')
    .update({ status: 'pending', attempt: 0 })
    .eq('id', deliveryId);

  const endpoint = delivery.webhook_endpoints as WebhookEndpoint;
  await processDelivery(endpoint, delivery.event_type, delivery.payload.data);
}

// ─── Database Schema (run once) ─────────────────────────────────────────────
/*
CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failure_count INT NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  attempt INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'failed';
CREATE INDEX idx_deliveries_dead ON webhook_deliveries(status) WHERE status = 'dead_letter';
*/
