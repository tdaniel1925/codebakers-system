# CodeBakers Agent Manifest

> Complete registry of all agents, code templates, and system files in the CodeBakers system.

---

## System Statistics

| Metric | Count |
|--------|-------|
| Total Agents | 47 |
| Agent Tiers | 5 |
| Code Templates | 8 |
| System Files | 6 |
| Total Files | 61 |

---

## Tier 1 — Foundation (7 agents)

Core infrastructure agents. Every project activates at least 3 of these.

| # | Agent | File Path | Depends On | Key Triggers |
|---|-------|-----------|-----------|-------------|
| 1 | Backend Architecture | `agents/foundation/backend.md` | — | api routes, server architecture, backend setup, next.js api, edge functions, middleware |
| 2 | Database Design | `agents/foundation/database.md` | — | database schema, postgresql, supabase tables, data modeling, migrations, indexes |
| 3 | Authentication | `agents/foundation/auth.md` | `foundation/database.md` | login, signup, auth, password reset, session management, oauth, magic link |
| 4 | DevOps & Deployment | `agents/foundation/devops.md` | `foundation/backend.md` | deployment, ci/cd, vercel, environment variables, preview environments, monitoring |
| 5 | Performance | `agents/foundation/performance.md` | `foundation/backend.md` | page speed, lighthouse, caching, lazy loading, bundle size, core web vitals |
| 6 | Testing | `agents/foundation/testing.md` | `foundation/backend.md` | unit tests, e2e tests, vitest, playwright, test coverage, integration tests |
| 7 | Security | `agents/foundation/security.md` | `foundation/auth.md` | owasp, csrf, xss, rate limiting, input sanitization, content security policy, encryption |

---

## Tier 2 — Core Features (12 agents)

Feature-level agents that add specific capabilities to any project.

| # | Agent | File Path | Depends On | Key Triggers |
|---|-------|-----------|-----------|-------------|
| 8 | Billing & Subscriptions | `agents/features/billing.md` | `foundation/auth.md` | stripe, payments, subscriptions, invoices, pricing plans, checkout, metered billing |
| 9 | Email System | `agents/features/email.md` | `foundation/backend.md` | transactional email, email templates, resend, sendgrid, email notifications |
| 10 | File Upload & Storage | `agents/features/file-upload.md` | `foundation/backend.md`, `foundation/security.md` | file upload, document storage, s3, supabase storage, image upload, pdf upload |
| 11 | Notifications | `agents/features/notifications.md` | `foundation/auth.md` | push notifications, in-app notifications, notification preferences, bell icon, toast |
| 12 | Search | `agents/features/search.md` | `foundation/database.md` | full-text search, search bar, filters, faceted search, typeahead, algolia |
| 13 | Scheduling | `agents/features/scheduling.md` | `foundation/auth.md` | calendar, appointments, booking, time slots, availability, recurring events |
| 14 | Workflow Automation | `agents/features/workflow-automation.md` | `foundation/backend.md`, `foundation/database.md` | automation, triggers, actions, workflow builder, conditional logic, task queue |
| 15 | AI Features | `agents/features/ai-features.md` | `foundation/backend.md` | openai, claude api, ai chat, embeddings, vector search, llm, prompt engineering |
| 16 | Document AI | `agents/features/document-ai.md` | `features/ai-features.md`, `features/file-upload.md` | document parsing, ocr, pdf extraction, contract analysis, document classification |
| 17 | Realtime | `agents/features/realtime.md` | `foundation/database.md` | websockets, realtime updates, live data, supabase realtime, presence, collaboration |
| 18 | Analytics & Reporting | `agents/features/analytics.md` | `foundation/database.md` | dashboards, charts, reports, metrics, kpis, data visualization, export csv |
| 19 | Rate Limiting | `agents/features/rate-limiting.md` | `foundation/backend.md`, `foundation/security.md` | api throttling, rate limit, abuse prevention, token bucket, sliding window |

---

## Tier 3 — UI/UX (8 agents)

Interface and experience agents that shape how users interact with the application.

| # | Agent | File Path | Depends On | Key Triggers |
|---|-------|-----------|-----------|-------------|
| 20 | Dashboard | `agents/ui/dashboard.md` | `features/analytics.md` | admin dashboard, overview page, stats cards, activity feed, quick actions |
| 21 | Data Tables | `agents/ui/data-tables.md` | `foundation/database.md` | table view, sortable columns, pagination, bulk actions, data grid, tanstack table |
| 22 | Forms | `agents/ui/forms.md` | `foundation/backend.md` | form builder, multi-step form, validation, react-hook-form, zod schema, form wizard |
| 23 | Navigation | `agents/ui/navigation.md` | `foundation/auth.md` | sidebar, top nav, breadcrumbs, mobile menu, command palette, tabs |
| 24 | Design System | `agents/ui/design-system.md` | — | component library, button styles, color system, typography, shadcn, design tokens |
| 25 | Mobile Responsive | `agents/ui/mobile.md` | `ui/navigation.md` | responsive design, mobile layout, touch targets, bottom sheet, swipe gestures |
| 26 | Onboarding | `agents/ui/onboarding.md` | `foundation/auth.md` | welcome flow, setup wizard, tutorial, product tour, getting started, first-run |
| 27 | UI States | `agents/ui/states.md` | — | loading states, empty states, error states, skeleton screens, optimistic updates |

---

## Tier 4 — Integrations (8 agents)

Third-party service connectors with production-ready code templates.

| # | Agent | File Path | Depends On | Key Triggers | Code Template |
|---|-------|-----------|-----------|-------------|---------------|
| 28 | Webhooks | `agents/integrations/webhooks.md` | `foundation/backend.md`, `foundation/security.md` | incoming webhooks, outgoing webhooks, webhook verification, event processing | `webhook-receiver.ts`, `webhook-sender-with-retry.ts` |
| 29 | Google Workspace | `agents/integrations/google-workspace.md` | `foundation/auth.md` | google calendar, google drive, gmail api, google oauth, google sheets | `google-calendar-sync.ts`, `google-drive-upload.ts` |
| 30 | Microsoft 365 | `agents/integrations/microsoft-365.md` | `foundation/auth.md` | outlook, microsoft graph, teams, sharepoint, onedrive, azure ad | — |
| 31 | Salesforce | `agents/integrations/salesforce.md` | `foundation/auth.md`, `integrations/webhooks.md` | salesforce crm, salesforce sync, leads, opportunities, salesforce api | — |
| 32 | QuickBooks | `agents/integrations/quickbooks.md` | `foundation/auth.md`, `features/billing.md` | quickbooks, accounting sync, invoice sync, quickbooks online, financial data | `quickbooks-invoice-sync.ts` |
| 33 | SMS & WhatsApp | `agents/integrations/sms-whatsapp.md` | `foundation/backend.md` | twilio, sms notifications, whatsapp messaging, text messages, phone verification | `twilio-sms-handler.ts`, `twilio-whatsapp.ts` |
| 34 | Zapier & Make | `agents/integrations/zapier-make.md` | `integrations/webhooks.md` | zapier integration, make.com, automation platform, no-code integration, triggers | — |
| 35 | Slack | `agents/integrations/slack.md` | `foundation/auth.md`, `integrations/webhooks.md` | slack bot, slack notifications, slack commands, slack oauth, channel messages | `slack-bot-handler.ts` |

---

## Tier 5 — Industries (10 agents)

Domain-specific agents that combine foundation + feature agents into industry patterns.

| # | Agent | File Path | Depends On | Key Triggers |
|---|-------|-----------|-----------|-------------|
| 36 | Legal | `agents/industries/legal.md` | `foundation/auth.md`, `foundation/database.md`, `features/document-ai.md` | law firm, case management, legal documents, client intake, matter tracking, court deadlines |
| 37 | Insurance | `agents/industries/insurance.md` | `foundation/auth.md`, `foundation/database.md`, `features/workflow-automation.md` | insurance claims, policy management, underwriting, claims processing, coverage |
| 38 | Healthcare | `agents/industries/healthcare.md` | `foundation/auth.md`, `foundation/security.md`, `features/scheduling.md` | patient portal, hipaa, medical records, appointments, telehealth, ehr integration |
| 39 | Accounting | `agents/industries/accounting.md` | `foundation/auth.md`, `integrations/quickbooks.md`, `features/analytics.md` | bookkeeping, tax preparation, client portal, financial reports, cpa, general ledger |
| 40 | CRM | `agents/industries/crm.md` | `foundation/auth.md`, `foundation/database.md`, `features/search.md` | contacts, deals, pipeline, lead management, customer relationship, sales tracking |
| 41 | SaaS Platform | `agents/industries/saas.md` | `foundation/auth.md`, `features/billing.md`, `features/analytics.md` | multi-tenant, saas, subscription app, tenant isolation, usage tracking, plan limits |
| 42 | E-Commerce | `agents/industries/ecommerce.md` | `foundation/auth.md`, `features/billing.md`, `features/search.md` | product catalog, shopping cart, checkout, orders, inventory, storefront |
| 43 | Nonprofit | `agents/industries/nonprofit.md` | `foundation/auth.md`, `features/billing.md`, `features/email.md` | donations, donor management, campaigns, fundraising, volunteer tracking, grant management |
| 44 | Real Estate | `agents/industries/realestate.md` | `foundation/auth.md`, `foundation/database.md`, `features/scheduling.md` | property listings, mls, showings, real estate crm, property management, lease tracking |
| 45 | Education | `agents/industries/education.md` | `foundation/auth.md`, `foundation/database.md`, `features/scheduling.md` | lms, courses, students, assignments, grading, enrollment, classroom management |

---

## Code Templates (8)

Production-ready TypeScript files included with integration agents.

| # | Template | File Path | Source Agent | Description |
|---|----------|-----------|-------------|-------------|
| 1 | Webhook Receiver | `templates/code/webhook-receiver.ts` | `integrations/webhooks.md` | Generic incoming webhook handler with signature verification and event routing |
| 2 | Webhook Sender with Retry | `templates/code/webhook-sender-with-retry.ts` | `integrations/webhooks.md` | Outgoing webhook dispatcher with exponential backoff and dead letter queue |
| 3 | Google Calendar Sync | `templates/code/google-calendar-sync.ts` | `integrations/google-workspace.md` | Two-way Google Calendar sync with conflict resolution |
| 4 | Google Drive Upload | `templates/code/google-drive-upload.ts` | `integrations/google-workspace.md` | File upload to Google Drive with folder management and permissions |
| 5 | Twilio SMS Handler | `templates/code/twilio-sms-handler.ts` | `integrations/sms-whatsapp.md` | Send/receive SMS via Twilio with delivery status tracking |
| 6 | Twilio WhatsApp | `templates/code/twilio-whatsapp.ts` | `integrations/sms-whatsapp.md` | WhatsApp Business messaging with template support and media handling |
| 7 | QuickBooks Invoice Sync | `templates/code/quickbooks-invoice-sync.ts` | `integrations/quickbooks.md` | Two-way invoice sync with QuickBooks Online via OAuth2 |
| 8 | Slack Bot Handler | `templates/code/slack-bot-handler.ts` | `integrations/slack.md` | Slack bot with slash commands, interactive messages, and event subscriptions |

---

## System Files (6)

| # | File | Path | Purpose |
|---|------|------|---------|
| 1 | Router | `system/ROUTER.md` | Trigger-based agent routing — maps keywords to activated agents |
| 2 | Conventions | `system/CONVENTIONS.md` | Code standards, naming conventions, project structure rules |
| 3 | Agent Template | `system/AGENT-TEMPLATE.md` | Blank template for creating new agents |
| 4 | Design Tokens | `system/DESIGN-TOKENS.md` | Master token system with 5 themes + Tailwind config |
| 5 | Project Spec | `system/PROJECT-SPEC.md` | Gates 0-5 specification template for generated apps |
| 6 | Manifest | `system/MANIFEST.md` | This file — complete agent registry |

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                  Tier 5 — Industries                    │
│  (legal, insurance, healthcare, accounting, crm, saas,  │
│   ecommerce, nonprofit, realestate, education)          │
└──────────┬──────────────────────┬───────────────────────┘
           │ depends on           │ depends on
           ▼                     ▼
┌─────────────────────┐  ┌───────────────────────────────┐
│  Tier 4 —           │  │  Tier 3 — UI/UX               │
│  Integrations       │  │  (dashboard, tables, forms,    │
│  (webhooks, google, │  │   navigation, design-system,   │
│   ms365, salesforce, │  │   mobile, onboarding, states) │
│   quickbooks, sms,  │  └──────────┬────────────────────┘
│   zapier, slack)    │             │ depends on
└──────────┬──────────┘             │
           │ depends on             │
           ▼                       ▼
┌──────────────────────────────────────────────────────────┐
│                 Tier 2 — Core Features                   │
│  (billing, email, file-upload, notifications, search,    │
│   scheduling, workflow, ai, document-ai, realtime,       │
│   analytics, rate-limiting)                              │
└──────────────────────────┬───────────────────────────────┘
                           │ depends on
                           ▼
┌──────────────────────────────────────────────────────────┐
│                 Tier 1 — Foundation                       │
│  (backend, database, auth, devops, performance,          │
│   testing, security)                                     │
└──────────────────────────────────────────────────────────┘
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-02 | Initial release — 47 agents, 8 templates, 6 system files |
