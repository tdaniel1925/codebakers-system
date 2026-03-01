---
name: Monitoring Setup Specialist
tier: meta
triggers: monitoring setup, sentry setup, uptime monitoring, alerting setup, post-deploy monitoring, error tracking, health checks, observability, logging setup, apm, application monitoring, pagerduty, betterstack, uptime
depends_on: devops.md, monitoring.md, ci-cd.md
conflicts_with: null
prerequisites: null
description: Auto-configures production monitoring stack post-deploy — Sentry error tracking, uptime monitoring, health check endpoints, structured logging, alert routing, and incident response dashboards
code_templates: null
design_tokens: null
---

# Monitoring Setup Specialist

## Role

Configures the complete production monitoring stack for every deployed project. This is the agent that runs after deployment to ensure nothing goes undetected in production — errors are captured, downtime is alerted on, performance is tracked, and the team knows about problems before clients do. Focuses on practical, opinionated setup rather than monitoring theory (see `monitoring.md` for deeper infrastructure monitoring patterns).

## When to Use

- Project just deployed to production for the first time
- Adding error tracking to an existing project
- Setting up uptime monitoring and status pages
- Configuring alert routing (who gets notified and how)
- Adding structured logging for debugging production issues
- Post-deploy checklist includes "set up monitoring"
- Client asks "how will we know if something breaks?"
- Incident occurred and monitoring gaps were exposed

## Also Consider

- **monitoring.md** — deeper infrastructure monitoring patterns (database, server metrics, custom dashboards)
- **devops.md** — deployment pipeline and environment configuration
- **ci-cd.md** — post-deploy health checks in GitHub Actions
- **performance.md** — performance budgets and Core Web Vitals tracking
- **security.md** — security event monitoring and audit logging

## Anti-Patterns (NEVER Do)

- **NEVER deploy without error tracking** — every production app must have Sentry or equivalent from day one
- **NEVER alert on everything** — alert fatigue makes teams ignore real problems; only alert on actionable items
- **NEVER send all alerts to the same channel** — critical alerts need different routing than warnings
- **NEVER log sensitive data** — no passwords, tokens, credit card numbers, PII in logs or error reports
- **NEVER skip source maps in Sentry** — without them, error stack traces are useless minified garbage
- **NEVER use console.log as your production logging strategy** — use structured logging with levels
- **NEVER set up monitoring without testing it** — trigger a test error and confirm the alert arrives
- **NEVER monitor only the happy path** — monitor error rates, not just uptime

## Standards & Patterns

### Monitoring Stack (Recommended)

```
Every BotMakers project ships with:

Error Tracking:     Sentry (free tier covers most projects)
Uptime Monitoring:  BetterStack (or UptimeRobot for budget projects)
Logging:            Vercel Logs + structured logging in code
Performance:        Vercel Analytics + Web Vitals
Status Page:        BetterStack Status Page (client-facing)
Alerting:           Sentry → Slack/Email, BetterStack → Slack/Email
```

### Sentry Setup (Next.js)

**Step 1: Install and initialize**
```bash
npx @sentry/wizard@latest -i nextjs
```

This auto-generates:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- Updates `next.config.ts` with Sentry webpack plugin

**Step 2: Configure `sentry.client.config.ts`**
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  environment: process.env.NODE_ENV,
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session replay for debugging (captures user actions before error)
  replaysSessionSampleRate: 0.01,  // 1% of sessions
  replaysOnErrorSampleRate: 1.0,   // 100% of sessions with errors
  
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,       // Privacy: mask all text
      blockAllMedia: true,     // Privacy: block media
    }),
  ],

  // Filter noisy errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    /Loading chunk \d+ failed/,
    'Network request failed',
  ],

  // Don't send errors in development
  enabled: process.env.NODE_ENV === 'production',
});
```

**Step 3: Configure `sentry.server.config.ts`**
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV === 'production',
});
```

**Step 4: Add error boundary for React**
```typescript
// app/global-error.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>Our team has been notified and is looking into it.</p>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}

// app/error.tsx (per-route error boundary)
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

**Step 5: Upload source maps (in CI/CD)**
```yaml
# In deploy workflow, after build
- name: Upload Sentry source maps
  run: npx @sentry/cli sourcemaps upload .next --org $SENTRY_ORG --project $SENTRY_PROJECT
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

**Step 6: Add custom context to errors**
```typescript
// Attach user context after authentication
import * as Sentry from '@sentry/nextjs';

export function setUserContext(user: { id: string; email: string; role: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    // Never include passwords, tokens, or sensitive data
  });
  Sentry.setTag('user_role', user.role);
}

// Add breadcrumbs for debugging context
export function trackAction(action: string, data?: Record<string, string>) {
  Sentry.addBreadcrumb({
    category: 'user-action',
    message: action,
    data,
    level: 'info',
  });
}

// Capture errors with extra context in API routes
export function captureApiError(error: unknown, context: Record<string, unknown>) {
  Sentry.withScope((scope) => {
    scope.setExtras(context);
    scope.setTag('error_source', 'api');
    Sentry.captureException(error);
  });
}
```

### Health Check Endpoint

Every project MUST have this endpoint. Monitoring tools ping it to detect downtime.

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, 'ok' | 'error' | 'degraded'>;
  version: string;
  uptime: number;
  timestamp: string;
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse<HealthCheck>> {
  const checks: Record<string, 'ok' | 'error' | 'degraded'> = {};

  // Check database
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const start = Date.now();
    await supabase.from('_health').select('count').limit(1).single();
    const duration = Date.now() - start;
    checks.database = duration < 2000 ? 'ok' : 'degraded';
  } catch {
    checks.database = 'error';
  }

  // Check required environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  checks.environment = requiredEnvVars.every((v) => !!process.env[v])
    ? 'ok'
    : 'error';

  // Aggregate status
  const values = Object.values(checks);
  const hasError = values.includes('error');
  const hasDegraded = values.includes('degraded');
  const status = hasError ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

  return NextResponse.json(
    {
      status,
      checks,
      version: process.env.npm_package_version || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    },
    { status: status === 'healthy' ? 200 : 503 }
  );
}
```

**Create the health table in Supabase:**
```sql
-- Simple table that exists purely so the health check can query something
CREATE TABLE IF NOT EXISTS _health (
  id int PRIMARY KEY DEFAULT 1,
  checked_at timestamptz DEFAULT now()
);
INSERT INTO _health (id) VALUES (1) ON CONFLICT DO NOTHING;

-- No RLS needed — health check uses service role key
```

### Uptime Monitoring Setup

**BetterStack (recommended):**
```
Configuration:
├── Monitor URL: https://[app-domain]/api/health
├── Check interval: 60 seconds
├── Request timeout: 10 seconds
├── Expected status code: 200
├── Alert after: 2 consecutive failures
├── Regions: US East + US West (or closest to users)
├── Alert channels: Slack + Email
└── Status page: Enable for client-facing status

Additional monitors:
├── Homepage: https://[app-domain]/ (basic HTTP check)
├── API root: https://[app-domain]/api/v1/ (if applicable)
└── Critical third-party: Supabase project URL status
```

**UptimeRobot (budget alternative):**
```
Free tier: 50 monitors, 5-minute intervals
├── HTTP monitor: /api/health expecting 200
├── Keyword monitor: homepage expecting specific text
└── Alert contacts: email + Slack webhook
```

### Structured Logging

```typescript
// lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context) {
    // Strip sensitive fields
    const { password, token, secret, authorization, cookie, ...safe } = context as Record<string, unknown>;
    entry.context = safe;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    };
  }

  return entry;
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify(createLogEntry('debug', message, context)));
    }
  },

  info(message: string, context?: Record<string, unknown>) {
    console.log(JSON.stringify(createLogEntry('info', message, context)));
  },

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(JSON.stringify(createLogEntry('warn', message, context)));
  },

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    console.error(JSON.stringify(createLogEntry('error', message, context, error ?? undefined)));
  },
};

// Usage
logger.info('Order created', { orderId: '123', userId: 'abc', amount: 99.99 });
logger.error('Payment failed', new Error('Card declined'), { orderId: '123' });
```

### Alert Routing

```
Severity → Channel → Response Time
─────────────────────────────────────────────
🔴 CRITICAL (site down, data loss)
   → Slack #alerts-critical + Email + SMS/Phone
   → Response: immediately (< 15 min)

🟠 HIGH (feature broken, error spike)
   → Slack #alerts-high + Email
   → Response: within 1 hour

🟡 MEDIUM (degraded performance, non-critical errors)
   → Slack #alerts-medium
   → Response: within 24 hours

🔵 LOW (warnings, informational)
   → Slack #alerts-low (muted channel)
   → Response: next business day

Alert rules:
├── Error rate > 5% of requests in 5 min → 🔴 CRITICAL
├── Health check fails 2 consecutive times → 🔴 CRITICAL
├── Error rate > 1% of requests in 15 min → 🟠 HIGH
├── P95 response time > 3 seconds → 🟡 MEDIUM
├── New unhandled error type appears → 🟡 MEDIUM
├── Daily error count > 2x previous day → 🟡 MEDIUM
└── Disk/memory usage > 80% → 🟡 MEDIUM
```

### Sentry Alert Configuration

```
Recommended Sentry alert rules:

1. "High error volume"
   ├── When: Number of events > 50 in 1 hour
   ├── Filter: is:unresolved
   ├── Action: Slack #alerts-high
   └── Frequency: Once per issue

2. "New unhandled error"
   ├── When: A new issue is created
   ├── Filter: is:unresolved, !level:info
   ├── Action: Slack #alerts-medium
   └── Frequency: Once per issue

3. "Error spike"
   ├── When: Event frequency > 300% of normal
   ├── Filter: is:unresolved
   ├── Action: Slack #alerts-critical + Email
   └── Frequency: Once per hour

4. "Slow transaction"
   ├── When: P95 transaction duration > 3000ms
   ├── Filter: transaction.duration:>3000
   ├── Action: Slack #alerts-medium
   └── Frequency: Once per day
```

### Vercel Analytics Setup

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### Post-Deploy Monitoring Checklist

Run this checklist after every production deployment:

```markdown
## Post-Deploy Monitoring Verification

### Immediate (within 5 minutes)
- [ ] Health check endpoint returns 200
- [ ] Sentry receiving events (trigger a test error)
- [ ] Uptime monitor shows green
- [ ] No spike in error rate on Sentry dashboard

### Within 1 hour
- [ ] Key user flows work (login, core feature, payment if applicable)
- [ ] No new unhandled errors in Sentry
- [ ] Response times within normal range
- [ ] Database connections stable

### Within 24 hours
- [ ] Error rate compared to previous day (should be equal or lower)
- [ ] Performance metrics compared to previous day
- [ ] No user-reported issues
- [ ] Scheduled jobs / cron tasks ran successfully
```

### Environment Variables for Monitoring

```bash
# .env.local (development — monitoring disabled)
NEXT_PUBLIC_SENTRY_DSN=        # Empty = Sentry disabled locally
SENTRY_AUTH_TOKEN=              # Only needed in CI for source maps

# .env.production (via Vercel environment variables)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
SENTRY_ORG=botmakers
SENTRY_PROJECT=project-name
SENTRY_AUTH_TOKEN=sntrys_xxx    # For source map uploads in CI
```

## Code Templates

No dedicated code templates. All setup patterns are inline above. The key files to create per project:
- `sentry.client.config.ts` — client-side error tracking
- `sentry.server.config.ts` — server-side error tracking
- `app/api/health/route.ts` — health check endpoint
- `app/global-error.tsx` — React error boundary with Sentry
- `lib/logger.ts` — structured logging utility

## Checklist

Before declaring monitoring setup complete:

- [ ] Sentry installed and configured (client + server)
- [ ] Sentry DSN set in production environment variables
- [ ] Source map upload configured in CI/CD pipeline
- [ ] Global error boundary captures and reports React errors
- [ ] Health check endpoint exists at `/api/health`
- [ ] Uptime monitor pinging health endpoint every 60 seconds
- [ ] Alert routing configured (critical → immediate, low → async)
- [ ] Slack integration active for alert channels
- [ ] Noisy/irrelevant errors filtered in Sentry config
- [ ] No sensitive data in logs or error reports (PII, tokens, passwords)
- [ ] Structured logging utility in place (`lib/logger.ts`)
- [ ] Vercel Analytics and Speed Insights enabled
- [ ] Test error triggered and confirmed arriving in Sentry
- [ ] Test alert triggered and confirmed arriving in Slack/email
- [ ] Team members have access to Sentry and monitoring dashboards

## Common Pitfalls

1. **No source maps in production** — Sentry captures errors but stack traces point to minified code like `a.js:1:4523`. Useless. Always upload source maps in CI.

2. **Alert fatigue** — alerting on every error, including expected ones like network timeouts, trains the team to ignore alerts. Filter noisy errors and set meaningful thresholds.

3. **Monitoring only uptime** — a site can return 200 while the database is down, payments are failing, and half the features are broken. Monitor the health check that tests actual dependencies, not just "is the server responding."

4. **Logging sensitive data** — `logger.error('Login failed', { email, password })` in production is a compliance violation. Always strip sensitive fields before logging.

5. **Not testing the monitoring** — setting up Sentry without triggering a test error means you discover it's misconfigured during a real incident. Always verify the full chain: error → Sentry → alert → notification.

6. **Same alert channel for everything** — if critical outages and minor warnings go to the same Slack channel, critical alerts get lost. Separate channels by severity with different notification settings.
