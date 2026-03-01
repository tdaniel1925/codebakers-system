---
name: Real Estate Industry Specialist
tier: industries
triggers: real estate, listings, mls, showing scheduling, commission splits, property management, listing agent, buyer agent, transaction management, escrow, title, real estate crm, brokerage, idx, rets, open house, comparative market analysis, cma
depends_on: database.md, auth.md, scheduling.md, maps.md
conflicts_with: null
prerequisites: null
description: Real estate domain expertise — property listings with MLS/IDX integration, showing scheduling, transaction management from offer to close, commission tracking with splits, agent/brokerage management, CMA generation, and property search with map-based interfaces
code_templates: null
design_tokens: tokens-corporate.css
---

# Real Estate Industry Specialist

## Role

Provides deep domain expertise for building real estate technology applications — listing management, showing coordination, transaction tracking, and brokerage operations. Understands the unique multi-party workflows of real estate (listing agents, buyer agents, brokerages, title companies, lenders, inspectors), MLS data standards, commission structures, and the state-specific regulatory requirements governing real estate transactions. Ensures every real estate app handles the complex lifecycle from listing to closing with proper compliance and audit trails.

## When to Use

- Building a listing management system with MLS/IDX integration
- Implementing property search with map-based, filtered results
- Building showing scheduling and feedback collection
- Implementing transaction management (offer → contract → closing)
- Building commission tracking with brokerage/agent splits
- Designing agent/team/brokerage management portals
- Implementing CMA (Comparative Market Analysis) generation
- Building property management features (tenants, leases, maintenance)
- Creating client portals for buyers and sellers
- Integrating with MLS via RESO Web API or RETS

## Also Consider

- **maps.md** — for property maps, boundary overlays, and proximity search
- **scheduling.md** — for showing appointment coordination
- **search.md** — for property search with faceted filtering (price, beds, baths, etc.)
- **document-ai.md** — for contract generation and e-signature workflows
- **email.md** — for listing alerts, showing confirmations, and drip campaigns
- **crm.md** — for client relationship management patterns
- **dashboard.md** — for agent performance and brokerage analytics
- **billing.md** — for agent billing, desk fees, and commission disbursement

## Anti-Patterns (NEVER Do)

1. **Never display MLS data without proper licensing.** MLS data usage is governed by strict rules. You must have IDX or VOW authorization and comply with display requirements (attribution, refresh intervals, disclaimers).
2. **Never expose commission details to buyers or sellers directly.** Commission structures are negotiated privately. The system should track them internally but never expose agent-to-agent commission details to clients.
3. **Never allow commission disbursement to unlicensed individuals.** Real estate commissions can only be paid to licensed agents through their brokerage. The system must verify active licenses before processing payouts.
4. **Never hardcode state-specific transaction requirements.** Real estate is regulated state by state — disclosure requirements, agency relationships, contract forms, and closing procedures all vary. Build state-aware rule engines.
5. **Never skip the showing feedback loop.** After every showing, agents need to provide feedback. Automating feedback requests and tracking responses is critical for seller communication and pricing adjustments.
6. **Never store listing photos without the photographer's consent.** Listing photos are copyrighted. When a listing expires or is cancelled, MLS rules may require photo removal. Track photo rights and syndication status.
7. **Never calculate agent income without accounting for all splits and fees.** A single commission passes through multiple splits: brokerage company dollar, team lead split, agent split, referral fees, and transaction fees. Missing any layer produces incorrect agent statements.
8. **Never delete transaction records.** Real estate transaction files have retention requirements (typically 3-5 years per state broker requirements, but many keep indefinitely). Archive, never delete.

## Standards & Patterns

### Core Data Model

```
Brokerage
├── Offices / Locations
├── Teams
├── Agents (licensed individuals)
│   ├── License info, specialties, areas served
│   └── Commission plan / split agreement
├── Listings (Properties for Sale/Rent)
│   ├── Property details (beds, baths, sqft, lot, year built)
│   ├── Pricing (list price, price changes)
│   ├── Photos, virtual tours, floor plans
│   ├── MLS data (MLS#, status, DOM, syndication)
│   ├── Showings (scheduled, completed, feedback)
│   └── Open Houses
├── Transactions (Deals)
│   ├── Offer → Under Contract → Contingencies → Clear to Close → Closed
│   ├── Parties (buyer, seller, agents, lender, title, inspector)
│   ├── Key Dates (inspection, appraisal, financing, closing)
│   ├── Documents (contracts, addenda, disclosures)
│   └── Commission calculation and disbursement
├── Contacts (Buyers, Sellers, Leads)
│   ├── Search criteria (for buyers)
│   ├── Property alerts
│   └── Activity history
└── Commission Ledger
    ├── Gross commission → Brokerage split → Team split → Agent net
    └── Referral fees, transaction fees, E&O deductions
```

### Listing Schema

```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  
  -- MLS Data
  mls_number TEXT,
  mls_id TEXT,                           -- Which MLS this listing belongs to
  listing_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (listing_status IN ('draft', 'coming_soon', 'active', 'pending', 'contingent',
      'under_contract', 'sold', 'closed', 'withdrawn', 'cancelled', 'expired')),
  
  -- Property Details
  property_type TEXT NOT NULL
    CHECK (property_type IN ('single_family', 'condo', 'townhouse', 'multi_family',
      'land', 'commercial', 'mobile_home', 'farm_ranch', 'other')),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  county TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  subdivision TEXT,
  
  -- Characteristics
  bedrooms INT,
  bathrooms_full INT,
  bathrooms_half INT,
  square_feet INT,
  lot_size_sqft INT,
  lot_size_acres DECIMAL(8,4),
  year_built INT,
  stories INT,
  garage_spaces INT,
  parking_spaces INT,
  
  -- Features (searchable)
  features TEXT[] DEFAULT '{}',          -- 'pool', 'fireplace', 'hardwood_floors', etc.
  appliances TEXT[] DEFAULT '{}',
  heating_type TEXT,
  cooling_type TEXT,
  roof_type TEXT,
  foundation_type TEXT,
  construction TEXT,
  water_source TEXT,
  sewer TEXT,
  
  -- Pricing
  list_price DECIMAL(12,2) NOT NULL,
  original_list_price DECIMAL(12,2),
  sold_price DECIMAL(12,2),
  price_per_sqft DECIMAL(8,2),
  
  -- Financials
  hoa_amount DECIMAL(8,2),
  hoa_frequency TEXT,                    -- 'monthly', 'quarterly', 'annually'
  tax_amount DECIMAL(10,2),
  tax_year INT,
  
  -- Dates
  list_date DATE,
  pending_date DATE,
  sold_date DATE,
  close_date DATE,
  expiration_date DATE,
  days_on_market INT,
  
  -- Agents
  listing_agent_id UUID REFERENCES agents(id),
  co_listing_agent_id UUID REFERENCES agents(id),
  buyer_agent_id UUID REFERENCES agents(id),
  
  -- Commission offered to buyer's agent
  buyer_agent_commission TEXT,           -- '2.5%' or '$5000'
  buyer_agent_commission_type TEXT CHECK (buyer_agent_commission_type IN ('percentage', 'flat')),
  
  -- Content
  public_remarks TEXT,
  private_remarks TEXT,                  -- Agent-only notes
  showing_instructions TEXT,
  virtual_tour_url TEXT,
  video_url TEXT,
  
  -- Syndication
  syndicate_to_zillow BOOLEAN DEFAULT true,
  syndicate_to_realtor BOOLEAN DEFAULT true,
  syndicate_to_trulia BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_status ON listings(org_id, listing_status);
CREATE INDEX idx_listings_location ON listings USING gist (
  ll_to_earth(latitude, longitude)
) WHERE latitude IS NOT NULL;
CREATE INDEX idx_listings_price ON listings(list_price) WHERE listing_status = 'active';
CREATE INDEX idx_listings_agent ON listings(listing_agent_id);
CREATE INDEX idx_listings_mls ON listings(mls_number);
CREATE INDEX idx_listings_features ON listings USING gin(features);

-- Listing photos
CREATE TABLE listing_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  position INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  photographer_credit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Price change history
CREATE TABLE listing_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  old_price DECIMAL(12,2),
  new_price DECIMAL(12,2) NOT NULL,
  change_date DATE NOT NULL DEFAULT CURRENT_DATE,
  change_type TEXT NOT NULL CHECK (change_type IN ('initial', 'increase', 'decrease')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Showing Management

```sql
CREATE TABLE showings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  requesting_agent_id UUID REFERENCES agents(id),
  buyer_name TEXT,
  requested_date DATE NOT NULL,
  requested_start_time TIME NOT NULL,
  requested_end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled',
      'completed', 'no_show', 'rescheduled')),
  showing_type TEXT DEFAULT 'in_person'
    CHECK (showing_type IN ('in_person', 'virtual', 'open_house')),
  
  -- Confirmation workflow
  confirmed_by TEXT,                     -- 'agent', 'seller', 'auto'
  confirmed_at TIMESTAMPTZ,
  decline_reason TEXT,
  
  -- Feedback
  feedback_requested_at TIMESTAMPTZ,
  feedback_received_at TIMESTAMPTZ,
  feedback_rating INT CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_interest_level TEXT
    CHECK (feedback_interest_level IN ('not_interested', 'somewhat_interested', 'very_interested', 'making_offer')),
  feedback_price_opinion TEXT
    CHECK (feedback_price_opinion IN ('too_low', 'fair', 'too_high')),
  feedback_comments TEXT,
  
  -- Lockbox / Access
  access_instructions TEXT,
  lockbox_code TEXT,                     -- Encrypted
  
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_showings_listing ON showings(listing_id, requested_date);
CREATE INDEX idx_showings_agent ON showings(requesting_agent_id, requested_date);
CREATE INDEX idx_showings_pending ON showings(status, requested_date)
  WHERE status IN ('requested', 'confirmed');

-- Open houses
CREATE TABLE open_houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  host_agent_id UUID NOT NULL REFERENCES agents(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  type TEXT DEFAULT 'public' CHECK (type IN ('public', 'brokers_only', 'private')),
  description TEXT,
  visitor_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Open house sign-in (lead capture)
CREATE TABLE open_house_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_house_id UUID NOT NULL REFERENCES open_houses(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_working_with_agent BOOLEAN,
  agent_name TEXT,
  comments TEXT,
  signed_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Transaction Management

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  transaction_number TEXT NOT NULL,
  listing_id UUID REFERENCES listings(id),
  
  -- Parties
  seller_contact_id UUID REFERENCES contacts(id),
  buyer_contact_id UUID REFERENCES contacts(id),
  listing_agent_id UUID REFERENCES agents(id),
  buyer_agent_id UUID REFERENCES agents(id),
  
  -- Third parties
  title_company TEXT,
  title_contact TEXT,
  title_email TEXT,
  lender_name TEXT,
  lender_contact TEXT,
  lender_email TEXT,
  escrow_company TEXT,
  inspector_name TEXT,
  appraiser_name TEXT,
  
  -- Property
  property_address TEXT NOT NULL,
  
  -- Financial
  contract_price DECIMAL(12,2) NOT NULL,
  earnest_money DECIMAL(10,2),
  seller_concessions DECIMAL(10,2) DEFAULT 0,
  
  -- Commission
  total_commission_pct DECIMAL(5,3),     -- e.g., 5.000
  total_commission_amount DECIMAL(10,2),
  listing_side_pct DECIMAL(5,3),
  listing_side_amount DECIMAL(10,2),
  buyer_side_pct DECIMAL(5,3),
  buyer_side_amount DECIMAL(10,2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending_offer'
    CHECK (status IN ('pending_offer', 'offer_submitted', 'under_contract', 'contingent',
      'clear_to_close', 'closed', 'fallen_through', 'cancelled')),
  
  -- Key Dates
  offer_date DATE,
  contract_date DATE,
  inspection_deadline DATE,
  inspection_completed_date DATE,
  appraisal_deadline DATE,
  appraisal_completed_date DATE,
  appraisal_value DECIMAL(12,2),
  financing_deadline DATE,
  financing_approved_date DATE,
  closing_date DATE,
  actual_closing_date DATE,
  possession_date DATE,
  
  -- Contingencies
  inspection_contingency BOOLEAN DEFAULT true,
  financing_contingency BOOLEAN DEFAULT true,
  appraisal_contingency BOOLEAN DEFAULT true,
  sale_contingency BOOLEAN DEFAULT false,
  
  fallen_through_reason TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(org_id, transaction_number)
);

-- Transaction checklist items
CREATE TABLE transaction_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'waived', 'overdue')),
  category TEXT NOT NULL
    CHECK (category IN ('contract', 'inspection', 'appraisal', 'financing',
      'title', 'closing', 'commission', 'other')),
  position INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tx_tasks_status ON transaction_tasks(transaction_id, status);
```

### Commission Tracking

```sql
CREATE TABLE commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  plan_type TEXT NOT NULL
    CHECK (plan_type IN ('split', 'cap', 'flat_fee', '100_pct', 'tiered')),
  agent_split_pct DECIMAL(5,3),          -- e.g., 70.000 (agent gets 70%)
  brokerage_split_pct DECIMAL(5,3),      -- e.g., 30.000
  cap_amount DECIMAL(10,2),              -- Annual cap (after which agent gets 100%)
  cap_ytd DECIMAL(10,2) DEFAULT 0,       -- Amount toward cap this year
  flat_fee_per_transaction DECIMAL(8,2), -- For flat-fee plans
  transaction_fee DECIMAL(8,2) DEFAULT 0,-- Per-transaction desk fee
  eo_deduction DECIMAL(8,2) DEFAULT 0,   -- E&O insurance deduction per transaction
  effective_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE commission_disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  
  -- Gross commission
  gross_commission DECIMAL(10,2) NOT NULL,
  
  -- Splits waterfall
  brokerage_amount DECIMAL(10,2) NOT NULL,
  team_lead_amount DECIMAL(10,2) DEFAULT 0,
  agent_gross DECIMAL(10,2) NOT NULL,
  
  -- Deductions from agent's share
  referral_fee DECIMAL(10,2) DEFAULT 0,
  referral_to TEXT,
  transaction_fee DECIMAL(8,2) DEFAULT 0,
  eo_deduction DECIMAL(8,2) DEFAULT 0,
  other_deductions DECIMAL(8,2) DEFAULT 0,
  other_deductions_description TEXT,
  
  -- Net to agent
  agent_net DECIMAL(10,2) NOT NULL,
  
  agent_id UUID NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'held')),
  paid_date DATE,
  check_number TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Commission Calculation

```typescript
async function calculateCommission(transaction: Transaction): Promise<CommissionBreakdown> {
  const agent = await getAgent(transaction.listing_agent_id);
  const plan = await getActiveCommissionPlan(agent.id);
  
  const grossCommission = transaction.listing_side_amount;
  
  let brokerageAmount: number;
  let agentGross: number;
  
  switch (plan.plan_type) {
    case 'split':
      agentGross = round2(grossCommission * (plan.agent_split_pct / 100));
      brokerageAmount = round2(grossCommission - agentGross);
      break;
      
    case 'cap':
      if (plan.cap_ytd >= plan.cap_amount) {
        // Agent has hit their cap — gets 100%
        agentGross = grossCommission;
        brokerageAmount = 0;
      } else {
        agentGross = round2(grossCommission * (plan.agent_split_pct / 100));
        brokerageAmount = round2(grossCommission - agentGross);
        // Update cap progress
        await updateCapProgress(plan.id, brokerageAmount);
      }
      break;
      
    case 'flat_fee':
      brokerageAmount = plan.flat_fee_per_transaction;
      agentGross = round2(grossCommission - brokerageAmount);
      break;
      
    case '100_pct':
      agentGross = grossCommission;
      brokerageAmount = 0;
      break;
      
    default:
      throw new Error(`Unknown plan type: ${plan.plan_type}`);
  }
  
  // Deductions
  const referralFee = transaction.referral_fee ?? 0;
  const transactionFee = plan.transaction_fee ?? 0;
  const eoDeduction = plan.eo_deduction ?? 0;
  
  const agentNet = round2(agentGross - referralFee - transactionFee - eoDeduction);
  
  return {
    gross_commission: grossCommission,
    brokerage_amount: brokerageAmount,
    agent_gross: agentGross,
    referral_fee: referralFee,
    transaction_fee: transactionFee,
    eo_deduction: eoDeduction,
    agent_net: agentNet,
  };
}
```

### MLS Integration (RESO Web API)

```typescript
// RESO Web API — modern standard replacing RETS
// Most MLSs now support RESO Web API for data access

interface RESOConfig {
  baseUrl: string;           // e.g., https://api.mlsgrid.com/v2
  accessToken: string;
  mlsId: string;
}

class RESOClient {
  constructor(private config: RESOConfig) {}
  
  async searchListings(params: {
    status?: string;
    minPrice?: number;
    maxPrice?: number;
    minBeds?: number;
    city?: string;
    zip?: string;
    modifiedAfter?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const filters: string[] = [];
    if (params.status) filters.push(`StandardStatus eq '${params.status}'`);
    if (params.minPrice) filters.push(`ListPrice ge ${params.minPrice}`);
    if (params.maxPrice) filters.push(`ListPrice le ${params.maxPrice}`);
    if (params.minBeds) filters.push(`BedroomsTotal ge ${params.minBeds}`);
    if (params.city) filters.push(`City eq '${params.city}'`);
    if (params.modifiedAfter) filters.push(`ModificationTimestamp gt ${params.modifiedAfter}`);
    
    const query = new URLSearchParams({
      '$filter': filters.join(' and '),
      '$top': String(params.limit ?? 25),
      '$skip': String(params.offset ?? 0),
      '$orderby': 'ModificationTimestamp desc',
    });
    
    const res = await fetch(`${this.config.baseUrl}/Property?${query}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });
    
    return res.json();
  }
}

// IDX display requirements (typical):
// - Must display MLS logo and disclaimer
// - Must refresh data at least every 12 hours
// - Must remove listings within 24 hours of status change
// - Must show listing office and agent name
// - Must not manipulate data or create misleading displays
```

### Property Search with Map

```typescript
// Geo-based property search using PostGIS
/*
-- Enable PostGIS and earthdistance
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- Search within radius
SELECT *, 
  earth_distance(
    ll_to_earth(latitude, longitude),
    ll_to_earth($1, $2)  -- Search center lat/lng
  ) AS distance_meters
FROM listings
WHERE listing_status = 'active'
  AND earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(latitude, longitude)
  AND earth_distance(ll_to_earth(latitude, longitude), ll_to_earth($1, $2)) < $3
  AND list_price BETWEEN $4 AND $5
  AND bedrooms >= $6
ORDER BY distance_meters;
-- $3 = radius in meters
*/
```

## Code Templates

No dedicated code templates — the inline patterns cover listings, showings, transactions, commissions, MLS integration, and property search comprehensively.

## Checklist

- [ ] Listing lifecycle properly managed (draft → active → pending → sold/closed)
- [ ] Property details support all standard MLS fields
- [ ] Listing photos with ordering, primary flag, and photographer credit
- [ ] Price change history tracked for CMA and market analysis
- [ ] Showing scheduling with confirmation workflow and feedback collection
- [ ] Open house management with visitor sign-in and lead capture
- [ ] Transaction management from offer through closing with all key dates
- [ ] Transaction task checklist with categories and deadline tracking
- [ ] Commission calculation supporting split, cap, flat-fee, and 100% plans
- [ ] Commission waterfall: gross → brokerage → team → agent → deductions → net
- [ ] Referral fee tracking and deduction from agent disbursement
- [ ] MLS integration via RESO Web API with proper IDX compliance
- [ ] Map-based property search with radius, polygon, and filter support
- [ ] Agent license tracking with expiration alerts
- [ ] Document management for contracts, disclosures, and addenda
- [ ] No deletion of transaction records (archive only)

## Common Pitfalls

1. **MLS data compliance** — MLS organizations audit IDX displays. Non-compliant data usage (missing disclaimers, stale data, manipulated fields) results in data feed termination. Follow every IDX display rule precisely.
2. **Commission on both sides** — A brokerage may represent both the buyer and seller (dual agency). The commission calculation must handle this scenario where both sides flow to the same brokerage.
3. **Referral fees across brokerages** — Referral fees (typically 25-35% of the agent's side) are paid brokerage-to-brokerage, not agent-to-agent. The system must route referral payments through the proper entity.
4. **Days on Market calculation** — DOM typically excludes withdrawn/cancelled periods. If a listing is withdrawn for 30 days then relisted, cumulative DOM continues from the original list date per most MLS rules.
5. **Showing coordination conflicts** — Multiple agents requesting the same showing time for the same listing. The system needs conflict detection and priority/queue logic.
6. **Contingency date tracking** — Missing a contingency deadline can have major legal consequences (auto-waiver of inspection contingency, financing deadline expiration). Build prominent deadline alerts with escalation.
7. **State-specific forms** — Every state has different purchase agreement forms, disclosure requirements, and addenda. Don't build a forms system assuming a single contract template works nationally.
