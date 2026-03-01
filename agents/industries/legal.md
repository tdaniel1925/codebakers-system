---
name: Legal Industry Specialist
tier: industries
triggers: legal, law firm, attorney, case management, matter tracking, court deadlines, trust accounting, LEDES billing, client portal legal, conflict checking, document assembly, legal hold, docket, litigation, practice management
depends_on: database.md, auth.md, billing.md, document-ai.md
conflicts_with: null
prerequisites: null
description: Legal practice management domain expertise — case/matter tracking, court deadline calendaring, trust (IOLTA) accounting, LEDES billing, conflict checking, document assembly, client portals, and legal-specific compliance patterns
code_templates: null
design_tokens: tokens-legal.css
---

# Legal Industry Specialist

## Role

Provides deep domain expertise for building legal technology applications — practice management systems, case tracking, client portals, billing, and document automation. Understands the unique regulatory, ethical, and workflow requirements of law firms and legal departments, including trust accounting rules, conflict of interest checking, court deadline management, LEDES billing standards, and attorney-client privilege considerations. Ensures every legal app handles sensitive data correctly and follows jurisdictional requirements.

## When to Use

- Building a legal practice management system or case tracker
- Implementing matter/case lifecycle management
- Building trust (IOLTA) accounting for client funds
- Generating LEDES-format invoices for corporate clients
- Implementing conflict of interest checking
- Building court deadline / docket calendaring systems
- Creating client portals for law firms
- Implementing document assembly or legal template systems
- Building legal hold or litigation hold workflows
- Designing role-based access for attorneys, paralegals, staff, and clients

## Also Consider

- **billing.md** — for payment processing infrastructure underlying legal billing
- **document-ai.md** — for OCR, PDF generation, and document template filling
- **scheduling.md** — for calendar and deadline management patterns
- **auth.md** — for multi-role access control (attorney, paralegal, client)
- **hipaa.md** — if handling health-related legal matters
- **compliance/soc2.md** — for enterprise law firm security requirements
- **crm.md** — for client relationship tracking beyond case management

## Anti-Patterns (NEVER Do)

1. **Never commingle trust and operating funds.** Trust (IOLTA) accounts must be completely separate from the firm's operating accounts. This is the #1 ethics violation in legal practice. Your schema must enforce this separation at every level.
2. **Never allow unauthorized access to case files.** Attorney-client privilege means even internal staff may not access certain matters. Implement matter-level access control, not just role-based.
3. **Never delete case records.** Legal records have retention requirements (often 7+ years after matter close). Use soft deletes and archival, never hard deletes.
4. **Never skip conflict checking on new matters.** Opening a matter without checking conflicts against existing clients, adverse parties, and related entities can result in disbarment. Make this a mandatory, blocking workflow step.
5. **Never calculate court deadlines without jurisdiction rules.** Filing deadlines vary by court, case type, and jurisdiction. A wrong deadline can result in case dismissal and malpractice claims.
6. **Never store client communications without encryption.** Attorney-client privilege extends to electronic communications. All stored communications must be encrypted at rest.
7. **Never expose billing rates across clients.** Client A should never see Client B's billing rates. Implement strict data isolation on billing configurations.
8. **Never auto-delete trust account records.** Trust accounting records must be retained per state bar requirements (typically 5-7 years minimum). Some jurisdictions require indefinite retention.

## Standards & Patterns

### Core Data Model

```
Matter (Case)
├── matter_number (unique, firm-wide — e.g., "2024-00147")
├── client_id → Client
├── matter_type (litigation, transactional, advisory, regulatory, estate, etc.)
├── practice_area (corporate, family, criminal, IP, real_estate, employment, etc.)
├── status (intake, active, pending, stayed, closed, archived)
├── responsible_attorney_id → Attorney
├── originating_attorney_id → Attorney (for origination credit)
├── billing_type (hourly, flat_fee, contingency, retainer, hybrid)
├── court / jurisdiction / case_number (if litigation)
├── statute_of_limitations_date
├── date_opened / date_closed
├── conflict_check_completed_at
├── Parties (clients, adverse parties, witnesses, judges, experts)
├── Team Members (attorneys, paralegals, staff — with role + access level)
├── Time Entries
├── Expenses
├── Trust Transactions
├── Documents
├── Deadlines / Docket Entries
├── Notes / Communications Log
└── Invoices
```

### Matter Schema

```sql
CREATE TABLE matters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  matter_number TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES contacts(id),
  matter_type TEXT NOT NULL,
  practice_area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'intake'
    CHECK (status IN ('intake', 'active', 'pending', 'stayed', 'closed', 'archived')),
  description TEXT,
  responsible_attorney_id UUID REFERENCES users(id),
  originating_attorney_id UUID REFERENCES users(id),
  billing_type TEXT NOT NULL DEFAULT 'hourly'
    CHECK (billing_type IN ('hourly', 'flat_fee', 'contingency', 'retainer', 'hybrid', 'pro_bono')),
  billing_rate_override DECIMAL(10,2),
  court_name TEXT,
  jurisdiction TEXT,
  court_case_number TEXT,
  statute_of_limitations DATE,
  date_opened DATE NOT NULL DEFAULT CURRENT_DATE,
  date_closed DATE,
  conflict_check_completed_at TIMESTAMPTZ,
  conflict_check_by UUID REFERENCES users(id),
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, matter_number)
);

-- Matter-level access control (beyond role-based)
CREATE TABLE matter_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('responsible', 'billing', 'working', 'paralegal', 'reviewer', 'read_only')),
  hourly_rate DECIMAL(10,2), -- Override rate for this matter
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(matter_id, user_id)
);

-- RLS: Only team members can access their matters
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matter_team_access" ON matters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM matter_team mt
      WHERE mt.matter_id = matters.id AND mt.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.org_id = matters.org_id
    )
  );
```

### Matter Parties (for Conflict Checking)

```sql
CREATE TABLE matter_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL
    CHECK (party_type IN ('client', 'adverse_party', 'co_counsel', 'witness', 'judge', 'expert', 'related_party')),
  entity_name TEXT NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('individual', 'corporation', 'llc', 'partnership', 'government', 'trust', 'other')),
  contact_id UUID REFERENCES contacts(id),
  aliases TEXT[],               -- Other known names/DBAs
  related_entities TEXT[],      -- Parent companies, subsidiaries
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parties_name ON matter_parties USING gin(to_tsvector('english', entity_name));
CREATE INDEX idx_parties_aliases ON matter_parties USING gin(aliases);
```

### Conflict of Interest Checking

```typescript
interface ConflictResult {
  has_conflicts: boolean;
  conflicts: {
    matter_id: string;
    matter_number: string;
    party_name: string;
    party_type: string;
    match_type: 'exact' | 'fuzzy' | 'alias' | 'related_entity';
    similarity_score: number;
  }[];
}

async function checkConflicts(
  orgId: string,
  partyNames: string[],
  excludeMatterId?: string
): Promise<ConflictResult> {
  const conflicts = [];

  for (const name of partyNames) {
    // 1. Exact name match
    const { data: exactMatches } = await supabase
      .from('matter_parties')
      .select('*, matters!inner(id, matter_number, status, org_id)')
      .eq('matters.org_id', orgId)
      .ilike('entity_name', name);

    // 2. Fuzzy match using trigram similarity (requires pg_trgm extension)
    const { data: fuzzyMatches } = await supabase.rpc('search_parties_fuzzy', {
      search_name: name,
      org_id: orgId,
      similarity_threshold: 0.4,
    });

    // 3. Alias match
    const { data: aliasMatches } = await supabase
      .from('matter_parties')
      .select('*, matters!inner(id, matter_number, status, org_id)')
      .eq('matters.org_id', orgId)
      .contains('aliases', [name]);

    // Combine and deduplicate
    const allMatches = [...(exactMatches ?? []), ...(fuzzyMatches ?? []), ...(aliasMatches ?? [])];

    for (const match of allMatches) {
      if (excludeMatterId && match.matter_id === excludeMatterId) continue;

      conflicts.push({
        matter_id: match.matter_id,
        matter_number: match.matters?.matter_number,
        party_name: match.entity_name,
        party_type: match.party_type,
        match_type: exactMatches?.includes(match) ? 'exact' : 'fuzzy',
        similarity_score: match.similarity ?? 1.0,
      });
    }
  }

  return {
    has_conflicts: conflicts.length > 0,
    conflicts: deduplicateConflicts(conflicts),
  };
}

// PostgreSQL function for fuzzy matching
/*
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION search_parties_fuzzy(
  search_name TEXT,
  p_org_id UUID,
  similarity_threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  id UUID, matter_id UUID, entity_name TEXT, party_type TEXT,
  similarity FLOAT, matter_number TEXT, matter_status TEXT
) AS $$
  SELECT mp.id, mp.matter_id, mp.entity_name, mp.party_type,
         similarity(mp.entity_name, search_name) AS similarity,
         m.matter_number, m.status AS matter_status
  FROM matter_parties mp
  JOIN matters m ON m.id = mp.matter_id
  WHERE m.org_id = p_org_id
    AND similarity(mp.entity_name, search_name) > similarity_threshold
  ORDER BY similarity DESC
  LIMIT 50;
$$ LANGUAGE sql;
*/
```

### Time Tracking

```sql
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES matters(id),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT NOT NULL,
  activity_code TEXT,            -- LEDES/UTBMS activity code
  task_code TEXT,                -- LEDES/UTBMS task code
  billing_rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) GENERATED ALWAYS AS (hours * billing_rate) STORED,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'billed', 'written_off', 'no_charge')),
  is_billable BOOLEAN NOT NULL DEFAULT true,
  invoice_id UUID REFERENCES invoices(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_matter_date ON time_entries(matter_id, date DESC);
CREATE INDEX idx_time_user_date ON time_entries(user_id, date DESC);
CREATE INDEX idx_time_unbilled ON time_entries(matter_id) WHERE status = 'approved' AND invoice_id IS NULL;
```

### Trust (IOLTA) Accounting

```sql
-- Trust account ledger — completely separate from operating accounts
CREATE TABLE trust_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  routing_number_last4 TEXT,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-client trust sub-ledger
CREATE TABLE trust_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_account_id UUID NOT NULL REFERENCES trust_accounts(id),
  matter_id UUID NOT NULL REFERENCES matters(id),
  client_id UUID NOT NULL REFERENCES contacts(id),
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN ('deposit', 'disbursement', 'transfer', 'interest', 'refund', 'fee_payment')),
  amount DECIMAL(12,2) NOT NULL,
  running_balance DECIMAL(12,2) NOT NULL,
  description TEXT NOT NULL,
  check_number TEXT,
  reference_number TEXT,
  payee TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- CRITICAL: Trust balance per client must never go negative
  CONSTRAINT positive_trust_balance CHECK (running_balance >= 0)
);

CREATE INDEX idx_trust_matter ON trust_ledger(matter_id, date DESC);
CREATE INDEX idx_trust_client ON trust_ledger(client_id, date DESC);
CREATE INDEX idx_trust_unreconciled ON trust_ledger(trust_account_id) WHERE reconciled = false;

-- Three-way reconciliation view
CREATE VIEW trust_reconciliation AS
SELECT
  ta.id AS trust_account_id,
  ta.account_name,
  m.matter_number,
  c.display_name AS client_name,
  SUM(CASE WHEN tl.transaction_type IN ('deposit', 'interest') THEN tl.amount ELSE 0 END) AS total_deposits,
  SUM(CASE WHEN tl.transaction_type NOT IN ('deposit', 'interest') THEN tl.amount ELSE 0 END) AS total_disbursements,
  SUM(CASE WHEN tl.transaction_type IN ('deposit', 'interest') THEN tl.amount ELSE -tl.amount END) AS client_balance
FROM trust_ledger tl
JOIN trust_accounts ta ON ta.id = tl.trust_account_id
JOIN matters m ON m.id = tl.matter_id
JOIN contacts c ON c.id = tl.client_id
GROUP BY ta.id, ta.account_name, m.matter_number, c.display_name;
```

### LEDES Billing Format

```typescript
// LEDES 1998B format — industry standard for legal e-billing
// Required by most corporate clients and insurance companies

interface LEDESLine {
  INVOICE_DATE: string;           // YYYYMMDD
  INVOICE_NUMBER: string;
  CLIENT_ID: string;
  LAW_FIRM_MATTER_ID: string;
  INVOICE_TOTAL: string;          // Decimal as string
  BILLING_START_DATE: string;     // YYYYMMDD
  BILLING_END_DATE: string;       // YYYYMMDD
  INVOICE_DESCRIPTION: string;
  LINE_ITEM_NUMBER: string;
  EXP/FEE/INV_ADJ_TYPE: string;  // IF (fee), IE (expense), IS (invoice adjustment)
  LINE_ITEM_NUMBER_OF_UNITS: string;
  LINE_ITEM_ADJUSTMENT_AMOUNT: string;
  LINE_ITEM_TOTAL: string;
  LINE_ITEM_DATE: string;
  LINE_ITEM_TASK_CODE: string;    // UTBMS task code
  LINE_ITEM_EXPENSE_CODE: string; // UTBMS expense code
  LINE_ITEM_ACTIVITY_CODE: string; // UTBMS activity code
  TIMEKEEPER_ID: string;
  LINE_ITEM_DESCRIPTION: string;
  LAW_FIRM_ID: string;
  LINE_ITEM_UNIT_COST: string;
  TIMEKEEPER_NAME: string;
  TIMEKEEPER_CLASSIFICATION: string; // PARTNER, ASSOCIATE, PARALEGAL, OTHER
  CLIENT_MATTER_ID: string;
}

function generateLEDES1998B(invoice: InvoiceWithDetails): string {
  const headers = [
    'INVOICE_DATE', 'INVOICE_NUMBER', 'CLIENT_ID', 'LAW_FIRM_MATTER_ID',
    'INVOICE_TOTAL', 'BILLING_START_DATE', 'BILLING_END_DATE',
    'INVOICE_DESCRIPTION', 'LINE_ITEM_NUMBER', 'EXP/FEE/INV_ADJ_TYPE',
    'LINE_ITEM_NUMBER_OF_UNITS', 'LINE_ITEM_ADJUSTMENT_AMOUNT',
    'LINE_ITEM_TOTAL', 'LINE_ITEM_DATE', 'LINE_ITEM_TASK_CODE',
    'LINE_ITEM_EXPENSE_CODE', 'LINE_ITEM_ACTIVITY_CODE',
    'TIMEKEEPER_ID', 'LINE_ITEM_DESCRIPTION', 'LAW_FIRM_ID',
    'LINE_ITEM_UNIT_COST', 'TIMEKEEPER_NAME', 'TIMEKEEPER_CLASSIFICATION',
    'CLIENT_MATTER_ID',
  ];

  let output = 'LEDES1998B[]|\n';
  output += headers.join('|') + '[]|\n';

  // Add line items (pipe-delimited, []| terminated)
  for (const [idx, entry] of invoice.timeEntries.entries()) {
    const line = [
      formatDate(invoice.date),
      invoice.invoiceNumber,
      invoice.clientId,
      invoice.matterNumber,
      invoice.total.toFixed(2),
      formatDate(invoice.periodStart),
      formatDate(invoice.periodEnd),
      invoice.description,
      String(idx + 1),
      'IF', // Fee
      entry.hours.toFixed(2),
      '0.00',
      entry.amount.toFixed(2),
      formatDate(entry.date),
      entry.taskCode ?? '',
      '',
      entry.activityCode ?? '',
      entry.timekeeperId,
      entry.description,
      invoice.firmId,
      entry.billingRate.toFixed(2),
      entry.timekeeperName,
      entry.timekeeperClass,
      invoice.clientMatterId ?? '',
    ];
    output += line.join('|') + '[]|\n';
  }

  return output;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
```

### Court Deadline / Docket Management

```sql
CREATE TABLE deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES matters(id),
  title TEXT NOT NULL,
  description TEXT,
  deadline_date DATE NOT NULL,
  deadline_time TIME,
  deadline_type TEXT NOT NULL
    CHECK (deadline_type IN ('filing', 'hearing', 'discovery', 'statute_of_limitations',
      'response', 'motion', 'trial', 'deposition', 'mediation', 'custom')),
  court_rule TEXT,               -- e.g., "FRCP Rule 12(a)(1)(A)"
  jurisdiction TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'continued', 'vacated', 'missed')),
  assigned_to UUID REFERENCES users(id),
  reminder_days INT[] DEFAULT '{14, 7, 3, 1}', -- Days before deadline to send reminders
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  parent_deadline_id UUID REFERENCES deadlines(id), -- For cascading deadlines
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deadlines_upcoming ON deadlines(deadline_date)
  WHERE status = 'pending';
CREATE INDEX idx_deadlines_matter ON deadlines(matter_id, deadline_date);

-- Cascading deadline rules (e.g., if trial date moves, related deadlines move too)
CREATE TABLE deadline_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  jurisdiction TEXT NOT NULL,
  case_type TEXT NOT NULL,
  trigger_event TEXT NOT NULL,       -- e.g., 'complaint_filed', 'trial_date_set'
  deadline_name TEXT NOT NULL,
  days_offset INT NOT NULL,          -- Days from trigger event
  calendar_type TEXT NOT NULL DEFAULT 'calendar'
    CHECK (calendar_type IN ('calendar', 'business', 'court')),
  court_rule TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);
```

### Document Assembly Pattern

```typescript
// Template-based document generation using placeholders
interface LegalTemplate {
  id: string;
  name: string;
  category: string;  // 'engagement_letter', 'motion', 'contract', 'pleading'
  template_content: string;  // HTML/DOCX with {{placeholders}}
  variables: {
    name: string;
    label: string;
    type: 'text' | 'date' | 'currency' | 'party_name' | 'address' | 'select';
    required: boolean;
    options?: string[];  // For select type
  }[];
}

// Variables auto-populated from matter data:
// {{client.name}}, {{client.address}}, {{matter.number}}, {{matter.court}},
// {{matter.case_number}}, {{firm.name}}, {{firm.address}},
// {{attorney.name}}, {{attorney.bar_number}}, {{today}}, {{deadline_date}}
```

### Client Portal Access

```sql
-- Separate portal user accounts for clients
CREATE TABLE portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What clients can see per matter
CREATE TABLE portal_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  matter_id UUID NOT NULL REFERENCES matters(id),
  can_view_documents BOOLEAN NOT NULL DEFAULT true,
  can_upload_documents BOOLEAN NOT NULL DEFAULT true,
  can_view_invoices BOOLEAN NOT NULL DEFAULT true,
  can_view_calendar BOOLEAN NOT NULL DEFAULT true,
  can_send_messages BOOLEAN NOT NULL DEFAULT true,
  can_view_trust_balance BOOLEAN NOT NULL DEFAULT true,

  UNIQUE(portal_user_id, matter_id)
);
```

### UTBMS Task & Activity Codes (Subset)

```
Task Codes (what type of work):
L100 — Case Assessment & Development
L110 — Fact Investigation/Development
L120 — Analysis/Strategy
L130 — Experts/Consultants
L140 — Document/File Management
L150 — Budgeting
L200 — Pre-Trial Pleadings & Motions
L300 — Discovery
L400 — Trial Preparation & Trial
L500 — Appeal
L600 — ADR / Settlement

Activity Codes (what was done):
A101 — Plan and prepare for
A102 — Research
A103 — Draft/revise
A104 — Review/analyze
A105 — Communicate (external)
A106 — Communicate (internal)
A107 — Inspect/view
A108 — Travel
A109 — Court appearance
A110 — Deposition
A111 — Negotiation/mediation
```

## Code Templates

No dedicated code templates — the inline patterns provide comprehensive coverage for legal app data models, conflict checking, trust accounting, and LEDES billing.

## Checklist

- [ ] Matter lifecycle (intake → active → closed → archived) implemented with proper status transitions
- [ ] Matter-level access control enforced (not just role-based — team members only)
- [ ] Conflict of interest checking is mandatory before matter opening (blocking workflow)
- [ ] Conflict check covers exact match, fuzzy match, aliases, and related entities
- [ ] Trust (IOLTA) accounting completely separated from operating accounts
- [ ] Trust ledger enforces non-negative client balances (constraint)
- [ ] Three-way trust reconciliation available (bank, book, client sub-ledgers)
- [ ] Time entries support UTBMS task/activity codes for LEDES billing
- [ ] LEDES 1998B export available for corporate/insurance clients
- [ ] Court deadlines with cascading rules and configurable reminders
- [ ] Document assembly with auto-populated matter/client variables
- [ ] Client portal with granular per-matter permissions
- [ ] Soft deletes only — no hard deletes on any legal records
- [ ] All data encrypted at rest (attorney-client privilege)
- [ ] Audit trail on all matter access and modifications

## Common Pitfalls

1. **Trust accounting shortcuts** — Every state bar has specific trust accounting rules. A single commingling violation can result in disbarment. Never take shortcuts with trust fund separation. Always consult jurisdiction-specific rules.
2. **Matter numbering conflicts** — Law firms often have specific numbering conventions (year-sequence, client-matter, etc.). Make matter number format configurable, not hardcoded.
3. **Conflict checking scope** — Conflicts must check not just party names but also aliases, parent/subsidiary companies, spouses, officers, and related entities. A shallow name match is insufficient.
4. **Court deadline calculation** — "30 days" can mean calendar days, business days, or court days depending on jurisdiction and rule. Some jurisdictions exclude holidays, weekends, or both. Build jurisdiction-aware calculators.
5. **Billing rate complexity** — Attorneys may have different rates per client, per matter, per task type, and rates may change over time. The billing system must support rate hierarchies and effective dates.
6. **Document retention** — Closed matters have retention requirements that vary by practice area and jurisdiction. Criminal records may need indefinite retention. Build configurable retention policies, not hard-coded rules.
7. **Ethical walls** — In larger firms, certain attorneys must be completely screened from specific matters (e.g., lateral hires with conflicts). The system must support "ethical wall" restrictions that override normal role-based access.
