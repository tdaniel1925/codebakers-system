---
name: Monitoring & Observability Specialist
tier: infrastructure
triggers: monitoring, sentry, logging, alerting, uptime, health check, observability, error tracking, apm, tracing, log aggregation, incident response
depends_on: devops.md, backend.md, performance.md
conflicts_with: null
prerequisites: Sentry account (sentry.io), optional Axiom/Datadog/Betterstack
description: Sentry error tracking, uptime monitoring, structured logging, alerting, health checks, and APM — full observability stack for production applications with incident response workflows
code_templates: null
design_tokens: null
---

# Monitoring & Observability Specialist

## Role

Implements comprehensive production observability across error tracking (Sentry), uptime monitoring, structured logging, performance metrics, and alerting. Ensures every production issue is detected within minutes, triaged automatically, and routed to the right responder. Builds health check endpoints, configures alert thresholds, and establishes incident response patterns. Covers the full lifecycle: detect → alert → diagnose → resolve → post-mortem.

## When to Use

- Setting up error tracking for a new production application
- Configuring uptime monitoring and health check endpoints
- Implementing structured logging for debugging and audit trails
- Building alerting rules for critical business and infrastructure metrics
- Adding performance monitoring (APM) for slow routes and queries
- Establishing on-call and incident response workflows
- Diagnosing production issues with distributed tracing

## Also Consider

- **devops.md** — CI/CD pipeline integration with monitoring
- **performance.md** — performance budgets that feed into monitoring alerts
- **security.md** — security event logging and alerting
- **database-scaling.md** — database-specific monitoring (query performance, connection pools)
- **background-jobs.md** — job queue monitoring (failures, latency, dead letters)

## Anti-Patterns (NEVER Do)

1. **NEVER log sensitive data** — No passwords, tokens, credit cards, or PII in logs. Sanitize all log payloads.
2. **NEVER use `console.log` in production** — Use structured logging with levels (debug, info, warn, error). Console.log has no context, no filtering, and no routing.
3. **NEVER alert on every error** — Alert fatigue kills monitoring. Alert on actionable patterns (error rate spike, not individual errors).
4. **NEVER skip health check endpoints** — Every deployed service needs `/api/health` returning dependency status. Uptime monitors depend on this.
5. **NEVER rely only on client-side error reporting** — Ad blockers and network issues prevent client errors from reaching Sentry. Always have server-side logging too.
6. **NEVER ignore Sentry noise** — Unresolved Sentry issues grow unbounded. Triage weekly: resolve, ignore, or create tickets.
7. **NEVER log without correlation IDs** — Without request IDs, you can't trace a single user request across services. Add `x-request-id` to everything.
8. **NEVER deploy without monitoring configured** — Monitoring is not a post-launch task. It's a pre-launch requirement.

## Standards & Patterns

### Pattern 1: Sentry Setup (Next.js)

```bash
npx @sentry/wizard@latest -i nextjs
```

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    /^AbortError/,
  ],

  beforeSend(event) {
    // Scrub PII
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    return event;
  },
});
```

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

```typescript
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
```

### Pattern 2: Health Check Endpoint

```typescript
// app/api/health/route.ts
import { createClient } from "@supabase/supabase-js";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, {
    status: "pass" | "fail";
    latency_ms: number;
    message?: string;
  }>;
}

const startTime = Date.now();

export async function GET() {
  const checks: HealthCheck["checks"] = {};

  // Check database
  const dbStart = Date.now();
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    await supabase.from("_health").select("1").limit(1).single();
    checks.database = { status: "pass", latency_ms: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: "fail",
      latency_ms: Date.now() - dbStart,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Check Redis (if used)
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const redisStart = Date.now();
    try {
      const res = await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/ping`,
        { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } }
      );
      checks.redis = {
        status: res.ok ? "pass" : "fail",
        latency_ms: Date.now() - redisStart,
      };
    } catch {
      checks.redis = { status: "fail", latency_ms: Date.now() - redisStart };
    }
  }

  // Determine overall status
  const allPassing = Object.values(checks).every((c) => c.status === "pass");
  const anyFailing = Object.values(checks).some((c) => c.status === "fail");

  const health: HealthCheck = {
    status: allPassing ? "healthy" : anyFailing ? "unhealthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  return Response.json(health, {
    status: health.status === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
```

### Pattern 3: Structured Logging

```typescript
// lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    service: process.env.SERVICE_NAME ?? "app",
    ...context,
  };

  // Sanitize sensitive fields
  const sanitized = sanitizeLog(entry);

  // In production, output JSON for log aggregation
  if (process.env.NODE_ENV === "production") {
    const output = JSON.stringify(sanitized);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  } else {
    // Pretty print in development
    console[level === "error" ? "error" : "log"](
      `[${level.toUpperCase()}] ${message}`,
      context ?? ""
    );
  }
}

function sanitizeLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "token", "secret", "authorization", "cookie", "ssn", "creditCard"];
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    }
  }

  return sanitized;
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};
```

### Pattern 4: Request Correlation IDs

```typescript
// middleware.ts (add to existing middleware)
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);

  // Pass to server components via header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
```

```typescript
// Usage in API routes
import { headers } from "next/headers";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const headersList = headers();
  const requestId = headersList.get("x-request-id") ?? "unknown";

  logger.info("Processing order", { requestId, action: "order.create" });

  try {
    const order = await createOrder(/* ... */);
    logger.info("Order created", { requestId, orderId: order.id, duration_ms: elapsed });
    return Response.json(order);
  } catch (error) {
    logger.error("Order creation failed", {
      requestId,
      action: "order.create",
      error: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}
```

### Pattern 5: Custom Sentry Context

```typescript
// lib/sentry-helpers.ts
import * as Sentry from "@sentry/nextjs";

// Set user context after authentication
export function setSentryUser(user: { id: string; email: string; plan: string }) {
  Sentry.setUser({ id: user.id, email: user.email });
  Sentry.setTag("plan", user.plan);
}

// Track business-critical operations
export async function trackOperation<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  return Sentry.startSpan({ name, op: "function", attributes: tags }, async () => {
    try {
      return await fn();
    } catch (error) {
      Sentry.captureException(error, {
        tags,
        extra: { operation: name },
      });
      throw error;
    }
  });
}

// Capture business events (not errors)
export function trackBusinessEvent(
  event: string,
  data: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    category: "business",
    message: event,
    data,
    level: "info",
  });
}
```

### Pattern 6: Alerting Rules

```typescript
// Sentry alert configuration (via Sentry UI or API)
// These are the recommended alert rules for every project:

const alertRules = [
  {
    name: "Error Rate Spike",
    trigger: "Error count > 50 in 5 minutes",
    action: "Slack #alerts + PagerDuty",
    priority: "critical",
  },
  {
    name: "Health Check Down",
    trigger: "/api/health returns non-200 for 2 consecutive checks",
    action: "Slack #alerts + PagerDuty",
    priority: "critical",
  },
  {
    name: "Slow Response Time",
    trigger: "p95 response time > 3s for 5 minutes",
    action: "Slack #performance",
    priority: "warning",
  },
  {
    name: "Dead Letter Queue Growth",
    trigger: "Dead letter count increases by > 10 in 1 hour",
    action: "Slack #alerts",
    priority: "warning",
  },
  {
    name: "Database Connection Pool",
    trigger: "Active connections > 80% of pool max",
    action: "Slack #infrastructure",
    priority: "warning",
  },
  {
    name: "Rate Limit Abuse",
    trigger: "Same IP hits rate limit > 100 times in 10 minutes",
    action: "Slack #security",
    priority: "info",
  },
];
```

### Monitoring Stack Recommendations

| Concern | Tool | Why |
|---|---|---|
| Error tracking | Sentry | Best-in-class, source maps, replay |
| Uptime monitoring | BetterStack or Checkly | Synthetic checks from multiple regions |
| Log aggregation | Axiom or Vercel Logs | Structured log search and analysis |
| APM / Tracing | Sentry Performance | Already integrated, no extra tool |
| Alerting | Sentry Alerts + Slack | Native integration, customizable rules |
| Infrastructure | Vercel Analytics | Built-in for Vercel-hosted apps |
| Database | Supabase Dashboard | Built-in query performance and connection stats |

## Code Templates

No dedicated templates — monitoring setup is inline per project. Use patterns above as standard implementation.

## Checklist

- [ ] Sentry initialized for client, server, and edge runtimes
- [ ] Sentry DSN stored in environment variables, not hardcoded
- [ ] PII scrubbed from Sentry events (`beforeSend` filter)
- [ ] `/api/health` endpoint returns dependency status
- [ ] Structured logging with JSON output in production
- [ ] Correlation IDs (`x-request-id`) on all requests
- [ ] Sensitive data redacted from all log outputs
- [ ] Alert rules configured for error rate, uptime, and slow responses
- [ ] Uptime monitor checking `/api/health` from multiple regions
- [ ] Error tracking verified with test error post-deploy
- [ ] Log levels used correctly (debug/info/warn/error)
- [ ] Sentry performance sampling configured (0.1 for production)
- [ ] Slack integration for alerts configured
- [ ] Noisy errors filtered in Sentry (`ignoreErrors`)

## Common Pitfalls

1. **Sentry quota exhaustion** — Without `tracesSampleRate` and `ignoreErrors`, Sentry quota fills up fast. Always sample traces at 0.1 (10%) in production.
2. **Alert fatigue** — Too many low-priority alerts train the team to ignore all alerts. Start with 3-5 critical alerts only, expand gradually.
3. **Missing source maps** — Sentry errors without source maps are unreadable. Ensure `@sentry/nextjs` plugin uploads source maps during build.
4. **Logging in hot paths** — Logging every database query or cache hit adds overhead. Use debug level for verbose logs and only enable when investigating issues.
5. **No baseline metrics** — You can't detect anomalies without knowing what's normal. Establish baselines for error rate, response time, and throughput before setting alert thresholds.
6. **Health checks that lie** — A health check that only returns 200 without checking dependencies is useless. Always verify database, Redis, and critical external services.
