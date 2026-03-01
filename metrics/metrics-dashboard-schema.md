# Metrics Dashboard Data Format

> JSON schema for tracking project health scores, bug patterns, and agent performance across all BotMakers projects.

---

## Overview

All metrics are stored in `metrics/scores.json` in the codebakers-system repository. This file is the single source of truth for project health across the portfolio. It is updated at the end of every sprint, milestone, or monthly review cycle.

---

## Schema Version

Current: `2.0`

Always check `schema_version` before parsing. Breaking changes increment the major version.

---

## Complete Schema

```jsonc
{
  // Schema metadata
  "schema_version": "2.0",
  "last_updated": "2025-02-28T12:00:00Z",
  "updated_by": "team-member-name",

  // ──────────────────────────────────────
  // SECTION 1: Project scores
  // ──────────────────────────────────────
  "projects": {
    "project-slug": {
      // Identity
      "name": "Human-Readable Project Name",
      "client": "Client Company Name",
      "status": "active",              // active | maintenance | completed | paused
      "stack": "Next.js 15, Supabase, Vercel",
      "start_date": "2025-01-01",
      "launch_date": "2025-03-01",     // null if not yet launched

      // Current health scores (0-100 each)
      "scores": {
        "overall": 84,                 // Weighted composite
        "code_quality": 90,            // Lint errors, TS strictness, dead code
        "test_coverage": 78,           // Statement coverage on critical paths
        "performance": 88,             // Lighthouse score, Core Web Vitals
        "security": 85,                // Vulnerabilities, OWASP, RLS
        "design_consistency": 80,      // Token compliance, component consistency
        "reliability": 92,             // Error rate, uptime
        "documentation": 70            // README, API docs, inline comments
      },

      // Score weights (must sum to 100)
      "score_weights": {
        "code_quality": 20,
        "test_coverage": 20,
        "performance": 15,
        "security": 15,
        "design_consistency": 10,
        "reliability": 10,
        "documentation": 10
      },

      // Score history for trend tracking
      "history": [
        {
          "date": "2025-01-15",
          "scores": {
            "overall": 72,
            "code_quality": 75,
            "test_coverage": 50,
            "performance": 80,
            "security": 70,
            "design_consistency": 65,
            "reliability": 85,
            "documentation": 60
          },
          "notes": "Initial baseline after Phase 1 launch"
        },
        {
          "date": "2025-02-01",
          "scores": {
            "overall": 79,
            "code_quality": 85,
            "test_coverage": 65,
            "performance": 82,
            "security": 80,
            "design_consistency": 72,
            "reliability": 88,
            "documentation": 65
          },
          "notes": "Added tests, fixed security headers"
        }
      ],

      // Bug tracking
      "bugs": {
        "open": {
          "total": 3,
          "by_severity": {
            "critical": 0,
            "high": 1,
            "medium": 2,
            "low": 0
          },
          "by_category": {
            "auth": 0,
            "data": 1,
            "ui": 1,
            "api": 0,
            "performance": 0,
            "security": 0,
            "integration": 1,
            "infrastructure": 0
          }
        },
        "closed_30d": 12,
        "closed_90d": 28,
        "mttr_minutes": 120            // Mean time to resolve (all severities)
      },

      // Incident log
      "incidents": [
        {
          "id": "INC-001",
          "date": "2025-02-10T14:30:00Z",
          "severity": "P1",            // P0 (outage) | P1 (major) | P2 (minor)
          "title": "Database connection pool exhaustion",
          "description": "API requests timing out due to connection pool limit reached",
          "root_cause": "Missing connection release in error handling path",
          "resolution": "Added connection release in finally block, increased pool size",
          "time_to_detect_minutes": 5,
          "time_to_resolve_minutes": 45,
          "user_impact": "All API requests failed for ~10 minutes",
          "lessons": ["2025-02-10-connection-pool-release"]
        }
      ],

      // Estimation tracking
      "estimation": {
        "total_estimated_sessions": 35,
        "total_actual_sessions": 32,
        "variance_percentage": -8.6,    // Negative = under estimate (good)
        "phases": [
          {
            "name": "Phase 1: MVP",
            "estimated": 25,
            "actual": 23,
            "status": "completed"
          },
          {
            "name": "Phase 2: Enhancements",
            "estimated": 10,
            "actual": 9,
            "status": "in_progress"
          }
        ]
      }
    }
  },

  // ──────────────────────────────────────
  // SECTION 2: Portfolio-wide metrics
  // ──────────────────────────────────────
  "portfolio": {
    "total_active_projects": 5,
    "average_health_score": 81,
    "health_score_trend": "improving",  // improving | stable | declining

    // Aggregate bug patterns across all projects
    "bug_patterns": {
      "period": "2025-Q1",
      "total_bugs": 47,
      "top_categories": [
        { "category": "ui", "count": 14, "projects_affected": 4 },
        { "category": "data", "count": 11, "projects_affected": 3 },
        { "category": "auth", "count": 8, "projects_affected": 2 }
      ],
      "recurring_patterns": [
        {
          "pattern": "RLS policies missing on junction tables",
          "occurrences": 3,
          "projects": ["project-alpha", "project-beta", "project-gamma"],
          "agent_fix": "database.md — added to checklist",
          "fixed": true
        }
      ]
    },

    // Estimation accuracy across all projects
    "estimation_accuracy": {
      "period": "2025-Q1",
      "average_variance_percentage": -5.2,
      "most_underestimated": "third-party integrations",
      "most_overestimated": "static pages",
      "benchmarks_updated": "2025-03-01"
    }
  },

  // ──────────────────────────────────────
  // SECTION 3: Agent performance
  // ──────────────────────────────────────
  "agent_performance": {
    "period": "2025-Q1",
    "agents": {
      "database.md": {
        "times_invoked": 45,
        "bugs_in_domain": 11,
        "bugs_caught_by_checklist": 8,
        "bugs_missed": 3,
        "lessons_generated": 4,
        "last_updated": "2025-02-28",
        "effectiveness_score": 73       // (caught / total) * 100
      },
      "security.md": {
        "times_invoked": 30,
        "bugs_in_domain": 5,
        "bugs_caught_by_checklist": 4,
        "bugs_missed": 1,
        "lessons_generated": 2,
        "last_updated": "2025-02-15",
        "effectiveness_score": 80
      }
    },

    // Agents needing attention (lowest effectiveness or most bugs missed)
    "improvement_priorities": [
      {
        "agent": "database.md",
        "reason": "3 missed bugs in Q1, most common: RLS on junction tables",
        "recommended_action": "Add junction table audit to checklist"
      }
    ]
  },

  // ──────────────────────────────────────
  // SECTION 4: Lessons index
  // ──────────────────────────────────────
  "lessons": {
    "total": 23,
    "applied": 19,
    "pending": 4,
    "recent": [
      {
        "id": "2025-02-15-rls-junction-tables",
        "title": "RLS policies on junction tables",
        "category": "anti-pattern",
        "severity": "critical",
        "project": "project-alpha",
        "agent": "database.md",
        "applied": true,
        "applied_date": "2025-02-16"
      },
      {
        "id": "2025-02-22-image-optimization",
        "title": "Next.js Image component requires explicit dimensions for LCP",
        "category": "optimization",
        "severity": "medium",
        "project": "project-beta",
        "agent": "performance.md",
        "applied": false,
        "applied_date": null
      }
    ]
  }
}
```

---

## Field Reference

### Project Status Values

| Value | Meaning |
|-------|---------|
| `active` | Currently in development or receiving regular updates |
| `maintenance` | Launched, receiving only bug fixes and minor updates |
| `completed` | Fully delivered, no ongoing work |
| `paused` | Work temporarily stopped (waiting on client, budget, etc.) |

### Bug Severity Values

| Value | Definition | Response Time |
|-------|-----------|---------------|
| `critical` | System down, data loss, security breach | Immediately |
| `high` | Feature broken, significant user impact | Within 24 hours |
| `medium` | Degraded experience, workaround exists | Within 1 week |
| `low` | Cosmetic, minor inconvenience | Next sprint |

### Bug Category Values

| Value | Covers |
|-------|--------|
| `auth` | Login, sessions, permissions, RBAC, OAuth |
| `data` | Wrong data, missing records, stale cache, query errors |
| `ui` | Layout, styling, responsive, visual regressions |
| `api` | Wrong response, validation, timeout, error handling |
| `performance` | Slow loads, memory leaks, N+1 queries |
| `security` | XSS, CSRF, exposed data, RLS bypass |
| `integration` | Third-party API failures, webhook issues |
| `infrastructure` | Deploy failures, DNS, certs, monitoring gaps |

### Incident Severity Values

| Value | Definition |
|-------|-----------|
| `P0` | Full outage — system completely unavailable |
| `P1` | Major — core functionality broken for many users |
| `P2` | Minor — non-critical feature degraded, workaround available |

---

## How to Update scores.json

### After every sprint / milestone:

```bash
# 1. Pull latest
git pull origin main

# 2. Edit metrics/scores.json
#    - Update project scores
#    - Add any new bugs or incidents
#    - Update estimation actuals

# 3. Update metadata
#    - Set last_updated to current timestamp
#    - Set updated_by to your name

# 4. Commit and push
git add metrics/scores.json
git commit -m "metrics: update [project-name] scores for [date]"
git push origin main
```

### After monthly review:

```bash
# Update portfolio section
# Update agent_performance section
# Update lessons index
# Add new history entries to all active projects
```

### After quarterly review:

```bash
# Update estimation benchmarks in estimation.md
# Archive lessons to metrics/lessons/YYYY-QN.md
# Reset quarterly counters in agent_performance
# Generate portfolio health report via report-generator agent
```

---

## Validation Rules

Before committing updates to scores.json:

```
Required fields:
├── schema_version must be present
├── last_updated must be valid ISO 8601
├── Every project must have all 7 score dimensions
├── All scores must be 0-100
├── score_weights must sum to 100
├── overall score must equal weighted average of dimensions (± 1 for rounding)
├── Bug severity counts must sum to total
├── Bug category counts must sum to total
└── Incident IDs must be unique

Data integrity:
├── History entries must be in chronological order
├── Estimation actual_sessions ≤ reasonable bound (not negative, not 10x estimate)
├── Dates must be valid ISO 8601 format
├── Status must be one of: active | maintenance | completed | paused
└── No sensitive data (client secrets, passwords, PII)
```

---

## Dashboard Consumption

This JSON is designed to be consumed by:

1. **Report Generator agent** — pulls scores into client-facing reports
2. **Estimation agent** — uses historical data to improve future estimates
3. **Metrics agent** — generates quality dashboards and cross-project analysis
4. **Team reviews** — monthly and quarterly review meetings
5. **Future dashboard UI** — if a web dashboard is built, this is the data source

The schema is intentionally flat and readable so it can be edited by hand in any text editor while remaining machine-parseable for automated tooling.
