---
name: CRM Industry Specialist
tier: industries
triggers: crm, contacts, pipelines, deals, opportunities, lead scoring, sales pipeline, customer relationship, deal tracking, activity logging, email sequences, territory management, sales funnel, contact management, lead management, sales automation
depends_on: database.md, auth.md, email.md, dashboard.md
conflicts_with: null
prerequisites: null
description: CRM domain expertise — contact and company management, sales pipeline with deal stages, activity logging, lead scoring, email sequences, territory management, sales forecasting, and multi-pipeline workflows
code_templates: null
design_tokens: tokens-saas.css
---

# CRM Industry Specialist

## Role

Provides deep domain expertise for building Customer Relationship Management applications — contact databases, sales pipelines, deal tracking, activity logging, and sales automation. Understands the data models, workflows, and UX patterns that make CRMs effective for sales teams, including pipeline stage management, lead scoring algorithms, email sequence automation, territory assignment, and sales forecasting. Ensures every CRM feature is designed for real-world sales workflows, not theoretical database schemas.

## When to Use

- Building a contact and company management system
- Implementing sales pipelines with customizable deal stages
- Building activity logging (calls, emails, meetings, notes)
- Implementing lead scoring and qualification workflows
- Building email sequences / drip campaigns for outreach
- Designing territory and assignment rules
- Implementing sales forecasting and pipeline analytics
- Building custom CRM for a specific industry (legal, real estate, recruiting)
- Integrating CRM with email (Gmail/Outlook), calendar, and phone systems

## Also Consider

- **email.md** — for email sending and tracking integration
- **google-workspace.md** / **microsoft-365.md** — for calendar and email sync
- **dashboard.md** — for sales dashboards, pipeline visualization, and forecasting
- **data-tables.md** — for contact lists, deal views, and activity feeds
- **notifications.md** — for deal alerts, task reminders, and assignment notifications
- **search.md** — for global contact/deal search with filters
- **workflow-automation.md** — for lead routing, deal stage automation, and task creation
- **salesforce.md** — when integrating with or migrating from Salesforce

## Anti-Patterns (NEVER Do)

1. **Never use a single flat contact table for everything.** Contacts and companies are separate entities with a many-to-many relationship. A person can belong to multiple companies and a company has many contacts.
2. **Never hardcode pipeline stages.** Every sales team has different stages. Make pipelines and stages fully configurable with custom fields, required fields per stage, and automation triggers.
3. **Never store activities only as notes.** Activities (calls, emails, meetings, tasks) need structured data — type, duration, outcome, participants, timestamps — not just free-text notes.
4. **Never calculate deal values at query time without caching.** Pipeline totals, forecast amounts, and weighted values should be pre-calculated and updated on change. Real-time aggregation across thousands of deals is too slow.
5. **Never ignore data decay.** Contact data goes stale fast — people change jobs, emails bounce, phones disconnect. Build data quality indicators and prompt users to verify outdated records.
6. **Never build email tracking without consent.** Open tracking, click tracking, and read receipts must respect privacy regulations (CAN-SPAM, GDPR). Always provide opt-out mechanisms.
7. **Never auto-assign leads without fallback rules.** Round-robin and territory-based assignment must handle edge cases: no available reps, reps at capacity, out-of-territory leads.
8. **Never allow duplicate contacts without merge capability.** Duplicates are inevitable. Build deduplication detection (email, phone, name fuzzy match) and merge workflows from day one.

## Standards & Patterns

### Core Data Model

```
CRM Entity Hierarchy:
├── Companies (Organizations)
│   ├── Company details, industry, size, website
│   ├── Contacts (people at this company)
│   └── Deals (opportunities with this company)
├── Contacts (People)
│   ├── Demographics, title, email, phone
│   ├── Company associations (current + historical)
│   ├── Activities (timeline of all interactions)
│   ├── Tags / Segments
│   └── Lead Score
├── Deals (Opportunities)
│   ├── Pipeline + Stage
│   ├── Amount, close date, probability
│   ├── Associated contacts + company
│   ├── Activities specific to this deal
│   └── Products / Line Items
├── Pipelines (configurable)
│   └── Stages (ordered, with rules)
├── Activities
│   ├── Calls, Emails, Meetings, Tasks, Notes
│   └── Linked to contacts, companies, and/or deals
└── Lists / Segments
    └── Static or dynamic groupings of contacts
```

### Contact & Company Schema

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  domain TEXT,                           -- e.g., 'acme.com' (used for dedup + enrichment)
  industry TEXT,
  employee_count_range TEXT,             -- '1-10', '11-50', '51-200', '201-500', '500+'
  annual_revenue_range TEXT,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'US',
  description TEXT,
  owner_id UUID REFERENCES users(id),   -- Account owner
  lifecycle_stage TEXT DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('lead', 'prospect', 'customer', 'churned', 'partner', 'other')),
  source TEXT,                           -- 'website', 'referral', 'cold_outreach', 'event', etc.
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_domain ON companies(org_id, domain);
CREATE INDEX idx_companies_owner ON companies(owner_id);
CREATE INDEX idx_companies_tags ON companies USING gin(tags);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  mobile_phone TEXT,
  job_title TEXT,
  department TEXT,
  linkedin_url TEXT,
  lifecycle_stage TEXT DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist', 'other')),
  lead_status TEXT DEFAULT 'new'
    CHECK (lead_status IN ('new', 'contacted', 'qualified', 'unqualified', 'nurture')),
  lead_score INT DEFAULT 0,
  owner_id UUID REFERENCES users(id),
  source TEXT,
  source_detail TEXT,                    -- e.g., 'Google Ads — Brand Campaign'
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  last_activity_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  email_opted_out BOOLEAN NOT NULL DEFAULT false,
  do_not_call BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_email ON contacts(org_id, email);
CREATE INDEX idx_contacts_owner ON contacts(owner_id);
CREATE INDEX idx_contacts_score ON contacts(org_id, lead_score DESC);
CREATE INDEX idx_contacts_stage ON contacts(org_id, lifecycle_stage);
CREATE INDEX idx_contacts_tags ON contacts USING gin(tags);
CREATE INDEX idx_contacts_name ON contacts USING gin(
  to_tsvector('english', first_name || ' ' || last_name)
);

-- Many-to-many: contacts ↔ companies
CREATE TABLE contact_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT,                             -- 'employee', 'decision_maker', 'champion', 'blocker'
  title_at_company TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,                         -- NULL = current
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(contact_id, company_id)
);
```

### Pipeline & Deal Schema

```sql
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,                    -- e.g., 'Sales Pipeline', 'Enterprise Pipeline'
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- e.g., 'Discovery', 'Proposal', 'Negotiation'
  position INT NOT NULL,                 -- Order in pipeline
  probability INT NOT NULL DEFAULT 0,    -- Win probability: 0-100
  stage_type TEXT NOT NULL DEFAULT 'active'
    CHECK (stage_type IN ('active', 'won', 'lost')),
  required_fields TEXT[],                -- Fields that must be filled to enter this stage
  auto_tasks TEXT[],                     -- Tasks auto-created on stage entry
  days_warning INT,                      -- Alert if deal stays too long
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(pipeline_id, position)
);

CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id),
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
  amount DECIMAL(12,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  weighted_amount DECIMAL(12,2),         -- amount × stage probability
  close_date DATE,
  company_id UUID REFERENCES companies(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  source TEXT,
  loss_reason TEXT,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  last_activity_at TIMESTAMPTZ,
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_pipeline_stage ON deals(pipeline_id, stage_id);
CREATE INDEX idx_deals_owner ON deals(owner_id);
CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_close_date ON deals(close_date) WHERE won_at IS NULL AND lost_at IS NULL;

-- Deal contacts (multiple people involved in a deal)
CREATE TABLE deal_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  role TEXT DEFAULT 'participant'
    CHECK (role IN ('decision_maker', 'champion', 'influencer', 'blocker', 'end_user', 'participant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(deal_id, contact_id)
);

-- Deal stage history (tracks movement through pipeline)
CREATE TABLE deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id),
  to_stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
  changed_by UUID NOT NULL REFERENCES users(id),
  duration_seconds BIGINT,               -- Time spent in previous stage
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Activity / Timeline Schema

```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('call', 'email', 'meeting', 'task', 'note', 'sms', 'linkedin_message', 'custom')),
  subject TEXT,
  body TEXT,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')), -- For calls/emails
  outcome TEXT,                          -- 'connected', 'voicemail', 'no_answer', 'busy', etc.
  duration_seconds INT,

  -- Polymorphic associations
  contact_id UUID REFERENCES contacts(id),
  company_id UUID REFERENCES companies(id),
  deal_id UUID REFERENCES deals(id),

  -- Task-specific fields
  due_date TIMESTAMPTZ,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,

  -- Meeting-specific
  meeting_start TIMESTAMPTZ,
  meeting_end TIMESTAMPTZ,
  meeting_location TEXT,

  -- Email-specific
  email_message_id TEXT,                 -- For threading
  email_opened BOOLEAN DEFAULT false,
  email_clicked BOOLEAN DEFAULT false,

  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_contact ON activities(contact_id, created_at DESC);
CREATE INDEX idx_activities_company ON activities(company_id, created_at DESC);
CREATE INDEX idx_activities_deal ON activities(deal_id, created_at DESC);
CREATE INDEX idx_activities_owner_tasks ON activities(owner_id, due_date)
  WHERE activity_type = 'task' AND is_completed = false;
```

### Lead Scoring

```typescript
interface ScoringRule {
  id: string;
  name: string;
  category: 'demographic' | 'behavioral' | 'engagement' | 'decay';
  condition: {
    field?: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'exists' | 'event';
    value: any;
  };
  points: number;                        // Positive or negative
  max_occurrences?: number;              // Cap for repeatable events
}

const DEFAULT_SCORING_RULES: Omit<ScoringRule, 'id'>[] = [
  // Demographic scoring
  { name: 'Has email', category: 'demographic', condition: { field: 'email', operator: 'exists', value: true }, points: 5 },
  { name: 'Has phone', category: 'demographic', condition: { field: 'phone', operator: 'exists', value: true }, points: 3 },
  { name: 'Has job title', category: 'demographic', condition: { field: 'job_title', operator: 'exists', value: true }, points: 5 },
  { name: 'C-level title', category: 'demographic', condition: { field: 'job_title', operator: 'contains', value: 'CEO|CTO|CFO|COO|VP|Director' }, points: 15 },

  // Behavioral scoring
  { name: 'Email opened', category: 'behavioral', condition: { operator: 'event', value: 'email_opened' }, points: 2, max_occurrences: 10 },
  { name: 'Email clicked', category: 'behavioral', condition: { operator: 'event', value: 'email_clicked' }, points: 5, max_occurrences: 10 },
  { name: 'Form submitted', category: 'behavioral', condition: { operator: 'event', value: 'form_submitted' }, points: 15 },
  { name: 'Meeting booked', category: 'behavioral', condition: { operator: 'event', value: 'meeting_booked' }, points: 25 },
  { name: 'Replied to email', category: 'behavioral', condition: { operator: 'event', value: 'email_reply' }, points: 20 },

  // Decay
  { name: 'No activity 30 days', category: 'decay', condition: { field: 'last_activity_at', operator: 'less_than', value: '30_days_ago' }, points: -10 },
  { name: 'No activity 90 days', category: 'decay', condition: { field: 'last_activity_at', operator: 'less_than', value: '90_days_ago' }, points: -25 },
];

// Score thresholds for lifecycle stage transitions:
// 0-20:   Lead
// 21-50:  MQL (Marketing Qualified Lead)
// 51-80:  SQL (Sales Qualified Lead)
// 81+:    Opportunity
```

### Sales Forecasting

```typescript
interface ForecastData {
  period: string;
  pipeline_value: number;       // Total open deals
  weighted_value: number;       // Sum of (amount × probability)
  committed: number;            // Deals marked as commit
  best_case: number;            // Committed + upside
  closed_won: number;           // Already closed this period
  quota: number;                // Target
  attainment_pct: number;       // closed_won / quota
}

async function generateForecast(
  orgId: string,
  ownerId: string | null,       // null = all reps
  startDate: string,
  endDate: string
): Promise<ForecastData> {
  // Deals expected to close in this period
  let query = supabase
    .from('deals')
    .select('amount, weighted_amount, stage_id, pipeline_stages!inner(probability, stage_type)')
    .eq('org_id', orgId)
    .gte('close_date', startDate)
    .lte('close_date', endDate);

  if (ownerId) query = query.eq('owner_id', ownerId);

  const { data: deals } = await query;

  const openDeals = deals?.filter((d: any) => d.pipeline_stages.stage_type === 'active') ?? [];
  const wonDeals = deals?.filter((d: any) => d.pipeline_stages.stage_type === 'won') ?? [];

  return {
    period: `${startDate} to ${endDate}`,
    pipeline_value: openDeals.reduce((s: number, d: any) => s + (d.amount ?? 0), 0),
    weighted_value: openDeals.reduce((s: number, d: any) => s + (d.weighted_amount ?? 0), 0),
    committed: 0, // Based on deal forecast_category if implemented
    best_case: 0,
    closed_won: wonDeals.reduce((s: number, d: any) => s + (d.amount ?? 0), 0),
    quota: 0, // From quota table
    attainment_pct: 0,
  };
}
```

### Duplicate Detection

```typescript
async function findDuplicateContacts(
  orgId: string,
  email?: string,
  phone?: string,
  firstName?: string,
  lastName?: string
): Promise<{ contact_id: string; match_type: string; confidence: number }[]> {
  const duplicates: any[] = [];

  // Exact email match (highest confidence)
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', email.toLowerCase());
    data?.forEach((c) => duplicates.push({ contact_id: c.id, match_type: 'email', confidence: 1.0 }));
  }

  // Phone match
  if (phone) {
    const normalized = phone.replace(/\D/g, '');
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .or(`phone.eq.${normalized},mobile_phone.eq.${normalized}`);
    data?.forEach((c) => duplicates.push({ contact_id: c.id, match_type: 'phone', confidence: 0.9 }));
  }

  // Fuzzy name match
  if (firstName && lastName) {
    const { data } = await supabase.rpc('fuzzy_contact_search', {
      p_org_id: orgId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_threshold: 0.7,
    });
    data?.forEach((c: any) => duplicates.push({
      contact_id: c.id, match_type: 'name_fuzzy', confidence: c.similarity,
    }));
  }

  // Deduplicate and return highest confidence per contact
  const uniqueMap = new Map<string, any>();
  for (const dup of duplicates) {
    const existing = uniqueMap.get(dup.contact_id);
    if (!existing || dup.confidence > existing.confidence) {
      uniqueMap.set(dup.contact_id, dup);
    }
  }

  return [...uniqueMap.values()].sort((a, b) => b.confidence - a.confidence);
}
```

## Code Templates

No dedicated code templates — the inline patterns cover the full CRM data model, pipeline management, activity tracking, lead scoring, forecasting, and deduplication.

## Checklist

- [ ] Contacts and companies are separate entities with many-to-many relationship
- [ ] Pipelines and stages fully configurable (name, order, probability, required fields)
- [ ] Deal stage history tracked for pipeline velocity metrics
- [ ] Weighted deal amounts auto-calculated (amount × stage probability)
- [ ] Activity timeline aggregates all interactions per contact/company/deal
- [ ] Tasks with due dates, assignments, and completion tracking
- [ ] Lead scoring with configurable rules across demographic and behavioral signals
- [ ] Score decay for inactive leads
- [ ] Duplicate detection on contact create/import (email, phone, name fuzzy)
- [ ] Contact merge workflow preserving all activities and associations
- [ ] Sales forecasting by rep, team, and period
- [ ] Email/calendar sync integration points (Gmail, Outlook)
- [ ] Custom fields (JSONB) on contacts, companies, and deals
- [ ] Global search across contacts, companies, and deals
- [ ] Import/export for bulk contact management

## Common Pitfalls

1. **Activity attribution** — Activities can relate to a contact, a company, and a deal simultaneously. Use polymorphic associations, not separate tables per entity type.
2. **Pipeline stage ordering** — Stages must maintain strict ordering. When reordering, update all positions atomically. A broken sort order corrupts the pipeline view.
3. **Deal rot** — Deals that sit in a stage too long are likely dead. Build "aging" indicators and alerts when deals exceed the expected time per stage.
4. **Contact ownership vs deal ownership** — The contact owner and the deal owner may be different people. Don't assume they're the same. Both need visibility.
5. **Bulk import deduplication** — CSV imports often contain duplicates both within the file and against existing records. Deduplicate within the import batch first, then against the database.
6. **Custom field indexing** — JSONB custom fields are flexible but slow to filter at scale. For commonly-filtered custom fields, consider promoting them to indexed columns or using GIN indexes.
7. **Email deliverability** — Sending too many automated emails from a CRM can damage domain reputation. Implement sending limits, warm-up periods, and bounce handling.
