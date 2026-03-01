# Shared Team Learning Protocol

> How the CodeBakers agent system learns from every project and every team member.

---

## Purpose

Every project generates lessons — patterns that work, patterns that fail, edge cases nobody expected, and shortcuts that save hours. This protocol ensures those lessons flow back into the system so every future project benefits. The goal: the system gets measurably better with every project completed.

---

## How Learning Works

```
Project work generates lessons
        │
        ▼
Team member captures lesson (structured format)
        │
        ▼
Lesson reviewed and categorized
        │
        ▼
Lesson applied to the system
├── Agent updated (new pattern, anti-pattern, or checklist item)
├── Template updated (new code template or modified existing)
├── CODEBAKERS.md updated (new standard or design token rule)
└── Metric baseline updated (new benchmark data)
        │
        ▼
MANIFEST.md auto-rebuilt on push
        │
        ▼
All future projects benefit immediately
```

---

## Lesson Capture Format

Every lesson follows this structure. Keep it concise — if a lesson takes more than 5 minutes to write, it's too long.

```markdown
## Lesson: [Short descriptive title]

**Date:** [Date]
**Project:** [Project name]
**Agent(s):** [Which agent(s) this applies to]
**Category:** [pattern | anti-pattern | edge-case | optimization | tooling]
**Severity:** [critical | high | medium | low]

### Context
[1-2 sentences: what was being built or fixed when this was discovered]

### What Happened
[1-2 sentences: the specific issue, discovery, or insight]

### Root Cause
[1 sentence: why this happened]

### Lesson
[1-2 sentences: the generalizable takeaway that applies to future projects]

### Action
[Specific change to make to the system]
- [ ] Update [agent name] — [section] — add [what]
- [ ] Add to [template name] — [what to add]
- [ ] Add to CODEBAKERS.md — [what to add]
```

**Example:**

```markdown
## Lesson: Supabase RLS policies on junction tables

**Date:** 2025-02-15
**Project:** Client Portal for Apex Affinity
**Agent(s):** database.md, security.md
**Category:** anti-pattern
**Severity:** critical

### Context
Building a multi-tenant portal where users belong to organizations through a junction table.

### What Happened
RLS policies on the main tables were correct, but the junction table (user_organizations) had no RLS. Any authenticated user could query all organization memberships.

### Root Cause
Junction tables are easy to overlook during RLS audit because they feel like "infrastructure" rather than "data."

### Lesson
Every table with user-facing data needs RLS — especially junction tables in multi-tenant systems. Add junction table RLS check to the database agent's checklist.

### Action
- [ ] Update database.md — Checklist — add "RLS policies on ALL junction tables verified"
- [ ] Update security.md — Anti-Patterns — add "NEVER skip RLS on junction tables"
```

---

## When to Capture Lessons

Capture a lesson immediately when any of these occur:

```
MUST capture:
├── A bug reached production that an agent should have caught
├── A pattern worked significantly better than expected
├── An anti-pattern caused > 1 hour of debugging
├── A client reported an issue that wasn't in any checklist
├── A third-party integration had an undocumented gotcha
├── An estimation was off by more than 30%
└── A security or data issue was discovered

SHOULD capture:
├── A code pattern was reused across 2+ projects
├── A checklist item caught a real bug during review
├── A new tool or library proved significantly better than current recommendation
├── A design pattern from a reference site was successfully adapted
└── A performance optimization produced measurable improvement

NICE TO capture:
├── A shortcut or automation that saved time
├── A communication pattern that worked well with a client
└── A development workflow improvement
```

---

## Lesson Review Process

```
Frequency: End of every project + monthly for active projects

Review steps:
1. Collect all captured lessons since last review
2. Deduplicate (same lesson from different projects = high priority)
3. Validate (is this generalizable or project-specific?)
4. Prioritize by frequency and severity
5. Apply to system (update agents, templates, standards)
6. Commit changes to codebakers-system repo
7. Manifest auto-rebuilds
```

### Prioritization Matrix

```
                    AFFECTS MANY PROJECTS
                           │
     Apply this sprint     │    Apply immediately
     (scheduled update)    │    (same-day commit)
                           │
  LOW ─────────────────────┼───────────────────── HIGH
  SEVERITY                 │                    SEVERITY
                           │
     Log for quarterly     │    Apply next sprint
     review                │    (within 1 week)
                           │
                    AFFECTS FEW PROJECTS
```

---

## Lesson Categories and Where They Go

| Category | Definition | Destination |
|----------|-----------|-------------|
| **Pattern** | A technique that works well and should be reused | Agent → Standards & Patterns section |
| **Anti-pattern** | A mistake to avoid in all future projects | Agent → Anti-Patterns section |
| **Edge case** | A non-obvious scenario that needs handling | Agent → Common Pitfalls section |
| **Optimization** | A way to do something faster or better | Agent → Standards & Patterns or Code Templates |
| **Tooling** | A tool, library, or config that improves workflow | CODEBAKERS.md or setup.sh |

---

## Cross-Project Pattern Detection

Some lessons only become visible when you look across multiple projects. Run this analysis monthly:

### Bug Pattern Analysis

```markdown
## Monthly Bug Pattern Review: [Month Year]

### Top Bug Categories (across all active projects)
1. [Category]: [X] bugs across [Y] projects
2. [Category]: [X] bugs across [Y] projects
3. [Category]: [X] bugs across [Y] projects

### Recurring Patterns
- [Pattern]: Seen in [Project A, Project B, Project C]
  → Root cause: [Why this keeps happening]
  → System fix: [What to change in which agent]

### Agent Gaps
- [Agent name] missed [issue type] in [X] projects
  → Checklist addition needed: [Specific item]

### Estimation Accuracy
- Average estimate variance: [X]% over/under
- Most underestimated feature type: [Feature type]
- Most overestimated feature type: [Feature type]
  → Adjust estimation benchmarks: [Specific change]
```

### Performance Benchmark Updates

```markdown
## Quarterly Performance Benchmarks

### Session Counts (actual vs estimated)
| Project Type | Estimated Avg | Actual Avg | Variance |
|-------------|--------------|------------|----------|
| Landing page | X | X | X% |
| CRUD app | X | X | X% |
| SaaS MVP | X | X | X% |
| Client portal | X | X | X% |
| AI integration | X | X | X% |

### Update estimation.md historical benchmarks with actual data
```

---

## Lesson Storage

Lessons are stored in the project repository during active development and consolidated into the codebakers-system repo during review.

### During a project:

```
project-folder/
└── .lessons/
    ├── 2025-02-15-rls-junction-tables.md
    ├── 2025-02-18-stripe-webhook-retry.md
    └── 2025-02-22-image-optimization-next.md
```

### After review and application:

```
codebakers-system/
└── metrics/
    ├── scores.json          (project health scores)
    └── lessons/
        ├── 2025-Q1.md       (consolidated quarterly lessons)
        └── 2025-Q2.md
```

---

## Team Contribution Guidelines

### Who captures lessons?
Anyone working on a project. The person closest to the discovery writes the lesson — they have the most context.

### Quality bar
A good lesson is:
- **Specific** — names the exact file, function, or pattern
- **Generalizable** — applies beyond the single project where it was found
- **Actionable** — includes a concrete system change, not just an observation
- **Concise** — fits in the template above without overflowing

A bad lesson is:
- Vague ("be careful with auth" — careful how? which part of auth?)
- Project-specific ("Client X wants blue buttons" — not generalizable)
- No action ("Supabase is tricky sometimes" — what do we change?)
- Too long (if it takes more than 5 minutes to read, split it up)

### Credit
Lessons should note who discovered them. Good lessons that improve the system are a direct contribution to team quality.

---

## Integration with Agents

When a lesson results in an agent update, the change follows this format:

```markdown
### In the agent file, add a comment marking the source:

## Anti-Patterns (NEVER Do)
- **NEVER skip RLS on junction tables** — multi-tenant junction tables 
  are the most commonly missed RLS target. Every table with user-scoped 
  data needs a policy, including join tables.
  <!-- Lesson: 2025-02-15, Project: Apex Portal -->
```

The HTML comment is invisible in rendered markdown but provides traceability from the rule back to the real-world experience that created it.

---

## Success Metrics for the Learning System

The learning system itself should be measured:

```
Trailing indicators (quality):
├── Bugs per project trending down quarter over quarter
├── Estimation accuracy improving (variance shrinking)
├── Time to resolve incidents decreasing
├── Client-reported issues decreasing
└── Health scores trending up across portfolio

Leading indicators (process):
├── Lessons captured per project (target: 3-5 per project)
├── Time from lesson capture to system update (target: < 2 weeks)
├── Percentage of lessons that result in agent updates (target: > 60%)
├── Monthly review completed on schedule (target: 100%)
└── Team members contributing lessons (target: everyone)
```

---

## Quick Reference

```
Discovered something? → Write it up in the lesson template (5 minutes)
End of project?       → Review all .lessons/ files, consolidate
Monthly review?       → Cross-project pattern analysis
Quarterly review?     → Update benchmarks, archive lessons, measure improvement
```

The system only improves if lessons are captured. A 5-minute lesson today saves hours across dozens of future projects.
