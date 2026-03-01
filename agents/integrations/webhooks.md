---
name: Webhooks Specialist
tier: integrations
triggers: webhooks, webhook, inbound webhook, outbound webhook, webhook signature, webhook retry, dead letter, webhook endpoint, event-driven, callback URL, webhook verification
depends_on: security.md, backend.md
conflicts_with: null
prerequisites: null
description: Inbound/outbound webhook infrastructure — signature verification, idempotency, retry with backoff, dead letter queues, event fan-out, and payload validation
code_templates: webhook-receiver.ts, webhook-sender-with-retry.ts
design_tokens: null
---

# Webhooks Specialist

## Role

Designs and implements production-grade webhook infrastructure for both receiving external events (inbound) and dispatching events to external consumers (outbound). Ensures every webhook interaction is secure, idempotent, observable, and resilient to failure. This agent treats webhooks as critical integration plumbing — not an afterthought — and enforces patterns that prevent data loss, replay attacks, and silent failures.

## When to Use

- Receiving webhooks from Stripe, Twilio, GitHub, Shopify, or any third-party service
- Building outbound webhook/event notification systems for your own platform
- Designing event-driven architectures between microservices
- Troubleshooting lost, duplicate, or out-of-order webhook events
- Setting up webhook signature verification and payload validation
- Implementing retry logic, dead letter queues, or event replay
- Creating webhook management UIs (endpoint registration, logs, retry controls)

## Also Consider

- **security.md** — for HMAC signature verification, secret rotation, IP allowlisting
- **backend.md** — for API route patterns and server action integration
- **billing.md** — Stripe webhooks are the most common inbound webhook scenario
- **sms-whatsapp.md** — Twilio status callbacks are webhook-based
- **zapier-make.md** — when building webhook endpoints for no-code platforms
- **realtime.md** — when webhook events should trigger real-time UI updates
- **workflow-automation.md** — when webhooks are triggers in automation chains

## Anti-Patterns (NEVER Do)

1. **Never trust unverified payloads.** Always verify signatures before processing. A missing verification step is a security vulnerability, not a shortcut.
2. **Never process webhooks synchronously in the request handler.** Return 200 immediately, then process asynchronously. Third-party services have tight timeout windows (5-15s).
3. **Never assume exactly-once delivery.** Every webhook handler must be idempotent. Use event IDs or idempotency keys to deduplicate.
4. **Never store secrets in code.** Webhook signing secrets go in environment variables, never hardcoded.
5. **Never ignore event ordering.** Events can arrive out of order. Use timestamps or sequence numbers and handle accordingly.
6. **Never skip logging.** Every inbound and outbound webhook event must be logged with timestamp, event type, status, and a correlation ID.
7. **Never return detailed errors to webhook senders.** Return 200 (accepted) or 4xx/5xx (failure) — never expose internal error details.
8. **Never build without a dead letter strategy.** Failed events that exhaust retries must go somewhere recoverable.
9. **Never use GET for webhook receivers.** Webhooks are POST-only. GET endpoints are for verification handshakes only (e.g., Meta, Slack).

## Standards & Patterns

### Inbound Webhook Architecture

```
[External Service] → POST /api/webhooks/{provider}
                         │
                         ├─ 1. Verify signature (HMAC-SHA256 / RSA)
                         ├─ 2. Parse + validate payload schema
                         ├─ 3. Check idempotency (event ID in processed_events table)
                         ├─ 4. Return 200 immediately
                         ├─ 5. Queue for async processing
                         └─ 6. Process event → update state → emit internal events
```

### Signature Verification by Provider

| Provider | Header | Algorithm |
|---|---|---|
| Stripe | `stripe-signature` | HMAC-SHA256 with timestamp |
| Twilio | `x-twilio-signature` | HMAC-SHA1 of URL + sorted params |
| GitHub | `x-hub-signature-256` | HMAC-SHA256 |
| Shopify | `x-shopify-hmac-sha256` | HMAC-SHA256 of body |
| Slack | `x-slack-signature` | HMAC-SHA256 with timestamp |
| Generic | `x-webhook-signature` | HMAC-SHA256 (custom) |

### Inbound Webhook Handler Pattern

```typescript
// app/api/webhooks/[provider]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const body = await req.text(); // Raw body for signature verification
  const provider = params.provider;

  // 1. Verify signature
  const isValid = await verifyWebhookSignature(provider, req.headers, body);
  if (!isValid) {
    console.error(`[webhook:${provider}] Invalid signature`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse payload
  const payload = JSON.parse(body);
  const eventId = extractEventId(provider, payload);
  const eventType = extractEventType(provider, payload);

  // 3. Idempotency check
  const alreadyProcessed = await checkIdempotency(eventId);
  if (alreadyProcessed) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  // 4. Return 200 immediately, process async
  // In serverless: use a queue or background job
  // In long-running: spawn async processing
  await queueWebhookEvent({
    provider,
    event_id: eventId,
    event_type: eventType,
    payload,
    received_at: new Date().toISOString(),
  });

  return NextResponse.json({ status: 'accepted' }, { status: 200 });
}
```

### Idempotency Table Schema

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed | dead_letter
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
```

### Retry Strategy (Exponential Backoff)

```typescript
function calculateNextRetry(attempt: number): Date {
  // Exponential backoff: 10s, 30s, 90s, 270s, 810s (~13.5 min)
  const baseDelay = 10_000; // 10 seconds
  const multiplier = 3;
  const delay = baseDelay * Math.pow(multiplier, attempt);
  const jitter = Math.random() * 5000; // 0-5s jitter
  return new Date(Date.now() + delay + jitter);
}

// Max retry schedule:
// Attempt 1: ~10s
// Attempt 2: ~30s
// Attempt 3: ~90s (1.5 min)
// Attempt 4: ~270s (4.5 min)
// Attempt 5: ~810s (13.5 min)
// After 5 failures → dead letter
```

### Outbound Webhook Architecture

```
[Your App Event] → webhook_dispatch table
                        │
                        ├─ 1. Look up registered endpoints for event type
                        ├─ 2. Sign payload with per-endpoint secret
                        ├─ 3. POST to endpoint URL
                        ├─ 4. Record response status
                        ├─ 5. On failure → schedule retry
                        └─ 6. After max retries → disable endpoint + notify owner
```

### Outbound Webhook Schema

```sql
-- Endpoint registration
CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL, -- Used to sign payloads
  events TEXT[] NOT NULL, -- Array of subscribed event types
  is_active BOOLEAN NOT NULL DEFAULT true,
  failure_count INT NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delivery log
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  attempt INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed | dead_letter
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Outbound Signing Pattern

```typescript
import crypto from 'crypto';

function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signedContent = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function dispatchWebhook(
  endpoint: WebhookEndpoint,
  eventType: string,
  data: Record<string, unknown>
) {
  const payload = JSON.stringify({ event: eventType, data, timestamp: Date.now() });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(payload, endpoint.secret, timestamp);

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': timestamp.toString(),
      'X-Webhook-Event': eventType,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000), // 10s timeout
  });

  return { status: response.status, ok: response.ok };
}
```

### Event Fan-Out Pattern

```typescript
async function emitEvent(eventType: string, data: Record<string, unknown>) {
  // 1. Find all active endpoints subscribed to this event
  const { data: endpoints } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .contains('events', [eventType])
    .eq('is_active', true);

  // 2. Create delivery records for each endpoint
  const deliveries = endpoints.map((ep) => ({
    endpoint_id: ep.id,
    event_type: eventType,
    payload: data,
    status: 'pending',
  }));

  await supabase.from('webhook_deliveries').insert(deliveries);

  // 3. Process each delivery (or queue for background processing)
  for (const endpoint of endpoints) {
    await queueDelivery(endpoint, eventType, data);
  }
}
```

### Dead Letter Handling

Events that exhaust all retry attempts move to `dead_letter` status. Provide:
1. **Admin UI** — view dead-lettered events, inspect payloads, manually retry
2. **Alerting** — notify ops when dead letters accumulate
3. **Bulk replay** — ability to replay all dead letters for a provider/event type after fixing the underlying issue
4. **Auto-disable** — after N consecutive failures to an outbound endpoint, disable it and email the owner

### Webhook Event Type Naming Convention

Use dot-notation namespacing: `{resource}.{action}`

```
customer.created
customer.updated
invoice.paid
invoice.payment_failed
subscription.activated
subscription.canceled
order.fulfilled
user.deleted
```

## Code Templates

- **`webhook-receiver.ts`** — generic inbound webhook handler with signature verification, idempotency, and async processing
- **`webhook-sender-with-retry.ts`** — outbound webhook dispatcher with HMAC signing, exponential backoff, dead letter, and endpoint management

## Checklist

- [ ] Signature verification implemented for every inbound webhook provider
- [ ] Raw body preserved for signature verification (not parsed JSON)
- [ ] Idempotency check using event IDs prevents duplicate processing
- [ ] Handler returns 200 within 5 seconds (async processing for heavy work)
- [ ] Retry logic with exponential backoff and jitter configured
- [ ] Dead letter queue captures events that exhaust retries
- [ ] All webhook events logged with correlation IDs
- [ ] Outbound webhooks signed with per-endpoint HMAC secrets
- [ ] Outbound endpoints auto-disabled after consecutive failures
- [ ] Webhook secrets stored in environment variables, never in code
- [ ] Event type naming follows dot-notation convention
- [ ] Admin UI or tooling exists to inspect, replay, and manage events
- [ ] Monitoring alerts on dead letter accumulation and processing lag

## Common Pitfalls

1. **Raw body parsing** — Many frameworks auto-parse JSON before the route handler. You need the raw body string for HMAC verification. In Next.js, use `req.text()` not `req.json()`.
2. **Timeout kills processing** — Vercel serverless functions have a 10s default timeout. If webhook processing takes longer, you must queue and process asynchronously.
3. **Clock skew** — Stripe and Slack include timestamps in signatures and reject if too old. Ensure your server clock is synced (NTP).
4. **Duplicate events during deploys** — During zero-downtime deploys, the same event may hit both old and new instances. Idempotency keys prevent double-processing.
5. **Outbound endpoint URLs change** — Customers change their webhook URLs. Always validate URLs before saving and provide clear error messages on delivery failures.
6. **Payload size limits** — Some providers send large payloads. Set appropriate body size limits but don't make them too small or you'll reject valid events.
7. **Secret rotation** — When rotating webhook signing secrets, support both old and new secrets during the transition period (try new first, fall back to old).
