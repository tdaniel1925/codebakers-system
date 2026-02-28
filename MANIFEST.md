# CodeBakers Agent Manifest

> Auto-generated index of all agents in the system.
> **Do not edit manually** — rebuilt automatically by GitHub Actions on every push to `agents/`.
>
> Last updated: _awaiting first build_

---

## How This Works

The conductor (`CLAUDE.md`) reads this manifest to route user intent to the right agent(s).
Each agent's `triggers` field is matched against keywords extracted from the user's request.

### Matching Rules
1. Extract keywords from user input
2. Compare against each agent's `triggers` list
3. Score = number of keyword matches
4. Highest-scoring agent(s) are loaded
5. If tied, prefer higher-tier agents (core > features > ai > etc.)

---

## Agent Index

<!-- AGENT_INDEX_START -->

_No agents registered yet. Agents will appear here after Stage 2._

<!-- Example entry (for reference):
### Billing & Payments Specialist
- **File:** agents/features/billing.md
- **Tier:** features
- **Triggers:** payments, stripe, subscriptions, billing, invoicing, checkout, refunds, pricing, plans
- **Depends On:** security.md, backend.md
- **Description:** Stripe integration — subscriptions, one-time payments, metered billing, invoicing, webhooks, customer portal, refunds, coupons
-->

<!-- AGENT_INDEX_END -->

---

## Statistics

| Metric | Value |
|---|---|
| Total Agents | 0 |
| Core (Tier 1) | 0 |
| Features (Tier 2) | 0 |
| AI (Tier 3) | 0 |
| Integrations (Tier 4) | 0 |
| Industries (Tier 5) | 0 |
| Compliance (Tier 6) | 0 |
| Infrastructure (Tier 7) | 0 |
| Migration (Tier 8) | 0 |
| Meta | 0 |
| Last Updated | — |

---

## Agent Header Spec

Every agent file must start with this YAML frontmatter for the manifest generator to parse:

```yaml
---
name: [Human-readable name]
tier: [core|features|ai|integrations|industries|compliance|infrastructure|migration|meta]
triggers: [comma-separated keywords that activate this agent]
depends_on: [comma-separated agent filenames this agent works best with]
conflicts_with: [agents that should NOT run simultaneously]
prerequisites: [CLIs, packages, or services that must exist]
description: [One-line description of what this agent does]
code_templates: [comma-separated template filenames in templates/code/]
design_tokens: [which token preset to use, if applicable]
---
```

## Tier Definitions

| Tier | Purpose | Loaded |
|---|---|---|
| **core** | Every-project fundamentals (arch, frontend, backend, DB, auth, QA, security, perf, UX, devops) | Frequently |
| **features** | Specific feature expertise (billing, email, search, dashboards, etc.) | On demand |
| **ai** | AI & automation (voice, chatbot, RAG, workflows, doc processing) | On demand |
| **integrations** | External service connectors (webhooks, Google, Salesforce, Twilio, etc.) | On demand |
| **industries** | Domain knowledge (legal, insurance, healthcare, accounting, etc.) | Per project |
| **compliance** | Regulatory (HIPAA, GDPR, SOC2, PCI, ADA/WCAG) | Per requirement |
| **infrastructure** | Deep infra (edge, jobs, caching, rate limiting, monitoring, scaling, CI/CD) | On demand |
| **migration** | Upgrades & modernization (codebase, database, API versioning, legacy) | On demand |
| **meta** | System management (reports, estimation, monitoring setup, design review, metrics) | On demand |
