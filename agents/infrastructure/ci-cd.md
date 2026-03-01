---
name: CI/CD Pipeline Specialist
tier: infrastructure
triggers: ci/cd, github actions, continuous integration, continuous deployment, preview deploys, test automation, release pipeline, deploy workflow, pull request checks, automated testing, semantic versioning, deploy previews, rollback, blue-green
depends_on: devops.md, qa.md, security.md, monitoring.md
conflicts_with: null
prerequisites: gh CLI (brew install gh || apt install gh), vercel CLI (npm i -g vercel)
description: GitHub Actions CI/CD pipelines — automated testing, lint/type checks, preview deploys, production releases, semantic versioning, rollback strategies, and branch protection enforcement
code_templates: null
design_tokens: null
---

# CI/CD Pipeline Specialist

## Role

Designs and maintains automated CI/CD pipelines that catch bugs before they reach production, deploy safely with preview environments, and enable confident releases with rollback capability. Owns the full path from pull request to production — linting, type checking, testing, building, deploying, and monitoring the deploy. Ensures every project has a pipeline that is fast, reliable, and requires zero manual steps after merge.

## When to Use

- Setting up CI/CD for a new project from scratch
- Adding or fixing GitHub Actions workflows
- Preview deploy configuration for Vercel or other platforms
- Automating test runs on pull requests
- Setting up branch protection rules
- Release versioning and changelog generation
- Deploy failures or flaky CI investigations
- Rollback procedures after a bad deploy
- Monorepo CI configuration with path-based triggers
- Optimizing slow CI pipelines (caching, parallelism)
- Environment variable management across staging/production
- Setting up database migration automation in CI

## Also Consider

- **devops.md** — broader deployment strategy, Vercel/Supabase CLI config, environment setup
- **qa.md** — test planning and test writing (this agent runs those tests in CI)
- **security.md** — secret scanning, dependency audit in pipeline
- **monitoring.md** — post-deploy health checks and alerting
- **database.md** — migration safety in deploy pipelines

## Anti-Patterns (NEVER Do)

- **NEVER store secrets in workflow files** — use GitHub Secrets or environment-level secrets exclusively
- **NEVER skip type checking in CI** — `tsc --noEmit` catches what tests miss; always include it
- **NEVER allow direct pushes to main** — enforce branch protection with required status checks
- **NEVER run the full test suite for documentation-only changes** — use path filters to skip unnecessary jobs
- **NEVER deploy without a build step succeeding first** — build failures must block deploy
- **NEVER use `actions/checkout@v2` or other outdated action versions** — always pin to latest major (`@v4`)
- **NEVER hardcode Node versions** — use a matrix or `.nvmrc` for consistency
- **NEVER skip caching `node_modules`** — uncached installs add 1-3 minutes per run
- **NEVER use `continue-on-error: true` on critical checks** — this silently passes failures
- **NEVER run migrations automatically on production deploy without review** — migrations need a manual gate or separate workflow
- **NEVER expose preview deploy URLs with production data** — preview environments use staging/seed data only

## Standards & Patterns

### Pipeline Architecture

```
Pull Request opened:
├── Lint (ESLint + Prettier check)
├── Type Check (tsc --noEmit)
├── Unit Tests (Vitest/Jest)
├── Integration Tests (if applicable)
├── Build (next build)
├── Preview Deploy (Vercel auto)
└── Security Audit (npm audit, secret scan)

Merge to main:
├── All PR checks pass (required)
├── Production Build
├── Database Migrations (manual gate for breaking changes)
├── Production Deploy
├── Post-deploy Health Check
├── Smoke Tests
└── Notify (Slack/Discord on success or failure)

Release:
├── Tag with semantic version
├── Generate changelog
├── Create GitHub Release
└── Archive artifacts
```

### Standard PR Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '.vscode/**'

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx prettier --check .

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  test:
    name: Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm audit --audit-level=high
        continue-on-error: false
```

### Production Deploy Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy Production

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false  # Never cancel in-progress deploys

env:
  NODE_VERSION: '20'
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Deploy to Vercel
        id: deploy
        run: |
          npm i -g vercel
          DEPLOY_URL=$(vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }} 2>&1 | grep -o 'https://[^ ]*')
          echo "url=$DEPLOY_URL" >> $GITHUB_OUTPUT

      - name: Post-deploy Health Check
        run: |
          sleep 10
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ steps.deploy.outputs.url }}/api/health")
          if [ "$STATUS" != "200" ]; then
            echo "Health check failed with status $STATUS"
            exit 1
          fi
          echo "Health check passed"

      - name: Notify Success
        if: success()
        run: |
          echo "✅ Deployed to ${{ steps.deploy.outputs.url }}"
          # Add Slack/Discord webhook notification here

      - name: Notify Failure
        if: failure()
        run: |
          echo "❌ Deploy failed"
          # Add Slack/Discord failure webhook here
```

### Database Migration Workflow

```yaml
# .github/workflows/migrate.yml
name: Database Migration

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  migrate-staging:
    name: Migrate Staging
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Link to staging project
        run: supabase link --project-ref ${{ secrets.SUPABASE_STAGING_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - name: Run migrations on staging
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  migrate-production:
    name: Migrate Production
    runs-on: ubuntu-latest
    needs: [migrate-staging]
    environment: production  # Requires manual approval in GitHub settings
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Link to production project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PRODUCTION_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - name: Run migrations on production
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### Branch Protection Rules

```
Required for main branch:
├── Require pull request before merging
│   ├── Require at least 1 approval (optional for solo devs)
│   └── Dismiss stale reviews on new pushes
├── Require status checks to pass
│   ├── CI / Lint & Format
│   ├── CI / Type Check
│   ├── CI / Tests
│   └── CI / Build
├── Require branches to be up to date
├── Require conversation resolution before merging
└── Do not allow bypassing the above settings

Setup command:
gh api repos/{owner}/{repo}/branches/main/protection -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["lint","typecheck","test","build"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1}'
```

### Caching Strategy for Fast CI

```yaml
# Aggressive caching — cuts 1-3 min per job
- uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: 'npm'  # Caches ~/.npm automatically

# For monorepos or when you need node_modules cached directly
- name: Cache node_modules
  uses: actions/cache@v4
  id: cache-deps
  with:
    path: node_modules
    key: deps-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

- name: Install dependencies
  if: steps.cache-deps.outputs.cache-hit != 'true'
  run: npm ci

# Cache Next.js build
- name: Cache Next.js build
  uses: actions/cache@v4
  with:
    path: .next/cache
    key: nextjs-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
    restore-keys: |
      nextjs-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
```

### Preview Deploys

```
Vercel auto-preview (recommended):
├── Every PR gets a unique URL automatically
├── URL posted as PR comment by Vercel bot
├── Preview uses staging environment variables
├── Destroyed automatically when PR is closed
└── No workflow needed — Vercel GitHub integration handles it

Manual preview deploy (when you need more control):
├── Triggered on PR events
├── Deploys to Vercel without --prod flag
├── Posts URL as PR comment via GitHub API
└── Useful when you need pre-deploy steps (seed data, migrations)
```

```yaml
# .github/workflows/preview.yml (manual preview control)
name: Preview Deploy

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Deploy Preview
        id: deploy
        run: |
          npm i -g vercel
          URL=$(vercel deploy --token=${{ secrets.VERCEL_TOKEN }} 2>&1 | grep -o 'https://[^ ]*')
          echo "url=$URL" >> $GITHUB_OUTPUT
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `🚀 Preview deployed: ${{ steps.deploy.outputs.url }}`
            })
```

### Semantic Versioning & Releases

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:
    inputs:
      bump:
        description: 'Version bump type'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Need full history for changelog

      - name: Bump version
        id: version
        run: |
          CURRENT=$(node -p "require('./package.json').version")
          NEW=$(npx semver $CURRENT -i ${{ inputs.bump }})
          npm version $NEW --no-git-tag-version
          echo "version=$NEW" >> $GITHUB_OUTPUT
          echo "Bumping $CURRENT → $NEW"

      - name: Generate changelog
        id: changelog
        run: |
          LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
          if [ -z "$LAST_TAG" ]; then
            CHANGES=$(git log --oneline --pretty=format:"- %s (%h)" HEAD)
          else
            CHANGES=$(git log --oneline --pretty=format:"- %s (%h)" $LAST_TAG..HEAD)
          fi
          echo "changes<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Commit and tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add package.json
          git commit -m "chore: release v${{ steps.version.outputs.version }}"
          git tag "v${{ steps.version.outputs.version }}"
          git push origin main --tags

      - name: Create GitHub Release
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.repos.createRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              tag_name: 'v${{ steps.version.outputs.version }}',
              name: 'v${{ steps.version.outputs.version }}',
              body: `## Changes\n\n${{ steps.changelog.outputs.changes }}`,
              draft: false,
              prerelease: false
            })
```

### Health Check Endpoint

Every project MUST have a health endpoint for post-deploy verification:

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Check database connectivity
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from('_health').select('count').limit(1);
    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
  }

  // Check environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];
  checks.env = requiredEnvVars.every((v) => process.env[v]) ? 'ok' : 'error';

  const healthy = Object.values(checks).every((v) => v === 'ok');

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      version: process.env.npm_package_version || 'unknown',
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
```

### Monorepo Configuration

```yaml
# Path-based triggers for monorepos
on:
  pull_request:
    paths:
      - 'apps/web/**'
      - 'packages/shared/**'
      - 'package-lock.json'

# Or use dorny/paths-filter for conditional jobs
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
      api: ${{ steps.filter.outputs.api }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            web:
              - 'apps/web/**'
              - 'packages/shared/**'
            api:
              - 'apps/api/**'
              - 'packages/shared/**'

  test-web:
    needs: changes
    if: needs.changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test --workspace=apps/web
```

### Rollback Procedure

```bash
# Vercel instant rollback (recommended)
# Rolls back to previous production deployment
vercel rollback --token=$VERCEL_TOKEN

# Git-based rollback
git revert HEAD --no-edit   # Revert last merge commit
git push origin main        # Triggers deploy of reverted state

# Database rollback (if migration was the problem)
# NEVER auto-rollback migrations — always manual
supabase db reset --linked  # Nuclear option: reset to last known good
# Or apply a new forward migration that undoes the change
```

## Code Templates

No dedicated code templates. All workflow YAML patterns are inline above. Copy the relevant workflow file and customize per project.

## Checklist

Before declaring CI/CD work complete:

- [ ] PR workflow runs lint, typecheck, test, and build — all must pass
- [ ] `concurrency` configured to cancel in-progress PR checks (save runner minutes)
- [ ] Production deploy workflow uses `cancel-in-progress: false` (never cancel mid-deploy)
- [ ] Branch protection enabled on `main` with all status checks required
- [ ] All secrets stored in GitHub Secrets (never in workflow files or env)
- [ ] Node version pinned via `.nvmrc` or workflow env variable
- [ ] `npm ci` used (not `npm install`) for reproducible installs
- [ ] Dependency caching configured (actions/setup-node cache or actions/cache)
- [ ] Next.js build cache configured for faster rebuilds
- [ ] Preview deploys working (Vercel auto or manual workflow)
- [ ] Preview environments use staging data, never production
- [ ] Health check endpoint exists at `/api/health`
- [ ] Post-deploy health check in production workflow
- [ ] Database migrations run on staging first with manual gate for production
- [ ] Failure notifications configured (Slack, Discord, or email)
- [ ] `paths-ignore` set to skip CI on docs-only changes
- [ ] Actions pinned to specific major versions (`@v4`, not `@main`)

## Common Pitfalls

1. **No concurrency control** — without `concurrency` groups, multiple PR pushes stack up and waste runner minutes. Always cancel in-progress runs for PRs. Never cancel production deploys.

2. **Secrets in wrong scope** — repository secrets are available to all workflows. Use environment-level secrets (`environment: production`) for production credentials so PR workflows can't access them.

3. **Flaky tests blocking deploys** — one flaky test makes the entire team lose trust in CI. Fix or quarantine flaky tests immediately. Never add `continue-on-error` as a bandaid.

4. **Missing build step dependency** — if the build job doesn't `needs: [lint, typecheck, test]`, those jobs run in parallel but the build can succeed even if tests fail. Always chain the deploy-blocking job after all checks.

5. **Auto-migrating production databases** — running `supabase db push` automatically on merge to main is dangerous. Breaking schema changes need a manual approval gate via GitHub Environments.

6. **Slow CI from no caching** — a clean `npm ci` on a Next.js project takes 1-3 minutes. With proper caching of `node_modules` and `.next/cache`, this drops to seconds. Always configure caching on day one.

7. **Not testing the CI pipeline itself** — after setting up workflows, open a test PR with a deliberate lint error and a deliberate type error to verify the pipeline actually catches failures. Trust but verify.
