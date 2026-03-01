# ROUTER.md — Agent Selection & Orchestration

## Purpose

This file is the central routing engine for the CodeBakers agent system. Given any user request, the Router identifies which agents to activate, in what order, and how they compose together. Every request flows through the Router before any agent is consulted.

## How Routing Works

```
User Request
    │
    ▼
┌─────────────────────┐
│  1. Parse Intent     │  What is the user trying to build/do?
│  2. Match Triggers   │  Which agents match the request keywords?
│  3. Resolve Deps     │  What prerequisite agents are needed?
│  4. Order Execution  │  What sequence should agents be consulted?
│  5. Compose Output   │  How do agent outputs combine?
└─────────────────────┘
    │
    ▼
Agent Stack (ordered list of agents to consult)
```

## Agent Tiers (Execution Priority)

Agents are organized into tiers. When multiple agents are activated, higher tiers provide foundational patterns that lower tiers build upon.

```
Tier 1: Foundation     — Always consulted for any app build
Tier 2: Core Features  — Activated by specific feature requirements
Tier 3: UI/UX          — Activated when frontend work is needed
Tier 4: Integrations   — Activated when external service connections are needed
Tier 5: Industries     — Activated when domain-specific expertise is needed
```

**Execution order: Tier 5 → Tier 1 → Tier 2 → Tier 3 → Tier 4**

Industry agents are consulted FIRST because they define the domain model and business rules that all other tiers must respect. Then Foundation sets the architecture, Core Features implement the specifics, UI/UX handles presentation, and Integrations connect external services.

## Trigger Matching Rules

1. **Exact match** — Request contains an exact trigger keyword → activate that agent
2. **Semantic match** — Request implies an agent's domain even without exact keywords → activate
3. **Dependency chain** — Activated agent declares `depends_on` → activate those agents too
4. **Industry context** — If an industry agent is active, prefer industry-specific patterns over generic ones when there's overlap

### Conflict Resolution

When two agents provide conflicting guidance:
- Industry agent wins over generic agent (e.g., `legal.md` trust accounting overrides `accounting.md` generic patterns)
- More specific agent wins over broader agent (e.g., `google-workspace.md` overrides `webhooks.md` for Google-specific webhook patterns)
- Foundation agents provide defaults that feature agents can override

## Complete Agent Registry

### Tier 1: Foundation

| Agent | File | Primary Triggers |
|-------|------|-----------------|
| Backend & API | `foundation/backend.md` | api, routes, endpoints, rest, server, middleware |
| Database & Schema | `foundation/database.md` | database, schema, tables, migrations, postgres, supabase, rls |
| Authentication | `foundation/auth.md` | auth, login, signup, oauth, sso, rbac, permissions, roles |
| DevOps & Deployment | `foundation/devops.md` | deploy, ci/cd, docker, hosting, vercel, environments |
| Performance | `foundation/performance.md` | performance, caching, optimization, speed, lighthouse, lazy load |
| Testing | `foundation/testing.md` | testing, tests, unit test, e2e, integration test, jest, playwright |
| Security | `foundation/security.md` | security, xss, csrf, injection, encryption, vulnerability, hardening |

### Tier 2: Core Features

| Agent | File | Primary Triggers |
|-------|------|-----------------|
| Billing & Payments | `features/billing.md` | billing, payments, stripe, subscriptions, invoicing, checkout |
| Email System | `features/email.md` | email, smtp, transactional email, email templates, resend, sendgrid |
| File Upload & Storage | `features/file-upload.md` | upload, files, storage, s3, images, documents, media |
| Notifications | `features/notifications.md` | notifications, push, in-app notifications, alerts, toasts |
| Search | `features/search.md` | search, full-text, filters, faceted, autocomplete, algolia |
| Scheduling | `features/scheduling.md` | calendar, scheduling, appointments, booking, availability |
| Workflow Automation | `features/workflow-automation.md` | workflow, automation, rules engine, triggers, actions, state machine |
| AI / LLM Features | `features/ai-features.md` | ai, chatbot, llm, openai, embeddings, rag, vector, ai assistant |
| Document AI | `features/document-ai.md` | ocr, pdf generation, document parsing, templates, contracts |
| Realtime | `features/realtime.md` | realtime, websockets, live updates, presence, collaboration |
| Analytics & Tracking | `features/analytics.md` | analytics, tracking, events, metrics, dashboards, reporting |
| Rate Limiting | `features/rate-limiting.md` | rate limit, throttle, abuse prevention, api limits |

### Tier 3: UI/UX

| Agent | File | Primary Triggers |
|-------|------|-----------------|
| Dashboard | `ui/dashboard.md` | dashboard, admin panel, metrics, charts, widgets |
| Data Tables | `ui/data-tables.md` | table, data grid, sortable, filterable, pagination, columns |
| Forms | `ui/forms.md` | forms, form builder, validation, multi-step, dynamic forms |
| Navigation | `ui/navigation.md` | navigation, sidebar, navbar, breadcrumbs, tabs, menu |
| Design System | `ui/design-system.md` | design system, components, theme, tokens, typography, colors |
| Mobile & Responsive | `ui/mobile.md` | mobile, responsive, pwa, touch, native feel |
| Onboarding UX | `ui/onboarding.md` | onboarding, walkthrough, tour, getting started, setup wizard |
| Error & Empty States | `ui/states.md` | error page, 404, empty state, loading, skeleton, fallback |

### Tier 4: Integrations

| Agent | File | Primary Triggers |
|-------|------|-----------------|
| Webhooks | `integrations/webhooks.md` | webhook, inbound webhook, outbound webhook, event delivery |
| Google Workspace | `integrations/google-workspace.md` | google, gmail, google calendar, google drive, google sheets |
| Microsoft 365 | `integrations/microsoft-365.md` | microsoft, outlook, teams, sharepoint, onedrive, graph api |
| Salesforce | `integrations/salesforce.md` | salesforce, soql, sf, sales cloud, sfdc |
| QuickBooks | `integrations/quickbooks.md` | quickbooks, qbo, intuit, invoicing sync |
| SMS & WhatsApp | `integrations/sms-whatsapp.md` | sms, twilio, whatsapp, text message, messaging |
| Zapier & Make | `integrations/zapier-make.md` | zapier, make, integromat, no-code, automation platform |
| Slack | `integrations/slack.md` | slack, slack bot, slash command, block kit |

### Tier 5: Industries

| Agent | File | Primary Triggers |
|-------|------|-----------------|
| Legal | `industries/legal.md` | legal, law firm, case management, trust accounting, LEDES, docket |
| Insurance | `industries/insurance.md` | insurance, policy, claims, underwriting, carrier, premium |
| Healthcare | `industries/healthcare.md` | healthcare, hipaa, patient, ehr, fhir, telehealth, clinical |
| Accounting | `industries/accounting.md` | accounting, general ledger, journal entry, chart of accounts, reconciliation |
| CRM | `industries/crm.md` | crm, contacts, pipeline, deals, leads, sales, opportunities |
| SaaS | `industries/saas.md` | saas, multi-tenant, subscription, feature flags, plans, seats |
| E-Commerce | `industries/ecommerce.md` | ecommerce, catalog, cart, checkout, inventory, orders, shipping |
| Nonprofit | `industries/nonprofit.md` | nonprofit, donations, donor, fundraising, volunteers, grants |
| Real Estate | `industries/realestate.md` | real estate, listings, mls, showings, commission, brokerage |
| Education | `industries/education.md` | education, lms, courses, enrollment, grading, certificates |

## Routing Examples

### Example 1: "Build a law firm case management system"

```
Triggers matched: legal, case management
Industry: legal.md

Agent Stack:
1. industries/legal.md           ← Domain model, trust accounting, conflict checking
2. foundation/database.md        ← Schema design, RLS policies
3. foundation/auth.md            ← Multi-role access (attorney, paralegal, client)
4. foundation/backend.md         ← API routes
5. features/billing.md           ← LEDES billing, invoice generation
6. features/scheduling.md        ← Court deadline calendaring
7. features/document-ai.md       ← Document assembly, PDF generation
8. features/search.md            ← Case/contact search
9. ui/dashboard.md               ← Attorney dashboard
10. ui/data-tables.md            ← Case lists, time entry tables
11. ui/forms.md                  ← Intake forms, time entry
12. foundation/security.md       ← Encryption at rest (attorney-client privilege)
```

### Example 2: "Build a SaaS project management tool with Stripe billing"

```
Triggers matched: saas, billing, stripe, subscriptions
Industry: saas.md

Agent Stack:
1. industries/saas.md            ← Multi-tenant, plans, feature flags
2. foundation/database.md        ← Schema with org_id isolation
3. foundation/auth.md            ← Team management, invitations, SSO
4. foundation/backend.md         ← API design
5. features/billing.md           ← Stripe subscriptions, plan management
6. features/notifications.md     ← In-app + email notifications
7. features/realtime.md          ← Live collaboration features
8. ui/dashboard.md               ← Project dashboards
9. ui/data-tables.md             ← Task lists, project views
10. ui/onboarding.md             ← First-run experience
11. foundation/performance.md    ← Per-tenant optimization
12. foundation/devops.md         ← Deployment strategy
```

### Example 3: "Add WhatsApp messaging to our insurance agency portal"

```
Triggers matched: whatsapp, insurance, agent portal
Industry: insurance.md

Agent Stack:
1. industries/insurance.md       ← Policy/client context for messaging
2. integrations/sms-whatsapp.md  ← WhatsApp Business API, templates, compliance
3. integrations/webhooks.md      ← Twilio webhook handling
4. foundation/backend.md         ← Message routing API
5. foundation/database.md        ← Message storage schema
6. features/notifications.md     ← Delivery status tracking
```

### Example 4: "Create a donor management platform with online giving"

```
Triggers matched: donor, donations, nonprofit, fundraising
Industry: nonprofit.md

Agent Stack:
1. industries/nonprofit.md       ← Donor model, fund accounting, tax receipts
2. foundation/database.md        ← Schema design
3. foundation/auth.md            ← Staff + donor portal access
4. features/billing.md           ← Stripe for donation processing
5. features/email.md             ← Receipt emails, appeal campaigns
6. features/search.md            ← Donor search and segmentation
7. ui/dashboard.md               ← Fundraising dashboards
8. ui/data-tables.md             ← Donor lists, donation history
9. ui/forms.md                   ← Donation forms, intake
10. industries/accounting.md     ← Fund accounting overlay
```

### Example 5: "Build an online course platform with certificates"

```
Triggers matched: courses, education, lms, certificates
Industry: education.md

Agent Stack:
1. industries/education.md       ← Course structure, enrollment, grading, certificates
2. industries/saas.md            ← Multi-tenant if platform (multiple schools)
3. foundation/database.md        ← Schema design
4. foundation/auth.md            ← Student, instructor, admin roles
5. features/billing.md           ← Course payments
6. features/file-upload.md       ← Video and document hosting
7. features/document-ai.md       ← Certificate PDF generation
8. features/search.md            ← Course catalog search
9. ui/forms.md                   ← Quiz builder, assignment submission
10. ui/dashboard.md              ← Student progress, instructor analytics
```

### Example 6: Simple feature request — "Add email notifications"

```
Triggers matched: email, notifications
No industry context.

Agent Stack:
1. features/email.md             ← Email sending infrastructure
2. features/notifications.md     ← Notification preferences, delivery
3. foundation/backend.md         ← API for notification settings
```

## Multi-Agent Composition Rules

### When agents overlap:

1. **Data model**: Industry agent defines the entities. `database.md` provides the implementation patterns (RLS, indexes, migrations). Industry schema takes precedence.

2. **Authentication**: Industry agent defines the roles and access rules. `auth.md` provides the implementation (RBAC, SSO, sessions). Industry role definitions take precedence.

3. **Billing**: Industry agent defines what's being billed and the domain rules (trust accounting, commission splits, donation receipts). `billing.md` provides Stripe implementation. Industry billing rules take precedence.

4. **Search**: Industry agent defines what's searchable and how. `search.md` provides the implementation (full-text, filters, facets). Industry search requirements take precedence.

### Agent output merging:

When building a PROJECT-SPEC from multiple agents:
- **Gate 0 (Identity)**: Industry agent primary, others contribute
- **Gate 1 (Entities)**: Industry agent defines entities, `database.md` adds implementation details
- **Gate 2 (State Changes)**: Industry agent defines business rules, `workflow-automation.md` adds mechanics
- **Gate 3 (Permissions)**: Industry agent defines roles, `auth.md` adds implementation
- **Gate 4 (Dependencies)**: All agents contribute their technology requirements
- **Gate 5 (Integrations)**: Integration agents contribute their specific patterns

## Fallback Behavior

If no agent triggers match:
1. Use `foundation/backend.md` + `foundation/database.md` as the minimum stack
2. Add UI agents based on described deliverables
3. Ask the user for clarification about the domain

If the request is ambiguous between industries:
1. Match the strongest signal (most trigger keywords)
2. If tied, ask the user which industry context applies
3. Multiple industry agents CAN be active simultaneously (e.g., `accounting.md` + `legal.md` for trust accounting)

## Adding New Agents

When a new agent is created:
1. Add it to the appropriate tier in this registry
2. Define unique trigger keywords (check for conflicts with existing agents)
3. Declare `depends_on` for any prerequisite agents
4. Add routing examples showing how it composes with existing agents
5. Update the MANIFEST.md with the new entry
