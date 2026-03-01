---
name: Rate Limiting Specialist
tier: infrastructure
triggers: rate limiting, rate limit, throttling, api limits, abuse prevention, ddos, brute force, upstash ratelimit, sliding window, token bucket, request throttle
depends_on: security.md, backend.md, edge-computing.md
conflicts_with: null
prerequisites: Upstash Redis (recommended) or Redis instance
description: Per-user, per-IP, and per-endpoint rate limiting — sliding window, token bucket, and fixed window algorithms using Upstash for API protection, brute force prevention, and fair usage enforcement
code_templates: null
design_tokens: null
---

# Rate Limiting Specialist

## Role

Designs and implements rate limiting strategies to protect APIs from abuse, brute force attacks, and resource exhaustion. Implements multiple algorithms (sliding window, token bucket, fixed window) at different granularities (per-user, per-IP, per-endpoint, per-API-key). Uses Upstash Ratelimit for serverless-compatible solutions and edge middleware for early rejection. Ensures legitimate users are never impacted while blocking abusive traffic.

## When to Use

- Protecting public API endpoints from abuse or scraping
- Preventing brute force attacks on login/auth endpoints
- Enforcing fair usage limits per user or API key
- Throttling expensive operations (AI calls, report generation, email sends)
- Implementing tiered rate limits for free vs paid plans
- Protecting webhook endpoints from replay storms
- Adding DDoS mitigation at the application layer

## Also Consider

- **security.md** — holistic security strategy beyond rate limiting
- **edge-computing.md** — rate limit at the edge for earliest possible rejection
- **monitoring.md** — alerting on rate limit triggers and abuse patterns
- **auth.md** — authentication context for per-user limits
- **caching.md** — cache rate limit counters for performance
- **background-jobs.md** — queue exceeded requests instead of rejecting

## Anti-Patterns (NEVER Do)

1. **NEVER rate limit only by IP** — NAT and VPNs mean thousands of legitimate users share IPs. Combine IP + user ID + fingerprint.
2. **NEVER use in-memory counters in serverless** — Memory resets on cold starts and doesn't share across instances. Use Redis/Upstash.
3. **NEVER return generic 500 for rate limits** — Always return 429 with `Retry-After` header. Clients need to know when to retry.
4. **NEVER apply the same limit to all endpoints** — Login needs 5/min. Product listing needs 100/min. Tailor limits to each endpoint's cost and risk.
5. **NEVER skip rate limiting on authenticated endpoints** — Compromised accounts can still abuse APIs. Rate limit everyone.
6. **NEVER block without logging** — Every rate limit trigger should be logged for security review and false positive detection.
7. **NEVER hardcode limits** — Store limits in config/env so they can be adjusted without redeployment.
8. **NEVER rate limit health check endpoints** — Monitoring systems need unrestricted access to health checks.

## Standards & Patterns

### Pattern 1: Upstash Ratelimit (Recommended)

```typescript
// lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Different limiters for different use cases
export const rateLimiters = {
  // General API: 100 requests per 60 seconds
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "60 s"),
    analytics: true,
    prefix: "ratelimit:api",
  }),

  // Auth endpoints: 5 attempts per 60 seconds
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "60 s"),
    analytics: true,
    prefix: "ratelimit:auth",
  }),

  // Expensive operations: 10 per hour
  expensive: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "3600 s"),
    analytics: true,
    prefix: "ratelimit:expensive",
  }),

  // Webhook receiver: 1000 per minute
  webhook: new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(1000, "60 s"),
    analytics: true,
    prefix: "ratelimit:webhook",
  }),
};
```

### Pattern 2: Rate Limit Middleware (Next.js)

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "60 s"),
  analytics: true,
});

export const config = {
  matcher: "/api/:path*",
};

export async function middleware(request: NextRequest) {
  // Skip health checks
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  // Determine identifier: user ID > API key > IP
  const userId = request.headers.get("x-user-id");
  const apiKey = request.headers.get("x-api-key");
  const ip = request.ip ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const identifier = userId ?? apiKey ?? ip;

  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  // Always set rate limit headers
  const response = success
    ? NextResponse.next()
    : NextResponse.json(
        { error: "Too many requests", retryAfter: Math.ceil((reset - Date.now()) / 1000) },
        { status: 429 }
      );

  response.headers.set("X-RateLimit-Limit", limit.toString());
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", reset.toString());

  if (!success) {
    response.headers.set("Retry-After", Math.ceil((reset - Date.now()) / 1000).toString());
  }

  return response;
}
```

### Pattern 3: Per-Route Rate Limiting

```typescript
// lib/rate-limit-handler.ts
import { NextRequest } from "next/server";
import { rateLimiters } from "./rate-limit";

type RateLimitTier = keyof typeof rateLimiters;

export async function withRateLimit(
  request: NextRequest,
  tier: RateLimitTier,
  identifier?: string
) {
  const id =
    identifier ??
    request.headers.get("x-user-id") ??
    request.ip ??
    "anonymous";

  const { success, limit, remaining, reset } = await rateLimiters[tier].limit(id);

  const headers = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": reset.toString(),
  };

  if (!success) {
    return {
      limited: true,
      response: Response.json(
        {
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      ),
    };
  }

  return { limited: false, headers };
}

// Usage in route handler
// app/api/ai/generate/route.ts
export async function POST(request: NextRequest) {
  const { limited, response, headers } = await withRateLimit(request, "expensive");
  if (limited) return response;

  // Process expensive operation...
  const result = await generateAIResponse(/* ... */);

  return Response.json(result, { headers });
}
```

### Pattern 4: Tiered Rate Limits (Free vs Paid)

```typescript
// lib/rate-limit-tiered.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const tiers: Record<string, Ratelimit> = {
  free: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "ratelimit:free",
  }),
  pro: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(200, "60 s"),
    prefix: "ratelimit:pro",
  }),
  enterprise: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(2000, "60 s"),
    prefix: "ratelimit:enterprise",
  }),
};

export async function tieredRateLimit(userId: string, plan: string) {
  const limiter = tiers[plan] ?? tiers.free;
  return limiter.limit(userId);
}
```

### Pattern 5: Brute Force Protection (Login)

```typescript
// app/api/auth/login/route.ts
import { rateLimiters } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.ip ?? "unknown";
  const body = await request.json();
  const email = body.email?.toLowerCase();

  // Rate limit by IP (prevents distributed brute force)
  const ipLimit = await rateLimiters.auth.limit(`ip:${ip}`);
  if (!ipLimit.success) {
    return Response.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Rate limit by email (prevents targeted account attacks)
  const emailLimit = await rateLimiters.auth.limit(`email:${email}`);
  if (!emailLimit.success) {
    return Response.json(
      { error: "Too many login attempts for this account. Try again later." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Proceed with authentication...
}
```

### Pattern 6: Custom Sliding Window (No External Service)

```sql
-- Postgres-based rate limiting (when Redis isn't available)
CREATE TABLE rate_limit_log (
  id BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_lookup
  ON rate_limit_log (identifier, endpoint, created_at);

-- Auto-cleanup old entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
  DELETE FROM rate_limit_log WHERE created_at < NOW() - INTERVAL '1 hour';
$$ LANGUAGE sql;

-- Check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_max_requests INT,
  p_window_seconds INT
) RETURNS BOOLEAN AS $$
DECLARE
  request_count INT;
BEGIN
  SELECT COUNT(*) INTO request_count
  FROM rate_limit_log
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at > NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  IF request_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limit_log (identifier, endpoint)
  VALUES (p_identifier, p_endpoint);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### Rate Limit Algorithm Comparison

| Algorithm | Best For | Behavior |
|---|---|---|
| Fixed Window | Simple counters, billing | Resets at interval boundary. Can allow 2x burst at window edge. |
| Sliding Window | Most API rate limits | Smooth, no boundary burst. Slightly more expensive to compute. |
| Token Bucket | Bursty traffic with steady average | Allows short bursts up to bucket size. Tokens refill at fixed rate. |
| Leaky Bucket | Strict throughput control | Smooths all traffic to constant rate. No bursts allowed. |

### Standard Rate Limit Headers

```
X-RateLimit-Limit: 100          # Max requests in window
X-RateLimit-Remaining: 42       # Requests left in current window
X-RateLimit-Reset: 1704067200   # Unix timestamp when window resets
Retry-After: 30                 # Seconds until client should retry (on 429)
```

## Code Templates

No dedicated templates — rate limiting is implemented inline per project. Use the Upstash Ratelimit patterns above as the standard approach.

## Checklist

- [ ] All public API endpoints have rate limits configured
- [ ] Auth endpoints have strict limits (5-10 per minute)
- [ ] Expensive operations have separate, tighter limits
- [ ] Rate limit responses return 429 with `Retry-After` header
- [ ] Standard `X-RateLimit-*` headers on all rate-limited responses
- [ ] Rate limiting uses persistent storage (Redis/Upstash), not in-memory
- [ ] Identifier combines user ID + IP (not just IP alone)
- [ ] Tiered limits for free/paid plans (if applicable)
- [ ] Health check endpoints excluded from rate limiting
- [ ] Rate limit triggers logged for security monitoring
- [ ] Limits configurable via environment variables
- [ ] Client-side handles 429 responses gracefully with retry logic

## Common Pitfalls

1. **IP-only limiting behind proxies** — Load balancers and CDNs mask real IPs. Use `X-Forwarded-For` and combine with user identity.
2. **Rate limiting static assets** — Applying middleware to `/api/*` is fine, but matching all routes catches CSS/JS/images. Always scope your matcher.
3. **Forgetting serverless instances don't share memory** — In-memory rate limiting with `Map()` doesn't work when each request may hit a different instance.
4. **Window boundary bursts** — Fixed window allows 2x the limit at the boundary (end of window 1 + start of window 2). Use sliding window for strict limits.
5. **Not communicating limits to API consumers** — Always document rate limits in API docs and return headers so clients can self-throttle.
6. **Over-aggressive limits on internal services** — Service-to-service calls within your own infrastructure should have higher limits or use API keys with elevated tiers.
