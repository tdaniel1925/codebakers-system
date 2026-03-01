---
name: API Versioning Specialist
tier: migration
triggers: api versioning, api version, v1 v2, breaking api change, api deprecation, backward compatibility, api compatibility, sunset api, api evolution, rest versioning, api migration, version strategy, deprecation policy
depends_on: backend.md, architect.md, security.md
conflicts_with: null
prerequisites: null
description: API version strategies — URL vs header versioning, backward-compatible evolution, deprecation policies, sunset headers, consumer migration guides, and multi-version support in Next.js route handlers
code_templates: null
design_tokens: null
---

# API Versioning Specialist

## Role

Manages the lifecycle of APIs from initial release through evolution, deprecation, and sunset. Ensures API changes never break existing consumers by enforcing backward compatibility rules and providing clear migration paths when breaking changes are unavoidable. Owns versioning strategy, deprecation policies, changelog generation, and consumer communication for both internal and external APIs.

## When to Use

- Designing a versioning strategy for a new API
- Planning a breaking change to an existing API
- Adding a new API version while maintaining the old one
- Deprecating endpoints, fields, or entire API versions
- Writing migration guides for API consumers
- Resolving backward compatibility issues after a deploy
- Auditing an API for unintentional breaking changes
- Setting up sunset headers and deprecation notices
- Managing webhook payload versioning
- Supporting multiple API versions simultaneously in the same codebase

## Also Consider

- **backend.md** — API route implementation and server actions
- **architect.md** — system-level API design decisions
- **security.md** — auth changes across API versions
- **database-migration.md** — schema changes that drive API changes
- **codebase-migration.md** — when API versioning is part of a larger framework upgrade

## Anti-Patterns (NEVER Do)

- **NEVER ship a breaking change without a version bump** — if any consumer could break, it's a new version
- **NEVER remove a field from a response without deprecation** — consumers depend on response shape; removal is always breaking
- **NEVER change the type of an existing field** — `"count": 5` becoming `"count": "5"` breaks every consumer
- **NEVER change error response formats between versions** — consumers parse errors programmatically; format changes break error handling
- **NEVER sunset an API version without minimum 6 months notice** — external consumers need time to migrate
- **NEVER version every endpoint independently** — version the entire API surface together to avoid combinatorial chaos
- **NEVER use query parameter versioning** (`?v=2`) — it's unreliable, gets cached wrong, and is easily lost in redirects
- **NEVER maintain more than 3 active versions** — the maintenance burden grows exponentially; deprecate aggressively
- **NEVER copy-paste route handlers for new versions** — use shared logic with version-specific adapters

## Standards & Patterns

### Versioning Strategy Decision

```
URL path versioning (RECOMMENDED for most projects):
├── /api/v1/users
├── /api/v2/users
├── Clear, visible, easy to test in browser
├── Works perfectly with Next.js App Router
├── Cache-friendly (different URL = different cache)
└── Use this unless you have a specific reason not to

Header versioning (for advanced API platforms):
├── GET /api/users with Accept: application/vnd.api+json;version=2
├── Cleaner URLs
├── Harder to test (need tools like Postman/curl)
├── Good for APIs with many micro-versions
└── Use for public API platforms with sophisticated consumers

Date-based versioning (for large-scale APIs like Stripe):
├── Stripe-Version: 2024-01-01
├── Every API call is pinned to a date
├── Changes accumulate; each date gets a snapshot
├── Complex to implement, excellent for consumers
└── Only use if building a public API platform
```

**Recommendation: URL path versioning for all BotMakers projects.**

### What Counts as a Breaking Change

```
BREAKING (requires new version):
├── Removing an endpoint
├── Removing a field from a response
├── Changing a field's type (number → string, object → array)
├── Changing a field's name
├── Making an optional request field required
├── Changing authentication method
├── Changing error response format or codes
├── Changing pagination format
├── Reducing rate limits
└── Changing the meaning/behavior of an existing field

NOT BREAKING (safe to ship without version bump):
├── Adding a new endpoint
├── Adding a new optional field to request body
├── Adding a new field to response body
├── Adding a new optional query parameter
├── Adding a new enum value (if consumers handle unknown values)
├── Increasing rate limits
├── Adding new error codes (if consumers handle unknown codes)
├── Performance improvements
└── Bug fixes that correct behavior to match documentation
```

### Next.js Multi-Version Route Structure

```
app/
├── api/
│   ├── v1/
│   │   ├── users/
│   │   │   └── route.ts        → GET /api/v1/users
│   │   ├── users/[id]/
│   │   │   └── route.ts        → GET /api/v1/users/:id
│   │   └── orders/
│   │       └── route.ts        → GET /api/v1/orders
│   └── v2/
│       ├── users/
│       │   └── route.ts        → GET /api/v2/users (new response shape)
│       ├── users/[id]/
│       │   └── route.ts        → GET /api/v2/users/:id
│       └── orders/
│           └── route.ts        → GET /api/v2/orders
├── lib/
│   ├── services/               → Shared business logic (version-agnostic)
│   │   ├── user-service.ts
│   │   └── order-service.ts
│   └── api/
│       ├── v1/
│       │   └── transformers.ts → v1-specific response shapes
│       └── v2/
│           └── transformers.ts → v2-specific response shapes
```

### Shared Logic with Version-Specific Transformers

```typescript
// lib/services/user-service.ts — shared business logic
export async function getUsers(filters: UserFilters) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, avatar_url, role, created_at, metadata')
    .match(filters);

  if (error) throw error;
  return data;
}

// lib/api/v1/transformers.ts — v1 response shape
import type { DbUser } from '@/types/database';

export function transformUserV1(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.full_name,  // v1 used "name"
    avatar: user.avatar_url,
    role: user.role,
    created: user.created_at,  // v1 used "created"
  };
}

// lib/api/v2/transformers.ts — v2 response shape
import type { DbUser } from '@/types/database';

export function transformUserV2(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,  // v2 uses "full_name"
    avatar_url: user.avatar_url,
    role: user.role,
    metadata: user.metadata,    // v2 added metadata
    created_at: user.created_at,  // v2 uses "created_at"
    _links: {                   // v2 added HATEOAS links
      self: `/api/v2/users/${user.id}`,
      orders: `/api/v2/users/${user.id}/orders`,
    },
  };
}

// app/api/v1/users/route.ts
import { getUsers } from '@/lib/services/user-service';
import { transformUserV1 } from '@/lib/api/v1/transformers';

export async function GET(req: Request) {
  const users = await getUsers({});
  return Response.json({
    users: users.map(transformUserV1),
  });
}

// app/api/v2/users/route.ts
import { getUsers } from '@/lib/services/user-service';
import { transformUserV2 } from '@/lib/api/v2/transformers';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);

  const users = await getUsers({});
  return Response.json({
    data: users.map(transformUserV2),  // v2 wraps in "data"
    pagination: {                       // v2 added cursor pagination
      next_cursor: users[users.length - 1]?.id || null,
      has_more: users.length === limit,
    },
  });
}
```

### Deprecation Policy

```
Timeline for deprecating an API version:

Day 0:    Announce new version, mark old version as deprecated
          ├── Add Deprecation header to old version responses
          ├── Add Sunset header with removal date
          ├── Publish migration guide
          └── Notify consumers via email/changelog

Month 1:  Begin logging usage of deprecated endpoints
          ├── Identify consumers still on old version
          └── Send targeted migration reminders

Month 3:  Send final warning
          ├── Return Warning header on every response
          └── Direct contact with high-volume consumers

Month 6:  Sunset the old version
          ├── Return 410 Gone with migration guide link
          └── Remove old route handlers from codebase
```

### Deprecation Headers

```typescript
// middleware/deprecation.ts
import { NextResponse } from 'next/server';

export function withDeprecation(
  response: Response,
  config: {
    version: string;
    sunsetDate: string;    // ISO date
    migrationGuide: string; // URL
  }
) {
  const headers = new Headers(response.headers);

  // Standard deprecation headers (RFC 8594)
  headers.set('Deprecation', 'true');
  headers.set('Sunset', config.sunsetDate);
  headers.set(
    'Link',
    `<${config.migrationGuide}>; rel="deprecation"; type="text/html"`
  );

  // Warning header for extra visibility
  headers.set(
    'Warning',
    `299 - "API ${config.version} is deprecated. Migrate by ${config.sunsetDate}. Guide: ${config.migrationGuide}"`
  );

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

// Usage in a v1 route handler
import { withDeprecation } from '@/middleware/deprecation';

export async function GET(req: Request) {
  const data = await fetchData();
  const response = Response.json({ users: data });

  return withDeprecation(response, {
    version: 'v1',
    sunsetDate: '2025-06-01T00:00:00Z',
    migrationGuide: 'https://docs.example.com/api/migration/v1-to-v2',
  });
}
```

### Sunset Response (After Deprecation Period)

```typescript
// app/api/v1/[...path]/route.ts — catch-all for sunset v1
export async function GET() {
  return Response.json(
    {
      error: 'gone',
      message: 'API v1 has been retired. Please migrate to v2.',
      migration_guide: 'https://docs.example.com/api/migration/v1-to-v2',
      current_version: 'https://api.example.com/api/v2',
    },
    {
      status: 410,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

// Apply to all HTTP methods
export { GET as POST, GET as PUT, GET as PATCH, GET as DELETE };
```

### Webhook Versioning

```typescript
// Webhooks need versioning too — payload shape changes break consumers

interface WebhookPayloadV1 {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface WebhookPayloadV2 {
  id: string;                    // Added: unique event ID for idempotency
  type: string;                  // Renamed: "event" → "type"
  data: Record<string, unknown>;
  created_at: string;            // Renamed: "timestamp" → "created_at"
  api_version: '2024-01-01';     // Added: version tag
}

// When sending webhooks, use the version the consumer registered with
async function sendWebhook(
  endpoint: string,
  event: string,
  data: Record<string, unknown>,
  apiVersion: 'v1' | 'v2'
) {
  const payload =
    apiVersion === 'v1'
      ? { event, data, timestamp: new Date().toISOString() }
      : {
          id: crypto.randomUUID(),
          type: event,
          data,
          created_at: new Date().toISOString(),
          api_version: '2024-01-01',
        };

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Version': apiVersion,
    },
    body: JSON.stringify(payload),
  });
}
```

### API Changelog Format

```markdown
# API Changelog

## v2 (2024-06-01)

### Breaking Changes
- Response wrapper changed: `{ users: [...] }` → `{ data: [...], pagination: {...} }`
- Field renamed: `name` → `full_name` on User object
- Field renamed: `created` → `created_at` on all objects
- Pagination changed from offset to cursor-based

### New Features
- Added `metadata` field to User object
- Added HATEOAS `_links` to all resource responses
- Added cursor-based pagination with `cursor` and `limit` params
- Added `X-Request-Id` header to all responses

### Migration Guide
See: https://docs.example.com/api/migration/v1-to-v2

---

## v1 (2023-01-01) — DEPRECATED, sunset 2025-06-01
- Initial release
```

### Version Detection Middleware

```typescript
// middleware.ts — route API requests to correct version handlers
import { NextResponse, type NextRequest } from 'next/server';

const CURRENT_VERSION = 'v2';
const SUPPORTED_VERSIONS = ['v1', 'v2'];
const DEPRECATED_VERSIONS = ['v1'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  // Check if request already has a version
  const versionMatch = pathname.match(/^\/api\/(v\d+)\//);
  if (versionMatch) {
    const version = versionMatch[1];

    if (!SUPPORTED_VERSIONS.includes(version)) {
      return NextResponse.json(
        {
          error: 'unsupported_version',
          message: `API ${version} is not supported. Current version: ${CURRENT_VERSION}`,
          supported: SUPPORTED_VERSIONS,
        },
        { status: 400 }
      );
    }

    return NextResponse.next();
  }

  // No version in URL — redirect to current version
  const versionedPath = pathname.replace('/api/', `/api/${CURRENT_VERSION}/`);
  return NextResponse.redirect(new URL(versionedPath, request.url), 307);
}

export const config = {
  matcher: '/api/:path*',
};
```

## Code Templates

No dedicated code templates. Versioning patterns are inline above. The transformer pattern (shared service → version-specific response shape) is the core reusable pattern for all versioned APIs.

## Checklist

Before declaring API versioning work complete:

- [ ] Versioning strategy documented (URL path recommended)
- [ ] Breaking vs non-breaking change rules documented for the team
- [ ] Shared business logic extracted to services (not duplicated per version)
- [ ] Version-specific transformers handle response shape differences
- [ ] Deprecation headers added to deprecated versions (Deprecation, Sunset, Link)
- [ ] Migration guide written for each version transition
- [ ] API changelog maintained with breaking changes, new features, and dates
- [ ] Sunset catch-all route returns 410 with migration guide link
- [ ] Webhook payloads versioned per consumer registration
- [ ] Middleware redirects unversioned requests to current version
- [ ] No more than 3 API versions active simultaneously
- [ ] Consumer usage of deprecated versions monitored and logged
- [ ] Deprecation timeline communicated (minimum 6 months for external APIs)

## Common Pitfalls

1. **Duplicating business logic across versions** — version-specific code should only be the request parsing and response shaping. If you find yourself copying database queries or business rules into v2 handlers, extract to a shared service.

2. **Treating additive changes as breaking** — adding a new field to a response is not breaking. Adding a new optional query parameter is not breaking. Don't create a new version when you don't need one; it adds maintenance cost for no benefit.

3. **Forgetting webhook versioning** — teams version their REST endpoints but send webhook payloads with whatever the latest format is. Consumers parse webhooks just like API responses; changing the shape without versioning breaks integrations silently.

4. **No deprecation period** — removing an API version without warning destroys consumer trust. Even internal APIs deserve at least a 2-week notice. External APIs need 6+ months.

5. **Versioning too granularly** — versioning individual endpoints creates a matrix of compatibility. Version the entire API surface together: when v2 ships, all endpoints get a v2 variant.

6. **Not monitoring deprecated version usage** — if you don't know who's still calling v1, you can't sunset it confidently. Log the consumer (API key or IP) and version on every request.
