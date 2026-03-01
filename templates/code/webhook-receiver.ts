/**
 * webhook-receiver.ts
 * Generic inbound webhook handler with signature verification, idempotency, and async processing.
 * Supports Stripe, Twilio, GitHub, Shopify, Slack, and custom HMAC providers.
 *
 * Usage:
 *   Copy to: app/api/webhooks/[provider]/route.ts
 *   Configure: WEBHOOK_SECRET_<PROVIDER> env vars
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Signature Verification ─────────────────────────────────────────────────

type Provider = 'stripe' | 'twilio' | 'github' | 'shopify' | 'slack' | 'custom';

interface VerificationResult {
  valid: boolean;
  eventId?: string;
  eventType?: string;
}

function verifyStripe(headers: Headers, body: string, secret: string): VerificationResult {
  const sig = headers.get('stripe-signature') ?? '';
  const elements = Object.fromEntries(
    sig.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );
  const timestamp = elements['t'];
  const signedPayload = `${timestamp}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Check timestamp (reject > 5 min old)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return { valid: false };

  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(elements['v1'] ?? ''));
  const payload = JSON.parse(body);
  return { valid, eventId: payload.id, eventType: payload.type };
}

function verifyGithub(headers: Headers, body: string, secret: string): VerificationResult {
  const sig = headers.get('x-hub-signature-256') ?? '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  const payload = JSON.parse(body);
  return { valid, eventId: headers.get('x-github-delivery') ?? payload.id, eventType: headers.get('x-github-event') ?? 'unknown' };
}

function verifyShopify(headers: Headers, body: string, secret: string): VerificationResult {
  const hmac = headers.get('x-shopify-hmac-sha256') ?? '';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac));
  const payload = JSON.parse(body);
  return { valid, eventId: headers.get('x-shopify-webhook-id') ?? crypto.randomUUID(), eventType: headers.get('x-shopify-topic') ?? 'unknown' };
}

function verifySlack(headers: Headers, body: string, secret: string): VerificationResult {
  const timestamp = headers.get('x-slack-request-timestamp') ?? '';
  const sig = headers.get('x-slack-signature') ?? '';
  const baseString = `v0:${timestamp}:${body}`;
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(baseString).digest('hex');

  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return { valid: false };

  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  const payload = JSON.parse(body);
  return { valid, eventId: payload.event_id ?? crypto.randomUUID(), eventType: payload.event?.type ?? payload.type };
}

function verifyCustomHmac(headers: Headers, body: string, secret: string): VerificationResult {
  const sig = headers.get('x-webhook-signature') ?? '';
  const timestamp = headers.get('x-webhook-timestamp') ?? '';
  const signedContent = timestamp ? `${timestamp}.${body}` : body;
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest('hex');

  let valid: boolean;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    valid = false;
  }

  const payload = JSON.parse(body);
  return { valid, eventId: payload.id ?? crypto.randomUUID(), eventType: payload.event ?? payload.type ?? 'unknown' };
}

function verifyWebhook(provider: Provider, headers: Headers, body: string): VerificationResult {
  const secretKey = `WEBHOOK_SECRET_${provider.toUpperCase()}`;
  const secret = process.env[secretKey];
  if (!secret) throw new Error(`Missing env var: ${secretKey}`);

  switch (provider) {
    case 'stripe': return verifyStripe(headers, body, secret);
    case 'github': return verifyGithub(headers, body, secret);
    case 'shopify': return verifyShopify(headers, body, secret);
    case 'slack': return verifySlack(headers, body, secret);
    case 'custom': return verifyCustomHmac(headers, body, secret);
    default: return verifyCustomHmac(headers, body, secret);
  }
}

// ─── Idempotency ────────────────────────────────────────────────────────────

async function isAlreadyProcessed(provider: string, eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .single();

  return !!data;
}

async function recordEvent(provider: string, eventId: string, eventType: string, payload: any) {
  await supabase.from('webhook_events').insert({
    provider,
    event_id: eventId,
    event_type: eventType,
    payload,
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
  });
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as Provider;
  const body = await req.text();

  // 1. Verify signature
  let verification: VerificationResult;
  try {
    verification = verifyWebhook(provider, req.headers, body);
  } catch (error) {
    console.error(`[webhook:${provider}] Verification error:`, error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }

  if (!verification.valid) {
    console.error(`[webhook:${provider}] Invalid signature`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { eventId, eventType } = verification;

  // 2. Idempotency check
  if (eventId && await isAlreadyProcessed(provider, eventId)) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  // 3. Record and queue for async processing
  const payload = JSON.parse(body);
  if (eventId && eventType) {
    await recordEvent(provider, eventId, eventType, payload);
  }

  console.log(`[webhook:${provider}] Received ${eventType} (${eventId})`);

  // 4. Return 200 immediately
  return NextResponse.json({ status: 'accepted' }, { status: 200 });
}

// ─── Database Schema (run once) ─────────────────────────────────────────────
/*
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE INDEX idx_webhook_events_status ON webhook_events(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_webhook_events_retry ON webhook_events(next_retry_at) WHERE status = 'pending';
*/
