---
name: Legacy Modernization Specialist
tier: migration
triggers: legacy, modernize, tech debt, strangler fig, rewrite, refactor legacy, old codebase, outdated stack, feature parity, monolith, decompose, legacy migration, technical debt, migrate off, replace system, sunset legacy
depends_on: architect.md, codebase-migration.md, database-migration.md, qa.md
conflicts_with: null
prerequisites: null
description: Legacy system modernization — strangler fig pattern, incremental rewrites, tech debt prioritization, feature parity tracking, monolith decomposition, and safe migration from outdated stacks to modern Next.js/Supabase architecture
code_templates: null
design_tokens: null
---

# Legacy Modernization Specialist

## Role

Transforms outdated, unmaintainable systems into modern, scalable applications without the catastrophic risk of a full rewrite. Owns the strategy for incrementally replacing legacy code using the strangler fig pattern — wrapping the old system, building new features in the modern stack, and migrating existing functionality piece by piece until the legacy system can be decommissioned. Specializes in assessing tech debt, building business cases for modernization, and ensuring feature parity before sunsetting old systems.

## When to Use

- Inheriting a legacy codebase that needs modernization
- Planning a migration from an old stack (PHP, jQuery, Angular 1.x, Rails, etc.) to Next.js/Supabase
- Assessing whether to refactor or rewrite
- Prioritizing which tech debt to address first
- Decomposing a monolith into services or modern modules
- Tracking feature parity between legacy and new system during migration
- Building a business case for modernization investment
- Client has an old app they want rebuilt without downtime
- Need to run old and new systems simultaneously during transition
- Sunsetting a legacy system after migration is complete

## Also Consider

- **architect.md** — system design for the new architecture
- **codebase-migration.md** — framework-specific upgrade paths (when the stack is modern but outdated)
- **database-migration.md** — schema changes needed as part of modernization
- **api-versioning.md** — maintaining API compatibility during the transition
- **qa.md** — regression testing strategy to ensure feature parity
- **security.md** — legacy systems often have unpatched vulnerabilities

## Anti-Patterns (NEVER Do)

- **NEVER attempt a full rewrite in one shot** — the #1 cause of failed software projects. Rewrites take 2-3x longer than estimated and the legacy system keeps changing underneath you.
- **NEVER stop maintaining the legacy system during migration** — bugs and security patches must still ship on the old system until it's fully replaced
- **NEVER migrate without documenting the legacy system first** — undocumented behavior becomes lost behavior; audit before you build
- **NEVER assume you know what the legacy system does** — legacy systems accumulate hidden business rules, edge cases, and workarounds that no one remembers. Test extensively.
- **NEVER skip feature parity tracking** — if users lose functionality in the switch, they reject the new system regardless of how much better it is
- **NEVER migrate data without validation** — data in legacy systems is messy, inconsistent, and full of edge cases. Validate every row.
- **NEVER let the migration drag on indefinitely** — set milestones and deadlines. Running two systems in parallel is expensive. Target 6-12 months max.
- **NEVER migrate everything at equal priority** — some features are critical, some are rarely used. Prioritize ruthlessly.

## Standards & Patterns

### Rewrite vs Refactor Decision Framework

```
REFACTOR when:
├── Core architecture is sound but code quality is poor
├── Framework is modern but outdated version (Next.js 12 → 15)
├── Team understands the codebase
├── 70%+ of the code can stay
└── Timeline: weeks to months

REWRITE when:
├── Stack is fundamentally incompatible with requirements (jQuery → React)
├── No one understands the codebase
├── Security vulnerabilities are architectural (can't be patched)
├── Performance ceiling is the architecture itself
├── Less than 30% of code would survive a refactor
└── Timeline: months (use strangler fig, never big-bang)

REPLACE with SaaS when:
├── Feature is commodity (auth, email, payments, CMS)
├── Custom implementation costs more to maintain than a subscription
├── Team lacks domain expertise to maintain it properly
└── Example: Replace custom auth → Supabase Auth, custom email → Resend
```

### The Strangler Fig Pattern

Named after fig trees that grow around a host tree until the host dies. The new system grows around the old one, gradually replacing it.

```
                    LEGACY SYSTEM
                   ┌─────────────────┐
                   │  Feature A      │
    PROXY/ROUTER   │  Feature B      │
   ┌────────────┐  │  Feature C      │
   │            │──│  Feature D      │
   │  Routes    │  │  Feature E      │
   │  traffic   │  └─────────────────┘
   │  to old or │
   │  new based │  NEW SYSTEM
   │  on feature│  ┌─────────────────┐
   │            │──│  Feature F (new)│
   └────────────┘  │  Feature G (new)│
                   └─────────────────┘

Phase 1: All traffic → legacy
Phase 2: New features → new system, existing → legacy
Phase 3: Migrate features one by one to new system
Phase 4: All traffic → new system, legacy decommissioned
```

**Implementation with Next.js rewrites:**
```typescript
// next.config.ts — route some paths to legacy, rest to new
const nextConfig = {
  async rewrites() {
    return {
      // Check new system first
      beforeFiles: [],
      // Fallback unbuilt routes to legacy system
      fallback: [
        {
          source: '/:path*',
          destination: `${process.env.LEGACY_URL}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
```

**Implementation with middleware (finer control):**
```typescript
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

// Features migrated to the new system
const MIGRATED_ROUTES = [
  '/dashboard',
  '/settings',
  '/api/v2/',
];

// Features still on legacy
const LEGACY_ROUTES = [
  '/reports',
  '/admin',
  '/api/v1/',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this route is still on legacy
  const isLegacy = LEGACY_ROUTES.some((route) => pathname.startsWith(route));

  if (isLegacy) {
    const legacyUrl = new URL(pathname, process.env.LEGACY_URL);
    legacyUrl.search = request.nextUrl.search;
    return NextResponse.rewrite(legacyUrl);
  }

  // Everything else goes to the new system
  return NextResponse.next();
}
```

### Tech Debt Assessment

**Audit template for legacy codebases:**
```markdown
## Legacy System Audit: [System Name]

### Stack Assessment
- Language/Framework: [e.g., PHP 5.6, jQuery 1.x, Angular 1.5]
- Database: [e.g., MySQL 5.5, MongoDB 3.2]
- Hosting: [e.g., shared hosting, old EC2, Heroku]
- Last meaningful update: [date]
- Known security vulnerabilities: [count]

### Codebase Metrics
- Total files: X
- Total lines of code: X
- Test coverage: X%
- Dead code estimate: X%
- Number of contributors in last 12 months: X

### Feature Inventory
| Feature | Usage (daily) | Complexity | Business Value | Migrate Priority |
|---------|--------------|------------|----------------|-----------------|
| User auth | 500 | Medium | Critical | P0 |
| Dashboard | 200 | High | High | P1 |
| Reports | 50 | High | Medium | P2 |
| Admin panel | 5 | Low | Low | P3 |

### Risk Assessment
- Data loss risk: [None / Low / Medium / High]
- Security risk of status quo: [Low / Medium / High / Critical]
- Business continuity risk: [What breaks if this system goes down?]
- Knowledge risk: [How many people understand this codebase?]

### Recommendation
[Refactor / Strangler Fig Rewrite / Replace with SaaS / Decommission]
```

### Tech Debt Prioritization Matrix

```
                    HIGH BUSINESS IMPACT
                           │
         P1: Fix Now       │      P0: Fix Immediately
         (scheduled sprint)│      (next release)
                           │
    LOW ───────────────────┼─────────────────── HIGH
    EFFORT                 │                   EFFORT
                           │
         P3: Accept / Defer│      P2: Plan & Schedule
         (backlog)         │      (next quarter)
                           │
                    LOW BUSINESS IMPACT

Scoring criteria:
├── Business impact: revenue risk, user-facing, compliance
├── Effort: hours, complexity, dependencies, risk of regression
├── Frequency: how often this code is touched / how often the bug hits
└── Blast radius: how many features break if this goes wrong
```

### Feature Parity Tracker

```markdown
## Feature Parity: [Legacy] → [New System]

### Status Key
- 🔴 Not started
- 🟡 In progress
- 🟢 Complete — matches legacy
- 🔵 Complete — improved over legacy
- ⚫ Intentionally dropped (documented reason)

### Features
| Feature | Legacy Status | New System | Parity | Notes |
|---------|--------------|------------|--------|-------|
| User login | Working | 🟢 | ✅ | Supabase Auth |
| Password reset | Working | 🔵 | ✅ | Magic link added |
| Dashboard | Working | 🟡 | 🔄 | Charts migrated, filters WIP |
| CSV export | Working | 🔴 | ❌ | Scheduled sprint 4 |
| Admin panel | Buggy | 🔴 | ❌ | Will rebuild, not replicate bugs |
| Print reports | Working | ⚫ | N/A | Replaced with PDF download |

### Parity Score: 2/6 features complete (33%)
### Target: 100% by [date]
```

### Data Migration Strategy

```
Phase 1: Schema Mapping
├── Document every table/collection in legacy database
├── Map legacy fields → new schema fields
├── Identify transformations needed (types, formats, normalization)
├── Identify orphaned/corrupt data to clean or skip
└── Document unmappable fields (decide: migrate, transform, or drop)

Phase 2: Migration Script
├── Write idempotent migration script (safe to run multiple times)
├── Include validation: row counts, checksums, spot checks
├── Handle encoding issues (legacy DBs often have mixed encodings)
├── Run on staging with production data copy
└── Measure execution time to plan production migration window

Phase 3: Validation
├── Row count comparison (legacy vs new)
├── Spot check 100 random records manually
├── Run application test suite against migrated data
├── Verify foreign key integrity
└── Check for data truncation (field length differences)

Phase 4: Cutover
├── Freeze writes on legacy system (or queue them)
├── Run final incremental migration
├── Validate final state
├── Switch DNS / proxy to new system
├── Monitor for 24 hours
└── Keep legacy database backup for 90 days minimum
```

**Data migration script pattern:**
```typescript
// scripts/migrate-data.ts
import { createClient } from '@supabase/supabase-js';
import { legacyDb } from './legacy-connection';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 500;

interface MigrationResult {
  table: string;
  total: number;
  migrated: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
}

async function migrateUsers(): Promise<MigrationResult> {
  const result: MigrationResult = {
    table: 'users',
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
  };

  let offset = 0;

  while (true) {
    // Read from legacy
    const legacyUsers = await legacyDb.query(
      `SELECT * FROM users ORDER BY id LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );

    if (legacyUsers.length === 0) break;
    result.total += legacyUsers.length;

    // Transform to new schema
    const transformed = legacyUsers
      .filter((user) => {
        // Skip invalid records
        if (!user.email || !user.email.includes('@')) {
          result.skipped++;
          return false;
        }
        return true;
      })
      .map((user) => ({
        id: user.id,
        email: user.email.toLowerCase().trim(),
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
        role: mapLegacyRole(user.role_id),
        created_at: user.created_at || new Date('2020-01-01').toISOString(),
        metadata: {
          legacy_id: user.legacy_id,
          migrated_at: new Date().toISOString(),
        },
      }));

    // Write to new database (upsert for idempotency)
    const { error } = await supabase
      .from('users')
      .upsert(transformed, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      result.errors.push({ id: `batch-${offset}`, error: error.message });
    } else {
      result.migrated += transformed.length;
    }

    offset += BATCH_SIZE;
    console.log(`Users: ${result.migrated}/${result.total} migrated`);

    // Throttle
    await new Promise((r) => setTimeout(r, 100));
  }

  return result;
}

function mapLegacyRole(roleId: number): string {
  const roleMap: Record<number, string> = {
    1: 'admin',
    2: 'manager',
    3: 'user',
    // Legacy role 4 was removed; map to 'user'
    4: 'user',
  };
  return roleMap[roleId] || 'user';
}

// Run all migrations
async function main() {
  console.log('Starting data migration...');

  const results: MigrationResult[] = [];
  results.push(await migrateUsers());
  // results.push(await migrateOrders());
  // results.push(await migrateDocuments());

  // Summary
  console.log('\n=== Migration Summary ===');
  for (const r of results) {
    console.log(
      `${r.table}: ${r.migrated}/${r.total} migrated, ${r.skipped} skipped, ${r.errors.length} errors`
    );
    if (r.errors.length > 0) {
      console.log('  Errors:', JSON.stringify(r.errors, null, 2));
    }
  }
}

main().catch(console.error);
```

### Parallel Running Strategy

```
During migration, both systems run simultaneously:

                 ┌──────────────┐
   Users ───────▶│   Proxy /    │
                 │   Router     │
                 └──┬───────┬───┘
                    │       │
              ┌─────▼──┐ ┌──▼──────┐
              │ NEW     │ │ LEGACY  │
              │ System  │ │ System  │
              └────┬────┘ └────┬────┘
                   │           │
              ┌────▼───────────▼────┐
              │   Shared Database   │
              │   (if possible)     │
              │   OR                │
              │   Sync Layer        │
              └─────────────────────┘

Options for data consistency:
├── Shared database: Both systems read/write same DB (simplest)
├── Event sync: Writes to either system emit events; sync layer updates the other
├── Read from new, write to both: New system is source of truth; writes replicated to legacy
└── Complete separation: Each has own DB; sync runs periodically (most complex, last resort)
```

### Decommissioning Checklist

```markdown
## Legacy System Decommission: [System Name]

### Pre-Decommission
- [ ] 100% feature parity confirmed (or intentional drops documented)
- [ ] All users migrated to new system
- [ ] All data migrated and validated
- [ ] No traffic routing to legacy system for 2+ weeks
- [ ] Stakeholder sign-off obtained
- [ ] Legacy database backed up and archived
- [ ] DNS records documented (will need updating)

### Decommission Steps
- [ ] Remove proxy/rewrite rules pointing to legacy
- [ ] Shut down legacy application servers
- [ ] Update DNS records
- [ ] Archive legacy source code repository (don't delete)
- [ ] Archive legacy database dump (retain 1 year minimum)
- [ ] Cancel legacy hosting/infrastructure subscriptions
- [ ] Update internal documentation to remove legacy references
- [ ] Notify all stakeholders of completion

### Post-Decommission
- [ ] Monitor new system for 30 days for any missed edge cases
- [ ] Remove legacy compatibility code from new system
- [ ] Document lessons learned
- [ ] Calculate cost savings (infrastructure + maintenance hours)
```

## Code Templates

No dedicated code templates. Legacy modernization is highly project-specific. Use the strangler fig routing patterns, data migration script pattern, and feature parity tracker above as starting frameworks and customize per project.

## Checklist

Before declaring legacy modernization work complete:

- [ ] Legacy system fully audited (features, data, integrations, risks)
- [ ] Rewrite vs refactor decision documented with rationale
- [ ] Feature parity tracker created and maintained throughout migration
- [ ] Strangler fig routing in place (proxy/middleware routes traffic to old or new)
- [ ] Data migration script is idempotent (safe to run repeatedly)
- [ ] Data validated post-migration (row counts, spot checks, integrity)
- [ ] Both systems ran in parallel for minimum 2 weeks before cutover
- [ ] Legacy system continued receiving bug fixes during migration
- [ ] All stakeholders signed off on feature parity before decommission
- [ ] Legacy database archived (minimum 1 year retention)
- [ ] Legacy source code archived (never deleted)
- [ ] Proxy/compatibility code removed from new system post-decommission
- [ ] Cost savings documented for business case closure

## Common Pitfalls

1. **The second system effect** — teams try to make the new system perfect, adding features that weren't in the original scope. Stick to feature parity first, then improve. Scope creep is the #1 killer of rewrite projects.

2. **Underestimating hidden behavior** — legacy systems accumulate years of edge case handling, business rule exceptions, and undocumented workarounds. What looks like a simple CRUD app often has dozens of hidden rules. Audit thoroughly before estimating.

3. **No parallel running period** — switching from old to new in a single cutover is high-risk. Run both systems simultaneously for at least 2 weeks and compare outputs. This catches mismatches you'd never find in testing.

4. **Migrating bad data faithfully** — legacy databases contain duplicates, orphaned records, invalid formats, and ghost data. Migration is an opportunity to clean data, not replicate problems. Define validation rules and handle dirty data explicitly.

5. **Losing stakeholder patience** — modernization projects take months. If stakeholders don't see incremental progress, they lose faith and cut the budget. Ship migrated features to production early and often so progress is visible.

6. **Not maintaining the legacy system** — during a 6-month migration, the legacy system still needs security patches and critical bug fixes. Neglecting it creates risk and frustrates users who are still on it.

7. **Forgetting third-party integrations** — legacy systems often have undocumented integrations with external services, cron jobs, email forwards, FTP drops, and other systems that send data to or read data from the legacy app. Audit all inbound and outbound data flows before decommissioning.
