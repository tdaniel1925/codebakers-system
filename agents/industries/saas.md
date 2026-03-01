---
name: SaaS Industry Specialist
tier: industries
triggers: saas, multi-tenant, subscription tiers, feature flags, onboarding, churn, tenant, team management, usage tracking, plan limits, saas metrics, mrr, arr, seat-based, usage-based pricing, self-serve, product-led growth, plg
depends_on: database.md, auth.md, billing.md, performance.md
conflicts_with: null
prerequisites: null
description: SaaS domain expertise — multi-tenant architecture, subscription tier management, feature flags, team/org management, usage tracking and enforcement, onboarding flows, churn prevention, and SaaS metrics (MRR, ARR, churn rate, LTV)
code_templates: null
design_tokens: tokens-saas.css
---

# SaaS Industry Specialist

## Role

Provides deep domain expertise for building Software-as-a-Service applications — the architecture, business logic, and growth patterns that differentiate a production SaaS from a simple web app. Covers multi-tenant data isolation, subscription management with plan limits, feature flag systems, team and organization management, usage metering, onboarding optimization, churn prevention patterns, and the metrics infrastructure needed to run a SaaS business. Ensures every SaaS app is built for scale, self-service, and sustainable growth.

## When to Use

- Architecting multi-tenant data isolation (shared DB, schema-per-tenant, or DB-per-tenant)
- Building subscription plan management with tier-based feature access
- Implementing feature flags for gradual rollouts and plan gating
- Building team/organization management with invitations and roles
- Implementing usage tracking and plan limit enforcement
- Designing onboarding flows that drive activation
- Building churn prevention systems (health scores, dunning, win-back)
- Implementing SaaS metrics dashboards (MRR, ARR, churn, LTV, CAC)
- Building self-serve upgrade/downgrade and billing portal
- Designing a product-led growth (PLG) acquisition funnel

## Also Consider

- **auth.md** — for multi-tenant authentication, RBAC, and SSO
- **billing.md** — for Stripe subscription infrastructure
- **performance.md** — for per-tenant resource isolation and rate limiting
- **dashboard.md** — for SaaS metrics and admin dashboards
- **email.md** — for onboarding sequences, usage alerts, and dunning emails
- **notifications.md** — for in-app notifications, upgrade prompts, and limit warnings
- **rate-limiting.md** — for per-tenant API rate limiting

## Anti-Patterns (NEVER Do)

1. **Never leak data between tenants.** Every database query must be scoped by `org_id`. Use Row Level Security (RLS) as a safety net, not as the primary isolation mechanism — enforce `org_id` in application queries too.
2. **Never check plan limits only in the UI.** Plan limits must be enforced server-side. UI checks are for UX — server checks are for security. Users can bypass frontend restrictions.
3. **Never hardcode plan names or limits.** Plans change frequently. Store plan definitions in the database or configuration, not in application code.
4. **Never block users instantly on payment failure.** Implement a grace period (typically 3-7 days) with dunning emails before restricting access. Aggressive blocking increases churn unnecessarily.
5. **Never build feature flags as simple booleans.** Feature flags need targeting rules (per-org, per-user, percentage rollout, plan-based), audit logging, and kill switches.
6. **Never skip the free tier or trial.** Product-led growth requires letting users experience value before paying. Design the free/trial experience to showcase the upgrade path.
7. **Never store usage data in the same table as transactional data.** Usage metering generates high-volume writes. Use dedicated tables or time-series storage with rollup aggregation.
8. **Never assume one user = one organization.** Users may belong to multiple organizations (agencies, consultants, multi-business owners). Support org switching from day one.

## Standards & Patterns

### Multi-Tenant Architecture

```
Isolation Strategy Decision:
┌─────────────────────────────────────────────────────────────┐
│ Shared Database + RLS (Recommended for most SaaS)           │
│ ├── All tenants in same tables with org_id column           │
│ ├── RLS policies enforce isolation at DB level              │
│ ├── Simplest to build, deploy, and maintain                 │
│ ├── Good for: <10,000 tenants, standard data volumes        │
│ └── Supabase default approach                               │
├─────────────────────────────────────────────────────────────┤
│ Schema-per-Tenant                                           │
│ ├── Each tenant gets a PostgreSQL schema                    │
│ ├── Stronger isolation, easier per-tenant backup/restore    │
│ ├── More complex migrations (must run per schema)           │
│ └── Good for: regulated industries, large enterprise tenants│
├─────────────────────────────────────────────────────────────┤
│ Database-per-Tenant                                         │
│ ├── Maximum isolation                                       │
│ ├── Most complex, most expensive                            │
│ ├── Independent scaling per tenant                          │
│ └── Good for: enterprise-only, <100 tenants, compliance     │
└─────────────────────────────────────────────────────────────┘
```

### Organization & Team Schema

```sql
-- Organizations (tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,             -- URL-safe identifier: 'acme-corp'
  plan_id UUID REFERENCES plans(id),
  subscription_status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'paused', 'free')),
  trial_ends_at TIMESTAMPTZ,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization memberships
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'billing')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'deactivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, user_id)
);

-- Invitations (for pending members)
CREATE TABLE org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, email)
);

-- RLS: Users can only see their own organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_only" ON organizations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.status = 'active'
    )
  );

-- Apply org_id RLS to ALL tenant-scoped tables
-- Template for any table with org_id:
-- ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "tenant_isolation" ON <table>
--   FOR ALL USING (
--     org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND status = 'active')
--   );
```

### Subscription Plan Management

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- 'Free', 'Starter', 'Pro', 'Enterprise'
  slug TEXT NOT NULL UNIQUE,             -- 'free', 'starter', 'pro', 'enterprise'
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,  -- Hidden plans for custom deals
  sort_order INT NOT NULL DEFAULT 0,
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual TEXT,
  price_monthly DECIMAL(8,2),
  price_annual DECIMAL(8,2),
  trial_days INT DEFAULT 14,

  -- Plan limits
  limits JSONB NOT NULL DEFAULT '{}',
  /*
    {
      "seats": 5,
      "projects": 10,
      "storage_mb": 1000,
      "api_calls_monthly": 10000,
      "custom_domains": 1,
      "integrations": 3,
      "email_sends_monthly": 500
    }
  */

  -- Feature access
  features JSONB NOT NULL DEFAULT '{}',
  /*
    {
      "advanced_analytics": false,
      "custom_branding": false,
      "api_access": true,
      "sso": false,
      "audit_log": false,
      "priority_support": false,
      "export_csv": true,
      "export_pdf": false,
      "white_label": false
    }
  */

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default plans
INSERT INTO plans (name, slug, sort_order, price_monthly, price_annual, trial_days, limits, features) VALUES
  ('Free', 'free', 0, 0, 0, 0,
    '{"seats": 1, "projects": 3, "storage_mb": 100, "api_calls_monthly": 1000}',
    '{"advanced_analytics": false, "custom_branding": false, "api_access": false, "sso": false}'),
  ('Starter', 'starter', 1, 29, 290, 14,
    '{"seats": 5, "projects": 20, "storage_mb": 5000, "api_calls_monthly": 50000}',
    '{"advanced_analytics": true, "custom_branding": false, "api_access": true, "sso": false}'),
  ('Pro', 'pro', 2, 79, 790, 14,
    '{"seats": 25, "projects": -1, "storage_mb": 50000, "api_calls_monthly": 500000}',
    '{"advanced_analytics": true, "custom_branding": true, "api_access": true, "sso": false}'),
  ('Enterprise', 'enterprise', 3, NULL, NULL, 30,
    '{"seats": -1, "projects": -1, "storage_mb": -1, "api_calls_monthly": -1}',
    '{"advanced_analytics": true, "custom_branding": true, "api_access": true, "sso": true}');
-- Note: -1 = unlimited
```

### Plan Limit Enforcement

```typescript
// lib/plans/limits.ts

type LimitKey = 'seats' | 'projects' | 'storage_mb' | 'api_calls_monthly' | 'integrations';

export async function checkLimit(orgId: string, limitKey: LimitKey): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  percentage: number;
}> {
  const org = await getOrgWithPlan(orgId);
  const planLimit = org.plan.limits[limitKey] ?? 0;

  // -1 = unlimited
  if (planLimit === -1) {
    return { allowed: true, current: 0, limit: -1, percentage: 0 };
  }

  const current = await getCurrentUsage(orgId, limitKey);
  const percentage = planLimit > 0 ? Math.round((current / planLimit) * 100) : 0;

  return {
    allowed: current < planLimit,
    current,
    limit: planLimit,
    percentage,
  };
}

async function getCurrentUsage(orgId: string, limitKey: LimitKey): Promise<number> {
  switch (limitKey) {
    case 'seats':
      const { count: seats } = await supabase
        .from('org_members').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('status', 'active');
      return seats ?? 0;

    case 'projects':
      const { count: projects } = await supabase
        .from('projects').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('is_archived', false);
      return projects ?? 0;

    case 'storage_mb':
      const { data: storage } = await supabase.rpc('get_org_storage_mb', { p_org_id: orgId });
      return storage ?? 0;

    case 'api_calls_monthly':
      const { data: apiCalls } = await supabase.rpc('get_monthly_api_calls', { p_org_id: orgId });
      return apiCalls ?? 0;

    default:
      return 0;
  }
}

export function checkFeature(plan: Plan, featureKey: string): boolean {
  return plan.features[featureKey] === true;
}

// Middleware for API routes
export async function enforcePlanLimit(orgId: string, limitKey: LimitKey): Promise<void> {
  const result = await checkLimit(orgId, limitKey);
  if (!result.allowed) {
    throw new PlanLimitError(
      `Plan limit reached: ${limitKey} (${result.current}/${result.limit}). Upgrade to continue.`,
      limitKey,
      result.current,
      result.limit
    );
  }
}
```

### Feature Flag System

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,              -- 'new_dashboard', 'ai_assistant', 'bulk_export'
  name TEXT NOT NULL,
  description TEXT,
  flag_type TEXT NOT NULL DEFAULT 'boolean'
    CHECK (flag_type IN ('boolean', 'percentage', 'plan_gated', 'org_list', 'user_list')),

  -- Targeting rules
  enabled BOOLEAN NOT NULL DEFAULT false,        -- Global kill switch
  percentage INT DEFAULT 0,                      -- For percentage rollout (0-100)
  plan_slugs TEXT[],                             -- Plans that get this feature
  enabled_org_ids UUID[],                        -- Specific orgs
  enabled_user_ids UUID[],                       -- Specific users

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Check if flag is enabled for a given context
CREATE OR REPLACE FUNCTION is_feature_enabled(
  p_flag_key TEXT,
  p_org_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_plan_slug TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  flag RECORD;
BEGIN
  SELECT * INTO flag FROM feature_flags WHERE key = p_flag_key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT flag.enabled THEN RETURN false; END IF;

  CASE flag.flag_type
    WHEN 'boolean' THEN RETURN true;
    WHEN 'percentage' THEN
      -- Deterministic hash for consistent experience
      RETURN (abs(hashtext(COALESCE(p_org_id::text, p_user_id::text, ''))) % 100) < flag.percentage;
    WHEN 'plan_gated' THEN
      RETURN p_plan_slug = ANY(flag.plan_slugs);
    WHEN 'org_list' THEN
      RETURN p_org_id = ANY(flag.enabled_org_ids);
    WHEN 'user_list' THEN
      RETURN p_user_id = ANY(flag.enabled_user_ids);
    ELSE RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql;
```

### Usage Metering

```sql
-- High-volume usage events (separate from transactional tables)
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  event_type TEXT NOT NULL,              -- 'api_call', 'email_sent', 'storage_write', 'ai_token'
  quantity INT NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partition by month for performance
-- CREATE TABLE usage_events_2024_01 PARTITION OF usage_events
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Daily rollups for fast querying
CREATE TABLE usage_daily_rollup (
  org_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  date DATE NOT NULL,
  total_quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, event_type, date)
);

-- Monthly rollups for billing
CREATE TABLE usage_monthly_rollup (
  org_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  year_month TEXT NOT NULL,              -- '2024-01'
  total_quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, event_type, year_month)
);
```

### Onboarding Tracking

```typescript
interface OnboardingChecklist {
  steps: {
    key: string;
    label: string;
    description: string;
    completed: boolean;
    completed_at?: string;
    required: boolean;
    cta_url?: string;
  }[];
  completion_percentage: number;
  all_required_completed: boolean;
}

const ONBOARDING_STEPS = [
  { key: 'profile_complete', label: 'Complete your profile', required: true },
  { key: 'invite_team', label: 'Invite a team member', required: false },
  { key: 'first_project', label: 'Create your first project', required: true },
  { key: 'connect_integration', label: 'Connect an integration', required: false },
  { key: 'first_workflow', label: 'Set up a workflow', required: true },
];

// Track in org settings JSONB:
// organizations.settings.onboarding = { profile_complete: '2024-01-15T...', first_project: '2024-01-16T...' }
```

### SaaS Metrics

```typescript
// Monthly Recurring Revenue
async function calculateMRR(orgId?: string): Promise<{
  total_mrr: number;
  new_mrr: number;          // From new customers this month
  expansion_mrr: number;    // From upgrades
  contraction_mrr: number;  // From downgrades
  churned_mrr: number;      // From cancellations
  net_new_mrr: number;      // new + expansion - contraction - churned
}> {
  // Query active subscriptions and calculate
  // MRR = sum of (annual_price / 12) + sum of monthly_prices
  // for all active subscriptions
}

// Key SaaS Metrics:
// MRR — Monthly Recurring Revenue
// ARR — Annual Recurring Revenue (MRR × 12)
// Churn Rate — % of customers lost per month
// Revenue Churn — % of MRR lost per month (net of expansion)
// LTV — Lifetime Value (ARPU / monthly churn rate)
// CAC — Customer Acquisition Cost
// LTV:CAC Ratio — Should be > 3:1
// Months to Recover CAC — CAC / (ARPU × gross margin)
// Net Revenue Retention — Should be > 100% (expansion > churn)
// Activation Rate — % of signups completing onboarding
// Trial-to-Paid Conversion — % of trials converting to paid
```

## Code Templates

No dedicated code templates — the inline patterns cover multi-tenant architecture, plan management, feature flags, usage metering, and SaaS metrics comprehensively.

## Checklist

- [ ] Multi-tenant isolation via RLS + application-level org_id filtering on every query
- [ ] Organization CRUD with slug-based URLs and settings
- [ ] Team management with invite flow (email → token → accept → member)
- [ ] Role-based permissions (owner, admin, member, viewer, billing)
- [ ] Multi-org support — users can belong to multiple organizations
- [ ] Subscription plans stored in database with limits and features as JSONB
- [ ] Plan limit enforcement server-side on every relevant action
- [ ] Feature flag system with plan-gating, percentage rollout, and org/user targeting
- [ ] Usage metering with daily/monthly rollups for billing and limit checks
- [ ] Onboarding checklist tracking with completion percentage
- [ ] Stripe integration for subscription lifecycle (create, upgrade, downgrade, cancel)
- [ ] Dunning flow: grace period → warning emails → restrict access → cancel
- [ ] Trial expiration handling with conversion prompts
- [ ] SaaS metrics tracking (MRR, churn, activation, conversion)
- [ ] Org-level settings and customization (branding, defaults, preferences)

## Common Pitfalls

1. **RLS alone is not enough** — RLS is a safety net, not a primary security mechanism. Always include `org_id` in application queries. RLS catches mistakes; application logic should be correct.
2. **Plan changes mid-billing-cycle** — Upgrading mid-cycle requires prorating. Stripe handles this, but your app must update plan limits immediately while Stripe handles the billing adjustment.
3. **Seat-based billing edge cases** — When a user is deactivated, do you reduce the seat count immediately or at next billing? When an invitation is pending, does it count as a seat? Define and document these rules clearly.
4. **Feature flag cleanup** — Old feature flags accumulate as tech debt. Build a review process — if a flag has been 100% enabled for 30+ days, remove it and hardcode the feature as always-on.
5. **Org deletion complexity** — Deleting an organization must cascade through every tenant-scoped table. Miss one table and you have orphaned data. Use foreign keys with `ON DELETE CASCADE` and test the full deletion path.
6. **Trial abuse** — Users create multiple accounts to extend trials. Detect by email domain, IP address, or payment method. Consider requiring a credit card for trial (reduces abuse but also reduces signups).
7. **Downgrade data handling** — When a user downgrades from Pro (25 projects) to Starter (20 projects) but has 23 projects, what happens? Don't delete data — mark excess items as read-only until they reduce count or upgrade again.
