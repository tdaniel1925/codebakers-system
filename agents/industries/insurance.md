---
name: Insurance Industry Specialist
tier: industries
triggers: insurance, quoting engine, policy management, claims, underwriting, agent portal, commission tracking, insurance portal, premium, deductible, coverage, endorsement, binder, carrier, adjuster, loss ratio, insurance crm
depends_on: database.md, auth.md, billing.md, workflow-automation.md
conflicts_with: null
prerequisites: null
description: Insurance domain expertise — quoting engines, policy lifecycle management, claims processing, underwriting workflows, agent/broker portals, commission tracking, carrier integrations, and insurance-specific compliance patterns
code_templates: null
design_tokens: tokens-corporate.css
---

# Insurance Industry Specialist

## Role

Provides deep domain expertise for building insurance technology applications — agency management systems, quoting engines, policy administration, claims processing, and agent portals. Understands the unique data models, regulatory requirements, and multi-party relationships in insurance (carriers, agencies, brokers, policyholders, adjusters) and the complex workflows that connect them. Ensures every insurance app correctly handles policy lifecycles, premium calculations, commission structures, and compliance requirements.

## When to Use

- Building an insurance agency management system (AMS)
- Implementing a quoting engine (single or multi-carrier)
- Building policy lifecycle management (quote → bind → issue → renew → cancel)
- Implementing claims intake, tracking, and processing workflows
- Building agent/broker portals with commission dashboards
- Designing underwriting workflows and risk assessment tools
- Implementing commission tracking and split calculations
- Building policyholder self-service portals
- Integrating with carrier APIs or comparative raters

## Also Consider

- **billing.md** — for premium payment processing and installment plans
- **workflow-automation.md** — for underwriting and claims workflow engines
- **document-ai.md** — for policy document generation and claims document processing
- **email.md** — for policy notifications, renewal reminders, and claims correspondence
- **scheduling.md** — for adjuster appointments and inspection scheduling
- **dashboard.md** — for agency performance dashboards and loss ratio tracking
- **compliance/soc2.md** — for carrier security requirements

## Anti-Patterns (NEVER Do)

1. **Never allow policy issuance without binding authority verification.** Agents must have active binding authority from the carrier for the specific line of business. Issuing without authority exposes the agency to E&O liability.
2. **Never store full SSNs or driver's license numbers in plaintext.** Insurance apps handle sensitive PII. Encrypt at rest and mask in the UI (show last 4 only).
3. **Never hardcode premium calculations.** Rates change frequently by carrier, state, line of business, and effective date. All rating factors must be configurable and versioned.
4. **Never skip state-specific compliance rules.** Insurance is regulated state by state. Filing requirements, cancellation notice periods, surplus lines taxes, and disclosure requirements all vary by jurisdiction.
5. **Never commingle agency and policyholder funds.** Premium trust accounts must be separate from agency operating accounts (similar to legal trust accounting). State departments of insurance audit this.
6. **Never delete policy or claims records.** Regulatory retention requirements are typically 5-10 years after policy expiration. Use soft deletes and archival only.
7. **Never allow commission payments without reconciliation.** Commission statements from carriers must be reconciled against expected commissions before paying agents. Discrepancies are common.
8. **Never ignore the renewal pipeline.** Renewals are the lifeblood of an agency. The system must automatically surface upcoming renewals 60-90 days out and track the renewal workflow.

## Standards & Patterns

### Core Data Model

```
Agency / Brokerage
├── Agents / Producers (licensed individuals)
├── Carriers (insurance companies the agency represents)
│   ├── Appointments (binding authority per line of business)
│   └── Commission Schedules (rates per product/line)
├── Clients (policyholders — individuals or businesses)
│   ├── Policies
│   │   ├── Quote → Application → Bind → Issue → Endorse → Renew → Cancel
│   │   ├── Coverages (what's covered, limits, deductibles)
│   │   ├── Premiums (written, earned, installments)
│   │   ├── Documents (declarations, endorsements, certificates)
│   │   └── Claims
│   │       ├── Claimant, Loss Details, Reserve, Payments
│   │       └── Status Workflow (FNOL → Investigation → Evaluation → Settlement → Closed)
│   └── Certificates of Insurance (COIs)
└── Commissions
    ├── Expected (from policy premium × rate)
    ├── Received (from carrier statements)
    └── Agent Splits (per producer)
```

### Policy Schema

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  policy_number TEXT,                    -- Carrier-assigned (null until issued)
  agency_reference TEXT NOT NULL,        -- Internal tracking number
  client_id UUID NOT NULL REFERENCES contacts(id),
  carrier_id UUID NOT NULL REFERENCES carriers(id),
  producer_id UUID NOT NULL REFERENCES users(id),    -- Writing agent
  line_of_business TEXT NOT NULL
    CHECK (line_of_business IN (
      'personal_auto', 'homeowners', 'renters', 'umbrella', 'life', 'health',
      'commercial_auto', 'general_liability', 'commercial_property', 'bop',
      'workers_comp', 'professional_liability', 'cyber', 'directors_officers',
      'inland_marine', 'bonds', 'flood', 'earthquake', 'other'
    )),
  status TEXT NOT NULL DEFAULT 'quote'
    CHECK (status IN ('quote', 'application', 'submitted', 'bound', 'issued',
      'active', 'pending_cancel', 'cancelled', 'expired', 'non_renewed', 'reinstated')),
  effective_date DATE,
  expiration_date DATE,
  cancellation_date DATE,
  cancellation_reason TEXT,
  written_premium DECIMAL(12,2),
  annual_premium DECIMAL(12,2),
  billing_type TEXT CHECK (billing_type IN ('agency_bill', 'direct_bill', 'premium_finance')),
  payment_plan TEXT,                     -- monthly, quarterly, annual, etc.
  prior_policy_id UUID REFERENCES policies(id),  -- For renewals
  renewal_of UUID REFERENCES policies(id),
  is_new_business BOOLEAN NOT NULL DEFAULT true,
  underwriting_status TEXT DEFAULT 'pending'
    CHECK (underwriting_status IN ('pending', 'approved', 'declined', 'referred', 'moratorium')),
  surplus_lines BOOLEAN NOT NULL DEFAULT false,
  state TEXT NOT NULL,                   -- Policy state (for regulation)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_policies_client ON policies(client_id, status);
CREATE INDEX idx_policies_expiring ON policies(expiration_date)
  WHERE status IN ('active', 'issued');
CREATE INDEX idx_policies_producer ON policies(producer_id, status);
CREATE INDEX idx_policies_carrier ON policies(carrier_id, status);
```

### Coverage Details

```sql
CREATE TABLE policy_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  coverage_type TEXT NOT NULL,           -- e.g., 'bodily_injury', 'property_damage', 'collision'
  description TEXT NOT NULL,
  limit_per_occurrence DECIMAL(12,2),
  limit_aggregate DECIMAL(12,2),
  deductible DECIMAL(12,2),
  premium DECIMAL(10,2),
  is_included BOOLEAN NOT NULL DEFAULT true,
  effective_date DATE,
  expiration_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Named insureds, additional insureds, drivers, locations, vehicles, etc.
CREATE TABLE policy_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('named_insured', 'additional_insured', 'driver',
      'vehicle', 'location', 'equipment', 'mortgagee', 'loss_payee', 'certificate_holder')),
  entity_data JSONB NOT NULL,            -- Flexible schema per entity type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Quoting Engine Pattern

```typescript
interface QuoteRequest {
  line_of_business: string;
  state: string;
  effective_date: string;
  client_info: {
    type: 'individual' | 'business';
    name: string;
    address: Address;
    date_of_birth?: string;       // Personal lines
    business_type?: string;       // Commercial lines
    years_in_business?: number;
  };
  risk_details: Record<string, any>;  // Line-specific (vehicles, property, revenue, etc.)
  requested_coverages: {
    coverage_type: string;
    requested_limit?: number;
    requested_deductible?: number;
  }[];
  current_carrier?: string;
  prior_claims?: { date: string; type: string; amount: number }[];
}

interface QuoteResult {
  carrier_id: string;
  carrier_name: string;
  quote_number: string;
  annual_premium: number;
  monthly_premium: number;
  coverages: {
    coverage_type: string;
    limit: number;
    deductible: number;
    premium: number;
  }[];
  eligible: boolean;
  decline_reason?: string;
  valid_until: string;
  documents?: { name: string; url: string }[];
}

// Multi-carrier quoting flow
async function getQuotes(request: QuoteRequest): Promise<QuoteResult[]> {
  // 1. Find eligible carriers for this line + state
  const carriers = await getEligibleCarriers(
    request.line_of_business,
    request.state,
    request.effective_date
  );

  // 2. Submit to each carrier (parallel)
  const quotePromises = carriers.map((carrier) =>
    submitToCarrier(carrier, request).catch((err) => ({
      carrier_id: carrier.id,
      carrier_name: carrier.name,
      eligible: false,
      decline_reason: err.message,
    }))
  );

  const results = await Promise.allSettled(quotePromises);

  // 3. Normalize and rank results
  const quotes = results
    .filter((r): r is PromiseFulfilledResult<QuoteResult> => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => {
      // Eligible first, then by premium
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (a.annual_premium ?? Infinity) - (b.annual_premium ?? Infinity);
    });

  return quotes;
}
```

### Carrier & Appointment Management

```sql
CREATE TABLE carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  naic_code TEXT,                        -- National Association of Insurance Commissioners code
  am_best_rating TEXT,                   -- A++, A+, A, B++, etc.
  api_type TEXT CHECK (api_type IN ('rest', 'soap', 'rater', 'manual', 'portal')),
  api_config JSONB,                      -- Connection details (encrypted)
  lines_of_business TEXT[] NOT NULL,
  states_licensed TEXT[] NOT NULL,
  is_admitted BOOLEAN NOT NULL DEFAULT true,  -- Admitted vs surplus lines
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Binding authority per agent per carrier per line
CREATE TABLE carrier_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES carriers(id),
  producer_id UUID NOT NULL REFERENCES users(id),
  lines_of_business TEXT[] NOT NULL,
  states TEXT[] NOT NULL,
  binding_authority_limit DECIMAL(12,2),  -- Max policy premium agent can bind
  effective_date DATE NOT NULL,
  expiration_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'terminated', 'pending')),
  appointment_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(carrier_id, producer_id)
);
```

### Claims Processing

```sql
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  claim_number TEXT NOT NULL,
  policy_id UUID NOT NULL REFERENCES policies(id),
  client_id UUID NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'fnol'
    CHECK (status IN ('fnol', 'open', 'investigation', 'evaluation',
      'negotiation', 'litigation', 'settled', 'closed', 'reopened', 'denied', 'subrogation')),
  loss_date DATE NOT NULL,
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  loss_type TEXT NOT NULL,               -- e.g., 'collision', 'fire', 'theft', 'slip_and_fall'
  loss_description TEXT NOT NULL,
  loss_location TEXT,
  police_report_number TEXT,
  claimant_name TEXT,                    -- If third-party claim
  claimant_type TEXT CHECK (claimant_type IN ('first_party', 'third_party')),
  adjuster_id UUID REFERENCES users(id),
  carrier_claim_number TEXT,             -- Carrier's reference
  reserve_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  deductible_amount DECIMAL(12,2),
  subrogation_amount DECIMAL(12,2) DEFAULT 0,
  closed_date DATE,
  closed_reason TEXT,
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, claim_number)
);

-- Claim activity / diary log
CREATE TABLE claim_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('note', 'status_change', 'payment', 'reserve_change',
      'document_added', 'contact', 'inspection', 'assignment', 'subrogation')),
  description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  amount DECIMAL(12,2),
  performed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Claim payments
CREATE TABLE claim_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id),
  payment_type TEXT NOT NULL
    CHECK (payment_type IN ('indemnity', 'expense', 'medical', 'legal', 'salvage', 'subrogation_recovery')),
  payee TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  check_number TEXT,
  payment_date DATE NOT NULL,
  description TEXT,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claims_policy ON claims(policy_id);
CREATE INDEX idx_claims_status ON claims(status) WHERE status NOT IN ('closed', 'denied');
CREATE INDEX idx_claims_adjuster ON claims(adjuster_id) WHERE status NOT IN ('closed', 'denied');
```

### Commission Tracking

```sql
-- Commission schedule per carrier per line of business
CREATE TABLE commission_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES carriers(id),
  line_of_business TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('new', 'renewal')),
  commission_rate DECIMAL(5,4) NOT NULL,  -- e.g., 0.1500 = 15%
  effective_date DATE NOT NULL,
  expiration_date DATE,
  override_rate DECIMAL(5,4),            -- Agency override on top of base
  contingency_eligible BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expected commissions (calculated when policy is bound/issued)
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id),
  carrier_id UUID NOT NULL REFERENCES carriers(id),
  producer_id UUID NOT NULL REFERENCES users(id),
  commission_type TEXT NOT NULL
    CHECK (commission_type IN ('new_business', 'renewal', 'override', 'contingency', 'bonus')),
  premium_basis DECIMAL(12,2) NOT NULL,  -- Premium used for calculation
  commission_rate DECIMAL(5,4) NOT NULL,
  expected_amount DECIMAL(10,2) NOT NULL,
  received_amount DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected', 'partial', 'received', 'reconciled', 'disputed', 'written_off')),
  statement_date DATE,                   -- Carrier statement date
  payment_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Producer splits (how commission is divided among agents)
CREATE TABLE commission_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES commissions(id),
  producer_id UUID NOT NULL REFERENCES users(id),
  split_percentage DECIMAL(5,4) NOT NULL,  -- e.g., 0.6000 = 60%
  split_amount DECIMAL(10,2) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('writing_agent', 'account_manager', 'referral', 'house')),
  paid_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_policy ON commissions(policy_id);
CREATE INDEX idx_commissions_producer ON commissions(producer_id, status);
CREATE INDEX idx_commissions_unreconciled ON commissions(carrier_id)
  WHERE status IN ('expected', 'partial', 'disputed');
```

### Commission Calculation

```typescript
async function calculateCommission(policy: Policy): Promise<void> {
  // 1. Find applicable commission schedule
  const { data: schedule } = await supabase
    .from('commission_schedules')
    .select('*')
    .eq('carrier_id', policy.carrier_id)
    .eq('line_of_business', policy.line_of_business)
    .eq('business_type', policy.is_new_business ? 'new' : 'renewal')
    .lte('effective_date', policy.effective_date)
    .or(`expiration_date.is.null,expiration_date.gte.${policy.effective_date}`)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single();

  if (!schedule) {
    console.warn(`No commission schedule for carrier=${policy.carrier_id} lob=${policy.line_of_business}`);
    return;
  }

  const premiumBasis = policy.written_premium ?? policy.annual_premium ?? 0;
  const expectedAmount = round2(premiumBasis * schedule.commission_rate);

  // 2. Create commission record
  const { data: commission } = await supabase
    .from('commissions')
    .insert({
      policy_id: policy.id,
      carrier_id: policy.carrier_id,
      producer_id: policy.producer_id,
      commission_type: policy.is_new_business ? 'new_business' : 'renewal',
      premium_basis: premiumBasis,
      commission_rate: schedule.commission_rate,
      expected_amount: expectedAmount,
      status: 'expected',
    })
    .select('id')
    .single();

  // 3. Calculate splits
  const splits = await getProducerSplits(policy.id, policy.producer_id);
  const splitRecords = splits.map((split) => ({
    commission_id: commission!.id,
    producer_id: split.producer_id,
    split_percentage: split.percentage,
    split_amount: round2(expectedAmount * split.percentage),
    role: split.role,
  }));

  await supabase.from('commission_splits').insert(splitRecords);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

### Renewal Pipeline

```typescript
// Run daily to surface upcoming renewals
async function processRenewalPipeline(orgId: string, daysOut: number = 90) {
  const cutoffDate = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const { data: expiring } = await supabase
    .from('policies')
    .select('*, contacts(*), carriers(*), users!producer_id(*)')
    .eq('org_id', orgId)
    .in('status', ['active', 'issued'])
    .lte('expiration_date', cutoffDate)
    .order('expiration_date', { ascending: true });

  for (const policy of expiring ?? []) {
    // Check if renewal already exists
    const { data: existing } = await supabase
      .from('policies')
      .select('id')
      .eq('renewal_of', policy.id)
      .single();

    if (existing) continue; // Already in renewal process

    // Create renewal task/notification
    const daysUntilExpiry = Math.ceil(
      (new Date(policy.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    await createRenewalTask({
      policy_id: policy.id,
      producer_id: policy.producer_id,
      client_name: policy.contacts.display_name,
      carrier_name: policy.carriers.name,
      expiration_date: policy.expiration_date,
      days_until_expiry: daysUntilExpiry,
      annual_premium: policy.annual_premium,
    });
  }
}
```

### Certificate of Insurance (COI) Generation

```typescript
interface COIRequest {
  policy_id: string;
  certificate_holder: {
    name: string;
    address: Address;
  };
  additional_insured?: boolean;
  waiver_of_subrogation?: boolean;
  description_of_operations?: string;
}

// COIs are one of the most frequent requests agencies handle
// The system should support:
// 1. Template-based generation (ACORD 25 format)
// 2. Batch generation for clients with many certificate holders
// 3. Auto-renewal when policy renews
// 4. Certificate holder notifications on cancellation/non-renewal
// 5. Self-service portal for certificate holders to verify coverage
```

### Key Insurance Terminology for Data Models

```
Written Premium — Total premium for the policy term
Earned Premium — Portion of premium "used up" based on time elapsed
Unearned Premium — Remaining premium that would be refunded on cancellation
Loss Ratio — Claims paid ÷ Earned premium (key profitability metric)
Combined Ratio — (Claims + Expenses) ÷ Earned premium
Binder — Temporary proof of coverage before policy is formally issued
Endorsement — Amendment to an existing policy (adds/removes coverage)
Declarations Page (Dec Page) — Summary page of the policy
FNOL — First Notice of Loss (initial claim report)
Reserve — Estimated cost to settle a claim
Subrogation — Recovering claim payments from the at-fault party
Surplus Lines — Coverage from non-admitted carriers (special tax rules)
E&O — Errors and Omissions (professional liability for agents)
ACORD — Association for Cooperative Operations Research and Development (standard forms)
```

## Code Templates

No dedicated code templates — the inline patterns provide comprehensive schemas and logic for the full insurance agency workflow.

## Checklist

- [ ] Policy lifecycle states properly enforced (quote → bind → issue → renew → cancel)
- [ ] Multi-carrier quoting engine with parallel submission and result ranking
- [ ] Carrier appointments tracked with binding authority limits per agent/line/state
- [ ] Claims workflow with FNOL intake, reserve tracking, and payment management
- [ ] Commission schedules configurable per carrier/line/business type
- [ ] Commission reconciliation against carrier statements
- [ ] Producer splits calculated and tracked for each commission
- [ ] Renewal pipeline automatically surfaces expiring policies 60-90 days out
- [ ] Certificate of Insurance generation and certificate holder management
- [ ] Premium trust accounting separated from agency operating funds
- [ ] PII (SSN, DOB, DL#) encrypted at rest and masked in UI
- [ ] Surplus lines flagging with appropriate tax calculations by state
- [ ] Audit trail on all policy and claims modifications
- [ ] Document management for policy documents, endorsements, claims files
- [ ] Soft deletes only — regulatory retention requirements enforced

## Common Pitfalls

1. **State regulatory variation** — Insurance is regulated state by state. Cancellation notice periods (10-60 days), surplus lines taxes (0-5%), and filing requirements all differ. Build state-aware rule engines, not hardcoded values.
2. **Commission timing** — Carriers pay commissions on different schedules (as-earned, upfront, quarterly). Some carriers claw back commissions on cancelled policies. Track both expected and received amounts separately.
3. **Policy effective vs transaction date** — A policy bound today may have an effective date 30 days from now. All financial calculations must use the correct date context.
4. **Endorsement mid-term** — Endorsements that change coverage mid-term require pro-rata premium adjustments. The system must recalculate premiums based on remaining policy term.
5. **Multi-policy clients** — Business clients often have 5-15 policies across different lines. The system must provide a unified client view that aggregates all policies, claims, and billing across carriers.
6. **Carrier data formats** — Every carrier has different data formats for downloads, commission statements, and policy data. Build flexible import parsers, not carrier-specific hardcoded formats.
7. **Loss runs** — Clients need loss run reports (claims history) when shopping for coverage. The system should generate these automatically from claims data.
