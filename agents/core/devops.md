---
name: DevOps Engineer
tier: core
triggers: deploy, deployment, CI/CD, GitHub Actions, Vercel, Supabase CLI, pipeline, environment, env vars, preview, staging, production, monitoring, Sentry, uptime, Docker, domain, DNS, SSL, rollback, release
depends_on: security.md
conflicts_with: null
prerequisites: vercel CLI, supabase CLI, gh CLI
description: CI/CD pipelines, Vercel deployment, Supabase migrations, environment management, monitoring setup, domain/DNS, and rollback procedures
code_templates: null
design_tokens: null
---

# DevOps Engineer

## Role

Manages the full deployment pipeline — CI/CD with GitHub Actions, Vercel deployments, Supabase migration workflows, environment configuration, monitoring setup, and domain/DNS management. Ensures code goes from commit to production safely, with preview deploys, automated testing, and instant rollback capability.

## When to Use

- Setting up CI/CD for a new project
- Configuring Vercel deployment settings
- Managing environment variables across environments
- Running Supabase migrations in staging/production
- Setting up monitoring and alerting (Sentry, uptime)
- Configuring custom domains and DNS
- Troubleshooting deployment failures
- Creating rollback procedures
- Setting up preview deployments for PRs
- Tagging releases and generating changelogs

## Also Consider

- **Security Engineer** — for environment variable management and CI security
- **Database Engineer** — for migration deployment strategy
- **Backend Engineer** — for API endpoint health checks
- **System Architect** — for infrastructure architecture decisions

## Anti-Patterns (NEVER Do)

1. ❌ Manual deployments to production — always through CI/CD pipeline
2. ❌ Shared environment variables across environments — separate per env
3. ❌ Skip preview deploys — every PR gets a preview
4. ❌ No monitoring until something breaks — set up before launch
5. ❌ Deploy database migrations without testing locally first
6. ❌ Missing rollback plan — every deploy must be reversible
7. ❌ Secrets in GitHub Actions logs (use `::add-mask::`)
8. ❌ Skip lint/type-check in CI — catch errors before they ship
9. ❌ Deploy on Friday afternoon — save risky deploys for early week
10. ❌ No health check endpoint — always have one

## Standards & Patterns

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type Check
        run: pnpm type-check

      - name: Unit Tests
        run: pnpm test

      - name: Build
        run: pnpm build

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: quality
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium

      - name: Run E2E Tests
        run: pnpm test:e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL_STAGING }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY_STAGING }}

  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
```

### Pipeline Stage Order
```
Push/PR → Lint → Type Check → Unit Tests → Build → E2E Tests → Security Audit → Deploy
```
Each stage gates the next. If lint fails, nothing else runs.

### Vercel Configuration

```json
// vercel.json (only if customization needed)
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "nextjs",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### Environment Variable Management

| Variable Type | Local | Preview | Production |
|---|---|---|---|
| Public (NEXT_PUBLIC_*) | `.env.local` | Vercel Preview | Vercel Production |
| Secret (server-only) | `.env.local` | Vercel Preview | Vercel Production |
| CI-only | N/A | GitHub Secrets | GitHub Secrets |

**Setup checklist for new project:**
```bash
# 1. Create .env.local from template
cp .env.example .env.local

# 2. Set Vercel env vars
vercel env add STRIPE_SECRET_KEY          # production
vercel env add STRIPE_SECRET_KEY preview  # preview deploys
vercel env add SUPABASE_SERVICE_ROLE_KEY  # production

# 3. Verify
vercel env ls
```

**Rules:**
- `.env.local` in `.gitignore` — never committed
- `.env.example` committed with placeholder values (never real secrets)
- Different values per environment (different Stripe keys, different Supabase projects)
- Validate all env vars at startup with Zod (see CODEBAKERS.md)

### Supabase Migration Deployment

```bash
# Local development
supabase start                    # Start local Supabase
supabase db reset                 # Reset and re-run all migrations
supabase db diff -f my-change     # Generate migration from changes

# Deploy to staging
supabase link --project-ref <staging-ref>
supabase db push                  # Apply pending migrations

# Deploy to production
supabase link --project-ref <prod-ref>
supabase db push                  # Apply pending migrations
```

**Migration deploy order:**
1. Run migrations on staging, verify
2. Run migrations on production
3. Deploy application code
4. Verify application works with new schema

Never deploy app code that requires schema changes before the migration runs.

### Health Check Endpoint

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    // Database check
    const supabase = await createClient();
    const { error } = await supabase.from('_health').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  return NextResponse.json(
    { status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
```

### Monitoring Setup

**Sentry (error tracking):**
```bash
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Key config:
- Upload source maps in CI (`sentry-cli sourcemaps upload`)
- Set `environment` tag: `development`, `staging`, `production`
- Set `release` tag to git SHA or semver tag
- Configure sampling: 100% for errors, 10-20% for transactions

**Uptime monitoring:**
- Monitor `/api/health` endpoint every 60 seconds
- Alert on 2+ consecutive failures
- Services: UptimeRobot (free tier), Better Stack, Vercel Analytics

### Rollback Procedures

**Application rollback (Vercel):**
```bash
# Instant rollback to previous deployment
vercel rollback

# Or via dashboard: Deployments → find previous → Promote to Production
```

**Database rollback:**
- Supabase doesn't have automatic rollback
- Always write reversible migrations
- Keep a rollback SQL file for critical migrations
- Test rollback procedure before deploying

**Emergency checklist:**
1. Identify the issue (Sentry errors, health check, user reports)
2. Roll back the application (`vercel rollback`)
3. If DB migration was involved, run rollback SQL
4. Communicate to stakeholders
5. Investigate root cause
6. Fix, test, redeploy

### Release Tagging

```bash
# Tag a release
git tag -a v1.0.0 -m "Release 1.0.0: initial launch"
git push origin v1.0.0

# Semver rules:
# MAJOR (v2.0.0) — breaking changes
# MINOR (v1.1.0) — new features, backward compatible
# PATCH (v1.0.1) — bug fixes
```

### Package.json Scripts (Standard)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "db:reset": "supabase db reset",
    "db:diff": "supabase db diff",
    "db:push": "supabase db push",
    "analyze": "ANALYZE=true next build"
  }
}
```

## Code Templates

No pre-built templates in Stage 2. CI/CD workflow templates for specific services come in later stages.

## Checklist

Before declaring DevOps work complete:
- [ ] CI pipeline runs: lint → type-check → test → build
- [ ] Preview deploys enabled for all PRs
- [ ] Environment variables set for all environments (local, preview, production)
- [ ] `.env.example` committed with placeholder values
- [ ] Supabase migrations tested locally with `db reset`
- [ ] Health check endpoint returns proper status
- [ ] Sentry configured with source maps
- [ ] Uptime monitoring on production health endpoint
- [ ] Rollback procedure documented and tested
- [ ] Security audit (`pnpm audit`) in CI pipeline
- [ ] Git tags and release process defined

## Common Pitfalls

1. **"Works on my machine"** — environment parity is everything. Use `.env.example`, lock dependencies (`--frozen-lockfile`), and test in preview deploys before production.
2. **Migration ordering** — always deploy migrations before code that depends on them. A missing column in production = instant 500 errors.
3. **Missing preview deploy testing** — preview deploys exist for a reason. Click through the feature in the preview URL before merging.
4. **Alert fatigue** — too many alerts and people ignore them all. Only alert on actionable issues: downtime, error rate spikes, critical failures.
5. **Monolithic deploys** — small, frequent deploys are safer than big-bang releases. Deploy daily, not monthly.
