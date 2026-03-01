---
name: Nonprofit Industry Specialist
tier: industries
triggers: nonprofit, donations, donor management, fundraising, volunteers, grants, campaigns, tax receipts, pledge, recurring donation, gift, donor portal, nonprofit crm, fund accounting, charitable, 501c3, giving, stewardship
depends_on: database.md, auth.md, billing.md, email.md
conflicts_with: null
prerequisites: null
description: Nonprofit domain expertise — donation processing (one-time, recurring, pledges), donor management with engagement scoring, volunteer coordination, grant tracking, campaign/fund management, tax receipt generation, fund accounting, and stewardship workflows
code_templates: null
design_tokens: tokens-corporate.css
---

# Nonprofit Industry Specialist

## Role

Provides deep domain expertise for building nonprofit technology applications — donor management systems, fundraising platforms, volunteer coordination tools, and grant tracking. Understands the unique financial, regulatory, and relationship-management needs of charitable organizations, including fund accounting (restricted vs unrestricted), tax-deductible receipt generation, pledge management, donor stewardship workflows, and the compliance requirements for 501(c)(3) organizations. Ensures every nonprofit app maximizes donor retention and simplifies the complex reporting obligations these organizations face.

## When to Use

- Building a donor management or nonprofit CRM system
- Implementing donation processing (one-time, recurring, pledges)
- Building fundraising campaign pages and peer-to-peer fundraising
- Implementing volunteer registration, scheduling, and hour tracking
- Building grant application tracking and reporting
- Generating tax-deductible donation receipts (IRS requirements)
- Implementing fund accounting (restricted, temporarily restricted, unrestricted)
- Building donor portals with giving history and tax documents
- Designing stewardship workflows (thank-you sequences, impact reports)
- Building event fundraising (galas, auctions, walkathons)

## Also Consider

- **billing.md** — for Stripe payment processing for donations
- **email.md** — for donation receipts, thank-you sequences, and appeal campaigns
- **crm.md** — for underlying contact management patterns
- **scheduling.md** — for volunteer shift scheduling and event management
- **dashboard.md** — for fundraising dashboards and campaign analytics
- **accounting.md** — for fund accounting and financial reporting
- **notifications.md** — for donation alerts, volunteer reminders, and campaign updates

## Anti-Patterns (NEVER Do)

1. **Never commingle restricted and unrestricted funds.** Restricted donations must be tracked separately and spent only for their designated purpose. Misusing restricted funds is a serious legal violation and can cost the organization its tax-exempt status.
2. **Never issue tax receipts for non-deductible amounts.** If a donor receives goods or services (gala dinner, auction item), the receipt must show the fair market value deducted from the gift amount. Only the excess is tax-deductible.
3. **Never delete donor or donation records.** Nonprofit financial records have IRS retention requirements (typically 7 years). All records must be preserved for audit purposes.
4. **Never expose donor giving amounts to other donors.** Donor privacy is critical. Public recognition levels ("Gold Donor") are acceptable, but exact gift amounts must be private.
5. **Never skip duplicate detection on donor imports.** Nonprofits frequently import lists from events, mailings, and partner organizations. Without deduplication, the database becomes unreliable and donors receive duplicate communications.
6. **Never process recurring donations without clear cancellation paths.** Donors must be able to easily modify or cancel recurring gifts. Hidden cancellation flows damage trust and violate payment processor policies.
7. **Never ignore donor lapse dates.** A donor who hasn't given in 13+ months is "lapsed." The system must flag lapsed donors for re-engagement before they're lost permanently.
8. **Never treat all donors the same.** A $10,000/year major donor and a $25 one-time donor need very different stewardship. Build donor segmentation and tiered engagement workflows.

## Standards & Patterns

### Core Data Model

```
Nonprofit Organization
├── Donors (Constituents)
│   ├── Individuals + Organizations (households optional)
│   ├── Giving History
│   ├── Engagement Score
│   ├── Stewardship Level (major, mid-level, grassroots)
│   ├── Communication Preferences
│   └── Relationships (spouse, employer, board member)
├── Donations (Gifts)
│   ├── One-Time, Recurring, Pledge, In-Kind, Stock
│   ├── Fund / Campaign / Appeal attribution
│   ├── Tax Receipt tracking
│   └── Soft Credits (matching gifts, advised funds)
├── Campaigns & Appeals
│   ├── Annual Fund, Capital Campaign, Emergency Appeal
│   ├── Fundraising Pages (peer-to-peer)
│   └── Goals and Progress
├── Funds
│   ├── Unrestricted (general operating)
│   ├── Temporarily Restricted (time or purpose bound)
│   └── Permanently Restricted (endowment)
├── Volunteers
│   ├── Profiles, Skills, Availability
│   ├── Opportunities / Shifts
│   └── Hours Logged
├── Grants
│   ├── Prospect → Application → Awarded → Reporting → Closed
│   └── Deliverables and Deadlines
└── Events
    ├── Galas, Auctions, Walkathons
    ├── Tickets / Tables / Sponsorships
    └── Auction Items and Bidding
```

### Donor Schema

```sql
CREATE TABLE donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  donor_type TEXT NOT NULL CHECK (donor_type IN ('individual', 'organization', 'household', 'foundation')),
  
  -- Individual fields
  prefix TEXT,                           -- Mr., Ms., Dr., etc.
  first_name TEXT,
  last_name TEXT,
  suffix TEXT,
  formal_salutation TEXT,                -- 'Mr. and Mrs. John Smith'
  informal_salutation TEXT,              -- 'John and Jane'
  
  -- Organization fields
  organization_name TEXT,
  
  -- Contact
  email TEXT,
  phone TEXT,
  mobile TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  
  -- Donor classification
  donor_status TEXT NOT NULL DEFAULT 'prospect'
    CHECK (donor_status IN ('prospect', 'first_time', 'active', 'lapsed', 'recovered', 'major', 'planned_giving')),
  stewardship_level TEXT DEFAULT 'grassroots'
    CHECK (stewardship_level IN ('major', 'mid_level', 'grassroots', 'prospect')),
  assigned_to UUID REFERENCES users(id),  -- Relationship manager
  
  -- Giving summary (denormalized for performance, recalculated on donation)
  lifetime_giving DECIMAL(12,2) NOT NULL DEFAULT 0,
  largest_gift DECIMAL(12,2) DEFAULT 0,
  first_gift_date DATE,
  last_gift_date DATE,
  last_gift_amount DECIMAL(12,2),
  gift_count INT NOT NULL DEFAULT 0,
  average_gift DECIMAL(10,2) DEFAULT 0,
  current_year_giving DECIMAL(12,2) DEFAULT 0,
  prior_year_giving DECIMAL(12,2) DEFAULT 0,
  has_recurring BOOLEAN NOT NULL DEFAULT false,
  
  -- Engagement
  engagement_score INT DEFAULT 0,
  communication_preference TEXT DEFAULT 'email'
    CHECK (communication_preference IN ('email', 'mail', 'phone', 'none')),
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  do_not_solicit BOOLEAN NOT NULL DEFAULT false,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,  -- Prefers anonymous recognition
  
  -- Relationships
  spouse_id UUID REFERENCES donors(id),
  employer_id UUID REFERENCES donors(id),
  
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  source TEXT,                           -- How they became a donor
  custom_fields JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_donors_email ON donors(org_id, email);
CREATE INDEX idx_donors_status ON donors(org_id, donor_status);
CREATE INDEX idx_donors_level ON donors(org_id, stewardship_level);
CREATE INDEX idx_donors_lapsed ON donors(org_id, last_gift_date)
  WHERE donor_status = 'active';
CREATE INDEX idx_donors_name ON donors USING gin(
  to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(organization_name, ''))
);
```

### Donation Schema

```sql
CREATE TABLE donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  donation_number TEXT NOT NULL,
  
  -- Amount
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  deductible_amount DECIMAL(12,2),       -- Amount eligible for tax deduction
  non_deductible_amount DECIMAL(12,2) DEFAULT 0,  -- Fair market value of benefits received
  
  -- Type
  donation_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (donation_type IN ('one_time', 'recurring', 'pledge_payment', 'in_kind', 'stock', 'daf', 'matching', 'planned')),
  payment_method TEXT
    CHECK (payment_method IN ('credit_card', 'ach', 'check', 'cash', 'wire', 'stock', 'crypto', 'paypal', 'other')),
  
  -- Attribution
  fund_id UUID REFERENCES funds(id),
  campaign_id UUID REFERENCES campaigns(id),
  appeal_id UUID REFERENCES appeals(id),
  event_id UUID,
  fundraiser_id UUID REFERENCES donors(id),  -- Peer-to-peer fundraiser
  
  -- Recurring
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_schedule_id UUID REFERENCES recurring_schedules(id),
  
  -- Pledge
  pledge_id UUID REFERENCES pledges(id),
  
  -- Payment
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  check_number TEXT,
  check_date DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  
  -- Receipt
  receipt_number TEXT,
  receipt_sent_at TIMESTAMPTZ,
  receipt_method TEXT CHECK (receipt_method IN ('email', 'mail', 'none')),
  
  -- Soft credit (give credit to someone other than the payer)
  soft_credit_donor_id UUID REFERENCES donors(id),
  soft_credit_type TEXT,                 -- 'spouse', 'employer_match', 'daf_advisor', 'solicitor'
  
  donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  fiscal_year INT NOT NULL,
  notes TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(org_id, donation_number)
);

CREATE INDEX idx_donations_donor ON donations(donor_id, donation_date DESC);
CREATE INDEX idx_donations_fund ON donations(fund_id, donation_date DESC);
CREATE INDEX idx_donations_campaign ON donations(campaign_id);
CREATE INDEX idx_donations_fiscal ON donations(org_id, fiscal_year);
CREATE INDEX idx_donations_date ON donations(org_id, donation_date DESC);
```

### Recurring Donations

```sql
CREATE TABLE recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'annually')),
  fund_id UUID REFERENCES funds(id),
  campaign_id UUID REFERENCES campaigns(id),
  
  stripe_subscription_id TEXT,
  payment_method_last4 TEXT,
  
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'failed', 'completed')),
  start_date DATE NOT NULL,
  end_date DATE,                         -- NULL = indefinite
  next_charge_date DATE,
  last_charge_date DATE,
  last_charge_amount DECIMAL(12,2),
  total_donated DECIMAL(12,2) NOT NULL DEFAULT 0,
  charge_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  max_failures INT NOT NULL DEFAULT 3,   -- Cancel after N consecutive failures
  
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_active ON recurring_schedules(next_charge_date)
  WHERE status = 'active';
CREATE INDEX idx_recurring_donor ON recurring_schedules(donor_id);
```

### Pledges

```sql
CREATE TABLE pledges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  pledge_number TEXT NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_remaining DECIMAL(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  fund_id UUID REFERENCES funds(id),
  campaign_id UUID REFERENCES campaigns(id),
  
  payment_schedule TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payment_schedule IN ('monthly', 'quarterly', 'annually', 'custom')),
  installment_amount DECIMAL(12,2),
  start_date DATE NOT NULL,
  end_date DATE,
  next_payment_date DATE,
  
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fulfilled', 'partially_fulfilled', 'cancelled', 'written_off')),
  
  pledge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(org_id, pledge_number)
);
```

### Fund Accounting

```sql
CREATE TABLE funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  fund_type TEXT NOT NULL
    CHECK (fund_type IN ('unrestricted', 'temporarily_restricted', 'permanently_restricted')),
  restriction_description TEXT,          -- What the funds can be used for
  restriction_end_date DATE,             -- When time restriction expires
  goal_amount DECIMAL(12,2),
  current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(org_id, code)
);

-- Fund balance tracking
-- Unrestricted: General operating — can be spent on anything
-- Temporarily restricted: Must be used for specific purpose or by specific date
-- Permanently restricted: Principal cannot be spent (endowment); only investment income usable
```

### Campaign & Appeal Schema

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  campaign_type TEXT NOT NULL
    CHECK (campaign_type IN ('annual_fund', 'capital', 'emergency', 'endowment', 'event', 'peer_to_peer', 'other')),
  goal_amount DECIMAL(12,2),
  raised_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  donor_count INT NOT NULL DEFAULT 0,
  fund_id UUID REFERENCES funds(id),
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  is_public BOOLEAN NOT NULL DEFAULT true,
  cover_image_url TEXT,
  thermometer_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  campaign_id UUID REFERENCES campaigns(id),
  name TEXT NOT NULL,                    -- 'Spring Mailing 2024', 'Year-End Email'
  channel TEXT NOT NULL CHECK (channel IN ('email', 'mail', 'phone', 'event', 'social', 'other')),
  sent_date DATE,
  audience_count INT,
  response_count INT DEFAULT 0,
  total_raised DECIMAL(12,2) DEFAULT 0,
  cost DECIMAL(10,2),                    -- Cost of the appeal (for ROI calculation)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Tax Receipt Generation

```typescript
interface TaxReceipt {
  receipt_number: string;
  donation_date: string;
  donor_name: string;
  donor_address: string;
  amount: number;
  deductible_amount: number;
  non_deductible_description?: string;   // "Dinner valued at $75"
  non_deductible_amount?: number;
  organization_name: string;
  organization_ein: string;              // EIN (Tax ID)
  organization_address: string;
  disclaimer: string;                    // IRS-required language
  is_annual_summary: boolean;            // Year-end consolidated receipt
}

// IRS Requirements for tax receipts:
// - Organization name and EIN
// - Donor name
// - Date and amount of contribution
// - Statement that no goods/services were provided OR description and FMV of goods/services
// - For gifts > $250: "No goods or services were provided in exchange for your contribution"
// - For quid pro quo gifts > $75: Must state FMV of goods/services received

const IRS_DISCLAIMER_NO_BENEFIT =
  'No goods or services were provided in exchange for your contribution. ' +
  'This letter serves as your official tax receipt. Please retain for your records.';

const IRS_DISCLAIMER_WITH_BENEFIT = (fmv: number) =>
  `The estimated fair market value of goods or services provided to you is $${fmv.toFixed(2)}. ` +
  `The tax-deductible portion of your gift is the amount in excess of this value. ` +
  'Please retain this letter for your tax records.';
```

### Donor Engagement Scoring

```typescript
const ENGAGEMENT_RULES = [
  // Recency
  { condition: 'last_gift_within_90_days', points: 25 },
  { condition: 'last_gift_within_180_days', points: 15 },
  { condition: 'last_gift_within_365_days', points: 5 },
  
  // Frequency
  { condition: 'gifts_this_year_gte_3', points: 20 },
  { condition: 'consecutive_years_gte_3', points: 25 },
  { condition: 'consecutive_years_gte_5', points: 40 },
  
  // Monetary
  { condition: 'lifetime_giving_gte_10000', points: 30 },
  { condition: 'has_recurring', points: 20 },
  { condition: 'increased_giving_yoy', points: 15 },
  
  // Engagement
  { condition: 'event_attended_this_year', points: 10 },
  { condition: 'volunteer_hours_this_year_gt_0', points: 15 },
  { condition: 'opened_email_last_30_days', points: 5 },
  
  // Negative
  { condition: 'lapsed_over_18_months', points: -30 },
  { condition: 'decreased_giving_yoy', points: -10 },
  { condition: 'email_bounced', points: -15 },
];

// Stewardship level thresholds:
// 80+:  Major donor treatment
// 50-79: Mid-level stewardship
// 20-49: Grassroots/general
// <20:  At-risk / re-engagement needed
```

### Volunteer Management

```sql
CREATE TABLE volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID REFERENCES donors(id),   -- Link to donor record if they also give
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  skills TEXT[],
  interests TEXT[],
  availability JSONB,                    -- {"weekdays": true, "weekends": true, "evenings": false}
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('prospect', 'active', 'inactive', 'on_leave')),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  background_check_completed BOOLEAN DEFAULT false,
  background_check_date DATE,
  total_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE volunteer_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  spots_available INT NOT NULL,
  spots_filled INT NOT NULL DEFAULT 0,
  skills_needed TEXT[],
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'full', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE volunteer_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES volunteer_opportunities(id),
  volunteer_id UUID NOT NULL REFERENCES volunteers(id),
  status TEXT NOT NULL DEFAULT 'signed_up'
    CHECK (status IN ('signed_up', 'confirmed', 'attended', 'no_show', 'cancelled')),
  hours_logged DECIMAL(5,2),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(opportunity_id, volunteer_id)
);
```

### Grant Tracking

```sql
CREATE TABLE grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  funder_name TEXT NOT NULL,
  funder_id UUID REFERENCES donors(id),
  grant_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'loi_submitted', 'invited', 'application_submitted',
      'awarded', 'declined', 'active', 'reporting', 'closed', 'not_funded')),
  amount_requested DECIMAL(12,2),
  amount_awarded DECIMAL(12,2),
  amount_received DECIMAL(12,2) DEFAULT 0,
  fund_id UUID REFERENCES funds(id),
  purpose TEXT,
  
  -- Key dates
  loi_deadline DATE,
  application_deadline DATE,
  submitted_date DATE,
  award_date DATE,
  start_date DATE,
  end_date DATE,
  
  -- Reporting
  report_deadlines JSONB,                -- [{"date": "2024-06-30", "type": "interim"}, ...]
  
  assigned_to UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Code Templates

No dedicated code templates — the inline patterns cover donor management, donation processing, fund accounting, tax receipts, volunteering, and grant tracking comprehensively.

## Checklist

- [ ] Donor records support individuals, organizations, households, and foundations
- [ ] Donation processing handles one-time, recurring, pledges, in-kind, stock, and DAF gifts
- [ ] Recurring donation management with pause, cancel, and failed payment recovery
- [ ] Pledge tracking with installment schedules and payment matching
- [ ] Fund accounting separates unrestricted, temporarily restricted, and permanently restricted
- [ ] Tax receipts include all IRS-required elements (EIN, FMV deduction, disclaimers)
- [ ] Annual summary receipts available for year-end tax filing
- [ ] Soft credits for spouse giving, matching gifts, and DAF advisors
- [ ] Donor engagement scoring with recency, frequency, and monetary factors
- [ ] Lapsed donor detection and re-engagement workflow triggers
- [ ] Campaign and appeal tracking with goal thermometers and ROI calculation
- [ ] Volunteer opportunity management with signup, check-in, and hour logging
- [ ] Grant lifecycle tracking from prospect through reporting and close
- [ ] Donor deduplication on import with merge capability
- [ ] Communication preference enforcement (do not contact, do not solicit)
- [ ] No hard deletes on any donor or financial record

## Common Pitfalls

1. **Quid pro quo donations** — When a donor pays $500 for a gala ticket that includes a $75 dinner, only $425 is tax-deductible. The receipt must clearly state the fair market value of benefits received. Getting this wrong creates IRS liability for both the donor and the organization.
2. **Donor-advised fund (DAF) attribution** — DAF gifts come from the fund's sponsoring organization (Fidelity Charitable, Schwab Charitable), not the donor. You must credit the DAF as the legal donor for receipting but soft-credit the individual who recommended the gift for stewardship.
3. **Fiscal year mismatch** — Many nonprofits have fiscal years ending June 30, not December 31. But donors need January-December receipts for tax filing. Support both fiscal year reporting (for the org) and calendar year receipts (for donors).
4. **Matching gift complexity** — Employer matching gifts are separate donations from the employer, triggered by the employee's gift. Track the match as a linked donation with soft credit to the employee, not as an increase to the employee's gift amount.
5. **Recurring failure dunning** — When a recurring donation's card expires, don't cancel immediately. Retry for 2-3 billing cycles, send card update reminders, and only then pause the schedule. Recovering failed recurring donors is critical for revenue stability.
6. **In-kind gift valuation** — The donor determines fair market value for non-cash gifts, not the nonprofit. For gifts over $5,000, the donor needs an independent appraisal. The nonprofit should never provide a valuation on the receipt.
7. **Recognition levels** — Donor recognition levels ("Silver Circle: $1,000-$4,999") are marketing tools. They must never appear on official tax receipts, which deal only in actual amounts and IRS-required disclosures.
