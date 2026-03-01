---
name: Zapier & Make Integration Specialist
tier: integrations
triggers: zapier, make, integromat, no-code, automation platform, trigger action, zapier webhook, make webhook, api connector, zapier integration, make scenario, zap, ifttt
depends_on: backend.md, webhooks.md
conflicts_with: null
prerequisites: null
description: Designing APIs and webhook endpoints optimized for Zapier, Make (Integromat), and similar no-code automation platforms — trigger/action architecture, webhook endpoints, polling triggers, API connector patterns, and authentication schemes
code_templates: null
design_tokens: null
---

# Zapier & Make Integration Specialist

## Role

Designs and implements APIs and webhook infrastructure optimized for consumption by no-code automation platforms like Zapier, Make (formerly Integromat), and similar tools. This agent focuses on the provider side — making your application a first-class integration target that non-technical users can wire into their workflows. Handles trigger/action API design, webhook subscription endpoints, polling trigger patterns, authentication schemes compatible with platform requirements, and the specific data format conventions these platforms expect.

## When to Use

- Building webhook endpoints that Zapier/Make can subscribe to
- Designing REST API actions that map cleanly to Zapier/Make steps
- Implementing authentication (API key, OAuth 2.0) compatible with automation platforms
- Creating polling triggers for platforms that don't support webhooks natively
- Building a public Zapier integration or Make app for your product
- Designing API responses that work well with no-code field mapping
- Exposing your app's events for third-party automation without custom code

## Also Consider

- **webhooks.md** — for the underlying webhook infrastructure these platforms consume
- **backend.md** — for REST API route design fundamentals
- **auth.md** — for OAuth 2.0 implementation that Zapier/Make can use
- **workflow-automation.md** — when building your own automation engine instead of relying on external platforms
- **slack.md** — Slack integrations often pair with Zapier/Make automations

## Anti-Patterns (NEVER Do)

1. **Never return nested objects without flattening options.** Zapier and Make struggle with deeply nested JSON. Provide flat or shallow response structures, or offer a `?flatten=true` query param.
2. **Never use non-standard auth schemes.** Stick to API Key (header), OAuth 2.0 (authorization code), or Basic Auth. Custom auth schemes won't work in Zapier/Make.
3. **Never return inconsistent field names.** If `created_at` appears in one endpoint, don't use `createdAt` in another. Automation users map fields once and expect consistency.
4. **Never paginate without a cursor or page parameter.** Zapier polling triggers need to deduplicate. Always include an `id` and a sortable timestamp in every response.
5. **Never return HTML or markdown in fields meant for display.** Automation platforms pass data between systems — rich formatting gets garbled. Return plain text with separate structured fields.
6. **Never require complex request bodies for simple actions.** Zapier/Make users build payloads via form fields, not JSON editors. Keep required fields minimal and flat.
7. **Never skip webhook subscription management endpoints.** Zapier's REST Hook trigger requires subscribe/unsubscribe API endpoints, not just a static webhook URL.
8. **Never return errors without machine-readable codes.** Automation platforms need to distinguish auth failures from validation errors from server errors. Use consistent error schemas.

## Standards & Patterns

### API Design for Automation Platforms

Your API should follow these conventions to work seamlessly with Zapier, Make, and similar tools:

```
Design Principles:
├── Flat response structures (max 2 levels deep)
├── Consistent field naming (snake_case recommended)
├── Every object has `id` and a timestamp field
├── Pagination via cursor or offset
├── Standard HTTP status codes
├── Consistent error response schema
└── Idempotent POST/PUT operations where possible
```

### Trigger Types

#### 1. REST Hook Trigger (Preferred — Real-Time)

Zapier calls your subscribe/unsubscribe endpoints to manage webhook registrations:

```typescript
// POST /api/v1/webhooks/subscribe
// Called by Zapier when a user enables a Zap
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const body = await req.json();

  const { target_url, event } = body;
  // target_url: Zapier's webhook URL to receive events
  // event: e.g., 'contact.created', 'invoice.paid'

  // Validate event type
  const validEvents = ['contact.created', 'contact.updated', 'invoice.created', 'invoice.paid', 'deal.won'];
  if (!validEvents.includes(event)) {
    return NextResponse.json(
      { code: 'INVALID_EVENT', message: `Invalid event. Valid events: ${validEvents.join(', ')}` },
      { status: 400 }
    );
  }

  // Create webhook subscription
  const subscription = await createWebhookSubscription({
    org_id: auth.orgId,
    target_url,
    event,
    source: 'zapier',
  });

  return NextResponse.json({ id: subscription.id }, { status: 201 });
}

// DELETE /api/v1/webhooks/subscribe/:id
// Called by Zapier when a user disables a Zap
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);

  await deleteWebhookSubscription(params.id, auth.orgId);

  return NextResponse.json({ status: 'unsubscribed' }, { status: 200 });
}
```

#### 2. Polling Trigger (Fallback — For Simple Setups)

Zapier polls your API every 5-15 minutes:

```typescript
// GET /api/v1/contacts?direction=desc&limit=25
// Zapier polls this and deduplicates by `id`
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const url = new URL(req.url);

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '25'), 100);
  const cursor = url.searchParams.get('cursor');

  const { data, nextCursor } = await getContacts({
    orgId: auth.orgId,
    limit,
    cursor,
    orderBy: 'created_at',
    direction: 'desc', // Newest first — critical for polling triggers
  });

  return NextResponse.json({
    data,
    meta: {
      has_more: !!nextCursor,
      next_cursor: nextCursor,
    },
  });
}

// IMPORTANT: Response items MUST include `id` field
// Zapier uses `id` to deduplicate and only trigger on new items
// Response format:
// {
//   "data": [
//     { "id": "ct_123", "name": "John", "email": "john@example.com", "created_at": "2024-01-15T10:30:00Z" },
//     ...
//   ]
// }
```

### Action Endpoints

Actions are standard CRUD endpoints with automation-friendly design:

```typescript
// POST /api/v1/contacts — Create action
// Zapier/Make sends flat form data

interface CreateContactInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;       // Optional fields have sensible defaults
  company?: string;
  tags?: string;        // Comma-separated string (Zapier can't send arrays easily)
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const body: CreateContactInput = await req.json();

  // Parse tags from comma-separated string
  const tags = body.tags
    ? body.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const contact = await createContact({
    org_id: auth.orgId,
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    phone: body.phone,
    company: body.company,
    tags,
  });

  // Return the FULL created object (Zapier uses this for subsequent steps)
  return NextResponse.json(contact, { status: 201 });
}
```

### Search / Find Action

Zapier "Search" actions let users find records to use in later steps:

```typescript
// GET /api/v1/contacts/search?email=john@example.com
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const url = new URL(req.url);

  const email = url.searchParams.get('email');
  const name = url.searchParams.get('name');
  const phone = url.searchParams.get('phone');

  const results = await searchContacts({
    orgId: auth.orgId,
    email,
    name,
    phone,
  });

  // Return array — Zapier uses the first result
  // Return empty array if not found (Zapier handles "not found" logic)
  return NextResponse.json(results);
}
```

### Authentication for Automation Platforms

#### API Key Auth (Simplest)

```typescript
// Middleware: Check X-API-Key header
async function authenticateRequest(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    throw new ApiError(401, 'MISSING_API_KEY', 'Provide your API key in the X-API-Key header');
  }

  const org = await validateApiKey(apiKey);
  if (!org) {
    throw new ApiError(401, 'INVALID_API_KEY', 'The provided API key is invalid or expired');
  }

  return { orgId: org.id, apiKey };
}
```

#### OAuth 2.0 (For Public Zapier/Make Apps)

```typescript
// Standard OAuth 2.0 Authorization Code flow
// Zapier requires these endpoints:
// 1. GET  /oauth/authorize    — Authorization page
// 2. POST /oauth/token        — Token exchange
// 3. POST /oauth/token        — Token refresh (grant_type=refresh_token)
// 4. GET  /api/v1/me          — Test auth endpoint (Zapier calls this to verify)

// Test auth endpoint — Zapier calls this after OAuth to verify the connection works
// GET /api/v1/me
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);

  return NextResponse.json({
    id: auth.orgId,
    name: auth.orgName,
    email: auth.email,
  });
}
```

### Standard Error Response Schema

```typescript
// Consistent error format for all endpoints
interface ApiErrorResponse {
  code: string;          // Machine-readable: 'VALIDATION_ERROR', 'NOT_FOUND', 'RATE_LIMITED'
  message: string;       // Human-readable description
  details?: Record<string, string>[];  // Field-level errors
}

// Examples:
// 400: { "code": "VALIDATION_ERROR", "message": "Email is required", "details": [{"field": "email", "error": "required"}] }
// 401: { "code": "INVALID_API_KEY", "message": "The provided API key is invalid" }
// 404: { "code": "NOT_FOUND", "message": "Contact not found" }
// 429: { "code": "RATE_LIMITED", "message": "Too many requests. Retry after 60 seconds" }
// 500: { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred" }
```

### Webhook Payload Format for Triggers

When your app sends events to Zapier/Make webhook URLs:

```typescript
// Flat, consistent structure
interface WebhookPayload {
  id: string;              // Unique event/record ID — REQUIRED for deduplication
  event: string;           // e.g., 'contact.created'
  occurred_at: string;     // ISO 8601 timestamp

  // Flat data fields (not nested under a "data" key for Zapier compatibility)
  contact_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_company: string;
  contact_created_at: string;
}

// BAD — deeply nested (hard for Zapier users to map):
// { "data": { "contact": { "address": { "city": "Houston" } } } }

// GOOD — flat with prefixes:
// { "contact_address_city": "Houston", "contact_address_state": "TX" }
```

### Sample Data Endpoint

Zapier requires sample data to show users what fields are available:

```typescript
// GET /api/v1/contacts/sample
// Returns a realistic sample record for Zapier field mapping UI
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);

  // Return real recent data if available, otherwise static sample
  const recent = await getRecentContacts(auth.orgId, 3);

  if (recent.length > 0) {
    return NextResponse.json(recent);
  }

  // Static sample data
  return NextResponse.json([
    {
      id: 'ct_sample_001',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      phone: '+15551234567',
      company: 'Acme Corp',
      tags: 'lead,enterprise',
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:30:00Z',
    },
  ]);
}
```

### Rate Limiting for Automation Traffic

```typescript
// Automation platforms can generate significant traffic
// Implement per-API-key rate limiting

// Recommended limits:
// - Polling triggers: 100 req/min (Zapier polls every 5-15 min)
// - Actions: 50 req/min per key
// - Search: 30 req/min per key
// - Webhook subscribe/unsubscribe: 10 req/min per key

// Always include rate limit headers:
// X-RateLimit-Limit: 100
// X-RateLimit-Remaining: 95
// X-RateLimit-Reset: 1705312800
// Retry-After: 60 (on 429 responses)
```

### Make (Integromat) Specific Considerations

```
Make differences from Zapier:
├── Supports deeper JSON nesting in field mapping
├── Has native array/iterator support (less need to flatten)
├── Webhook triggers can be instant (no polling needed)
├── Supports custom HTTP modules (any REST API works)
├── Can handle binary data (files) more naturally
├── Pagination uses standard Link headers or offset/cursor
└── Error handling is more granular (400 vs 422 vs 500 matter)
```

### Available Events Endpoint

Let platforms discover what triggers are available:

```typescript
// GET /api/v1/webhooks/events
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);

  return NextResponse.json({
    events: [
      { key: 'contact.created', label: 'New Contact', description: 'Triggers when a new contact is created' },
      { key: 'contact.updated', label: 'Contact Updated', description: 'Triggers when a contact is updated' },
      { key: 'invoice.created', label: 'New Invoice', description: 'Triggers when an invoice is created' },
      { key: 'invoice.paid', label: 'Invoice Paid', description: 'Triggers when an invoice is marked as paid' },
      { key: 'deal.won', label: 'Deal Won', description: 'Triggers when a deal is marked as won' },
      { key: 'deal.lost', label: 'Deal Lost', description: 'Triggers when a deal is marked as lost' },
    ],
  });
}
```

## Code Templates

No dedicated code templates — the patterns above cover complete trigger/action/search endpoint design. Combine with webhooks.md templates for the underlying subscription infrastructure.

## Checklist

- [ ] API responses use flat structures (max 2 levels deep)
- [ ] Consistent field naming across all endpoints (snake_case)
- [ ] Every response object includes `id` and a timestamp field
- [ ] Pagination implemented with cursor or offset
- [ ] REST Hook subscribe/unsubscribe endpoints available
- [ ] Polling trigger endpoints return newest-first ordering
- [ ] Search endpoints accept common lookup fields (email, name, phone)
- [ ] Sample data endpoint returns realistic examples for field mapping
- [ ] Authentication via API Key header or OAuth 2.0 (standard flows)
- [ ] Test auth endpoint (`/me`) returns basic account info
- [ ] Error responses use consistent machine-readable codes
- [ ] Rate limiting with proper headers (Limit, Remaining, Reset)
- [ ] Webhook payloads include unique `id` for deduplication
- [ ] Available events endpoint for trigger discovery
- [ ] API documentation covers all triggers, actions, and search endpoints

## Common Pitfalls

1. **Array fields** — Zapier can't natively handle arrays in form inputs. Accept comma-separated strings (e.g., `tags: "lead,enterprise"`) and parse server-side. Make handles arrays better but it's still safer to support both formats.
2. **Webhook URL validation** — Zapier's webhook URLs change per Zap. Don't validate against a whitelist. Do validate that the URL is HTTPS.
3. **Polling deduplication** — Zapier deduplicates polling results by the `id` field. If your `id` values aren't truly unique or change, Zapier will re-trigger on the same records.
4. **OAuth token expiration** — If your access tokens expire and Zapier's refresh fails, all connected Zaps break silently. Make refresh tokens long-lived (30+ days) and handle refresh errors gracefully.
5. **Large payloads** — Zapier has a ~6MB payload limit for triggers. If your events can have large attachments, provide URLs instead of inline content.
6. **Time zone handling** — Always return ISO 8601 with timezone offset or UTC (Z suffix). Zapier/Make handle timezone conversion for the user.
7. **Rate limit handling** — Zapier retries on 429 but only a few times. If your rate limits are too aggressive, Zaps will error frequently. Set reasonable limits for automation traffic patterns.
