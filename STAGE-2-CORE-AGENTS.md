# STAGE 2 — CORE AGENTS SPEC

> Complete specification for the 10 core (Tier 1) agents that form the base development team.
> After this stage: full development team available — can build, review, test, fix, and deploy any project.

---

## Overview

Core agents are the foundation team. They're the most frequently loaded agents and cover the fundamentals every project needs. When the conductor can't determine which specialist to use, it defaults to the most relevant core agent.

### Agents in This Stage

| # | File | Name | Domain |
|---|---|---|---|
| 1 | `agents/core/architect.md` | System Architect | System design, estimation, MVP scoping, project profiling |
| 2 | `agents/core/frontend.md` | Frontend Engineer | React/Next.js, components, design token enforcement |
| 3 | `agents/core/backend.md` | Backend Engineer | API routes, server actions, business logic |
| 4 | `agents/core/database.md` | Database Engineer | Schema, migrations, RLS, Supabase, query optimization |
| 5 | `agents/core/auth.md` | Auth Specialist | Authentication, OAuth, RBAC, multi-tenant, sessions |
| 6 | `agents/core/qa.md` | QA Engineer | Test planning, path tracing, test writing, edge cases |
| 7 | `agents/core/security.md` | Security Engineer | OWASP, secrets, RLS audit, headers, XSS/CSRF/SQLi |
| 8 | `agents/core/performance.md` | Performance Engineer | Lighthouse, bundle, queries, caching, Core Web Vitals |
| 9 | `agents/core/ux.md` | UX Engineer | Accessibility, onboarding, empty/loading/error states |
| 10 | `agents/core/devops.md` | DevOps Engineer | CI/CD, deployment, Vercel, Supabase CLI, GitHub Actions |

---

## System Behaviors (Built Into Stage 2)

### Fast Path Detection
Already defined in CLAUDE.md (Stage 1). Core agents respect it — trivial tasks skip agent routing entirely.

### Agent-to-Agent Handoff Protocol
When one agent's work bleeds into another agent's domain:
1. Current agent finishes its immediate task
2. Notes the handoff trigger: "This needs [Agent X] for [reason]"
3. Asks permission before loading the next agent
4. Carries forward all context (what was built, what decisions were made)

Rules:
- Check `conflicts_with` before loading a second agent
- Maximum 3 agents active in one task (beyond that, break into subtasks)
- Always finish current agent's checklist before handoff

### Auto Git Branch Safety Net
Before any agent does substantive work:
```bash
git stash  # if dirty working tree
git checkout -b pre-agent/$(date +%Y%m%d-%H%M%S)  # safety snapshot
git checkout -b feat/[current-work]  # working branch
```
This is enforced by the conductor, not individual agents.

### Confirmation Flow
When 2+ agents are recommended:
1. Show the team: "I'd recommend [Agent A] + [Agent B] for this."
2. Explain roles: "[A] handles [X], [B] handles [Y]."
3. Ask: "Sound good, or want to adjust?"
4. Proceed only after confirmation.

---

## Completion Criteria

Stage 2 is complete when:
1. ✅ All 10 agent files exist in `agents/core/`
2. ✅ Each agent has valid YAML frontmatter (name, tier, triggers, etc.)
3. ✅ Each agent follows the standard body format (Role, When to Use, Anti-Patterns, Standards, Checklist, etc.)
4. ✅ The manifest auto-rebuilds with all 10 agents indexed
5. ✅ Agent triggers are distinct enough to avoid false matches
6. ✅ `depends_on` and `conflicts_with` are accurate
7. ✅ The conductor can route to any core agent from natural language input

---

## Next Stage
→ **Stage 3: Design System** — Design review agent + 4 industry token presets.
