---
name: Accounting Industry Specialist
tier: industries
triggers: accounting, general ledger, chart of accounts, reconciliation, journal entry, trial balance, financial reporting, period close, audit trail, accounts payable, accounts receivable, double entry, bookkeeping, tax reporting, financial statements, gl
depends_on: database.md, auth.md, billing.md
conflicts_with: null
prerequisites: null
description: Accounting domain expertise — double-entry general ledger, chart of accounts, journal entries, bank reconciliation, financial reporting (P&L, balance sheet, cash flow), period close, audit trails, AP/AR, and multi-entity consolidation
code_templates: null
design_tokens: tokens-corporate.css
---

# Accounting Industry Specialist

## Role

Provides deep domain expertise for building accounting and financial management applications — general ledger systems, bookkeeping platforms, financial reporting tools, and accounting practice management. Understands double-entry accounting principles, GAAP/IFRS standards, the chart of accounts structure, and the complex workflows around period close, reconciliation, and audit preparation. Ensures every accounting app maintains data integrity through enforced double-entry rules, immutable audit trails, and proper period controls.

## When to Use

- Building a general ledger or bookkeeping system
- Implementing chart of accounts with account hierarchies
- Building journal entry creation and approval workflows
- Implementing bank reconciliation features
- Generating financial statements (P&L, Balance Sheet, Cash Flow, Trial Balance)
- Building period close / month-end close workflows
- Implementing accounts payable or accounts receivable
- Building multi-entity or multi-currency accounting
- Creating audit trail and compliance reporting features
- Integrating with QuickBooks, Xero, or other accounting platforms

## Also Consider

- **quickbooks.md** — for QuickBooks Online API integration
- **billing.md** — for payment processing that feeds into accounting
- **dashboard.md** — for financial dashboards and KPI reporting
- **data-tables.md** — for ledger views, transaction lists, and report tables
- **legal.md** — for trust accounting (IOLTA) requirements
- **insurance.md** — for premium trust accounting
- **compliance/soc2.md** — for audit controls and access logging

## Anti-Patterns (NEVER Do)

1. **Never allow single-entry transactions.** Every transaction must have debits equal credits. This is the fundamental rule of accounting. Enforce it at the database level with check constraints.
2. **Never allow edits to posted journal entries.** Posted entries are part of the permanent record. To correct, create a reversing entry and a new correcting entry. This preserves the full audit trail.
3. **Never delete any financial record.** Void, reverse, or write off — but never delete. Financial records have legal retention requirements and audit implications.
4. **Never allow transactions in closed periods.** Once a period is closed, no new entries should be posted to it without explicit reopening by an authorized user.
5. **Never hardcode the chart of accounts.** Every business has a different COA structure. Make it fully configurable with account types, sub-types, and hierarchies.
6. **Never ignore rounding.** Currency calculations must use fixed-point decimal arithmetic, never floating point. A single rounding error compounds across thousands of transactions.
7. **Never skip the trial balance check.** Before generating any financial statement, verify that total debits equal total credits. An out-of-balance ledger means corrupted data.
8. **Never store calculated balances without reconciliation.** Account balances should be derivable from transaction history. If you cache balances for performance, build reconciliation checks.

## Standards & Patterns

### Core Data Model

```
Organization (Entity)
├── Chart of Accounts
│   ├── Assets (1000-1999)
│   ├── Liabilities (2000-2999)
│   ├── Equity (3000-3999)
│   ├── Revenue (4000-4999)
│   ├── Cost of Goods Sold (5000-5999)
│   ├── Expenses (6000-6999)
│   └── Other Income/Expense (7000-7999)
├── Fiscal Periods
│   ├── Year → Quarters → Months
│   └── Status: open | closing | closed | locked
├── Journal Entries
│   ├── Header (date, memo, source, status)
│   └── Lines (account, debit, credit, memo)
├── Sub-Ledgers
│   ├── Accounts Receivable (customer invoices, payments)
│   ├── Accounts Payable (vendor bills, payments)
│   └── Bank / Cash (deposits, withdrawals, transfers)
└── Reports
    ├── Trial Balance
    ├── Income Statement (P&L)
    ├── Balance Sheet
    ├── Cash Flow Statement
    └── General Ledger Detail
```

### Chart of Accounts Schema

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  account_number TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense', 'cogs')),
  account_sub_type TEXT,                 -- e.g., 'cash', 'accounts_receivable', 'fixed_asset'
  normal_balance TEXT NOT NULL
    CHECK (normal_balance IN ('debit', 'credit')),
  parent_account_id UUID REFERENCES accounts(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false, -- System accounts can't be deleted
  is_header BOOLEAN NOT NULL DEFAULT false, -- Header accounts don't accept transactions
  tax_code TEXT,                         -- For tax reporting
  currency TEXT NOT NULL DEFAULT 'USD',
  opening_balance DECIMAL(14,2) DEFAULT 0,
  opening_balance_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, account_number)
);

CREATE INDEX idx_accounts_type ON accounts(org_id, account_type);
CREATE INDEX idx_accounts_parent ON accounts(parent_account_id);

-- Normal balance rules:
-- Assets:      Debit increases, Credit decreases  → normal_balance = 'debit'
-- Expenses:    Debit increases, Credit decreases  → normal_balance = 'debit'
-- COGS:        Debit increases, Credit decreases  → normal_balance = 'debit'
-- Liabilities: Credit increases, Debit decreases  → normal_balance = 'credit'
-- Equity:      Credit increases, Debit decreases  → normal_balance = 'credit'
-- Revenue:     Credit increases, Debit decreases  → normal_balance = 'credit'
```

### Journal Entry Schema (Double-Entry Enforced)

```sql
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  entry_number TEXT NOT NULL,            -- Sequential: JE-2024-00001
  entry_date DATE NOT NULL,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  memo TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'invoice', 'payment', 'payroll',
      'depreciation', 'adjustment', 'closing', 'opening', 'import', 'reversal')),
  source_reference TEXT,                 -- e.g., invoice ID, payment ID
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'reversed', 'void')),
  is_adjusting BOOLEAN NOT NULL DEFAULT false,
  is_closing BOOLEAN NOT NULL DEFAULT false,
  is_reversing BOOLEAN NOT NULL DEFAULT false,
  reversed_entry_id UUID REFERENCES journal_entries(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  posted_by UUID REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, entry_number)
);

CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id),
  debit DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo TEXT,
  entity_id UUID,                        -- Customer, vendor, employee reference
  entity_type TEXT,                      -- 'customer', 'vendor', 'employee'
  department_id UUID,
  project_id UUID,
  class_id UUID,                         -- For multi-dimensional reporting
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each line must be either debit OR credit, not both
  CONSTRAINT debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

CREATE INDEX idx_je_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_je_lines_entry ON journal_entry_lines(journal_entry_id);

-- CRITICAL: Enforce balanced entries at the database level
CREATE OR REPLACE FUNCTION check_balanced_entry()
RETURNS TRIGGER AS $$
DECLARE
  total_debits DECIMAL(14,2);
  total_credits DECIMAL(14,2);
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO total_debits, total_credits
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  IF total_debits != total_credits THEN
    RAISE EXCEPTION 'Journal entry is not balanced: debits=% credits=%',
      total_debits, total_credits;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Validate balance when entry is posted
CREATE OR REPLACE FUNCTION validate_on_post()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'posted' AND OLD.status != 'posted' THEN
    PERFORM check_balanced_entry_for(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Fiscal Period Management

```sql
CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  fiscal_year INT NOT NULL,
  period_number INT NOT NULL,            -- 1-12 (or 1-13 for 13-period)
  period_name TEXT NOT NULL,             -- 'January 2024', 'Q1 2024', 'Period 1'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('future', 'open', 'closing', 'closed', 'locked')),
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  locked_by UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, fiscal_year, period_number)
);

-- Prevent posting to closed periods
CREATE OR REPLACE FUNCTION prevent_closed_period_posting()
RETURNS TRIGGER AS $$
DECLARE
  period_status TEXT;
BEGIN
  SELECT status INTO period_status
  FROM fiscal_periods WHERE id = NEW.fiscal_period_id;

  IF period_status IN ('closed', 'locked') THEN
    RAISE EXCEPTION 'Cannot post to closed period';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_closed_period
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW
WHEN (NEW.status = 'posted')
EXECUTE FUNCTION prevent_closed_period_posting();
```

### Account Balance Calculation

```typescript
interface AccountBalance {
  account_id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  normal_balance: 'debit' | 'credit';
  total_debits: number;
  total_credits: number;
  balance: number;              // Signed based on normal balance
}

async function getAccountBalance(
  accountId: string,
  asOfDate: string
): Promise<AccountBalance> {
  const { data } = await supabase.rpc('calculate_account_balance', {
    p_account_id: accountId,
    p_as_of_date: asOfDate,
  });
  return data;
}

// PostgreSQL function
/*
CREATE OR REPLACE FUNCTION calculate_account_balance(
  p_account_id UUID,
  p_as_of_date DATE
)
RETURNS TABLE (
  account_id UUID, account_number TEXT, account_name TEXT,
  account_type TEXT, normal_balance TEXT,
  total_debits DECIMAL, total_credits DECIMAL, balance DECIMAL
) AS $$
  SELECT
    a.id AS account_id,
    a.account_number,
    a.name AS account_name,
    a.account_type,
    a.normal_balance,
    COALESCE(SUM(jel.debit), 0) AS total_debits,
    COALESCE(SUM(jel.credit), 0) AS total_credits,
    CASE a.normal_balance
      WHEN 'debit' THEN COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)
      WHEN 'credit' THEN COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)
    END AS balance
  FROM accounts a
  LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date
  WHERE a.id = p_account_id
  GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance;
$$ LANGUAGE sql;
*/
```

### Financial Reports

```typescript
// Trial Balance — verifies ledger integrity
async function generateTrialBalance(orgId: string, asOfDate: string): Promise<{
  accounts: TrialBalanceLine[];
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
}> {
  const { data: accounts } = await supabase.rpc('trial_balance', {
    p_org_id: orgId,
    p_as_of_date: asOfDate,
  });

  const totalDebits = accounts.reduce((sum: number, a: any) => sum + (a.debit_balance ?? 0), 0);
  const totalCredits = accounts.reduce((sum: number, a: any) => sum + (a.credit_balance ?? 0), 0);

  return {
    accounts,
    total_debits: totalDebits,
    total_credits: totalCredits,
    is_balanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
}

// Income Statement (P&L)
async function generateIncomeStatement(
  orgId: string,
  startDate: string,
  endDate: string
): Promise<{
  revenue: ReportSection;
  cogs: ReportSection;
  gross_profit: number;
  expenses: ReportSection;
  net_income: number;
}> {
  const revenue = await getAccountTypeTotal(orgId, 'revenue', startDate, endDate);
  const cogs = await getAccountTypeTotal(orgId, 'cogs', startDate, endDate);
  const expenses = await getAccountTypeTotal(orgId, 'expense', startDate, endDate);

  return {
    revenue,
    cogs,
    gross_profit: revenue.total - cogs.total,
    expenses,
    net_income: revenue.total - cogs.total - expenses.total,
  };
}

// Balance Sheet
async function generateBalanceSheet(orgId: string, asOfDate: string): Promise<{
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  total_assets: number;
  total_liabilities_equity: number;
  is_balanced: boolean;
}> {
  const assets = await getAccountTypeBalance(orgId, 'asset', asOfDate);
  const liabilities = await getAccountTypeBalance(orgId, 'liability', asOfDate);
  const equity = await getAccountTypeBalance(orgId, 'equity', asOfDate);

  // Add retained earnings (net income from all prior periods)
  const retainedEarnings = await calculateRetainedEarnings(orgId, asOfDate);
  equity.total += retainedEarnings;

  const totalLE = liabilities.total + equity.total;

  return {
    assets,
    liabilities,
    equity,
    total_assets: assets.total,
    total_liabilities_equity: totalLE,
    is_balanced: Math.abs(assets.total - totalLE) < 0.01,
  };
}
```

### Bank Reconciliation

```sql
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  bank_account_id UUID NOT NULL REFERENCES accounts(id),
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,         -- Positive = deposit, Negative = withdrawal
  reference_number TEXT,
  transaction_type TEXT,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  matched_journal_line_id UUID REFERENCES journal_entry_lines(id),
  import_source TEXT,                    -- 'csv', 'ofx', 'plaid', 'manual'
  import_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  bank_account_id UUID NOT NULL REFERENCES accounts(id),
  statement_date DATE NOT NULL,
  statement_ending_balance DECIMAL(14,2) NOT NULL,
  cleared_balance DECIMAL(14,2),
  difference DECIMAL(14,2),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'discrepancy')),
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Period Close Workflow

```typescript
// Month-end close checklist
interface CloseStep {
  id: string;
  name: string;
  order: number;
  is_required: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

const STANDARD_CLOSE_STEPS: Omit<CloseStep, 'id' | 'status'>[] = [
  { name: 'Review and post all pending journal entries', order: 1, is_required: true },
  { name: 'Record depreciation and amortization', order: 2, is_required: true },
  { name: 'Record accrued expenses', order: 3, is_required: true },
  { name: 'Record deferred revenue adjustments', order: 4, is_required: false },
  { name: 'Reconcile all bank accounts', order: 5, is_required: true },
  { name: 'Reconcile accounts receivable', order: 6, is_required: true },
  { name: 'Reconcile accounts payable', order: 7, is_required: true },
  { name: 'Review intercompany transactions', order: 8, is_required: false },
  { name: 'Record payroll accruals', order: 9, is_required: true },
  { name: 'Verify trial balance is balanced', order: 10, is_required: true },
  { name: 'Generate and review financial statements', order: 11, is_required: true },
  { name: 'Management review and sign-off', order: 12, is_required: true },
  { name: 'Close period', order: 13, is_required: true },
];
```

### Immutable Audit Trail

```sql
-- Append-only audit log for all financial transactions
CREATE TABLE accounting_audit_log (
  id BIGSERIAL PRIMARY KEY,             -- Sequential for ordering guarantee
  org_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'post', 'void', 'reverse', 'close')),
  old_values JSONB,
  new_values JSONB,
  performed_by UUID NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET
);

-- This table should NEVER have UPDATE or DELETE permissions
-- Consider using a separate schema with restricted access
REVOKE UPDATE, DELETE ON accounting_audit_log FROM PUBLIC;

CREATE INDEX idx_audit_record ON accounting_audit_log(table_name, record_id);
CREATE INDEX idx_audit_time ON accounting_audit_log(performed_at);
```

## Code Templates

No dedicated code templates — the inline patterns provide comprehensive coverage for double-entry ledger, chart of accounts, financial reporting, reconciliation, and period close.

## Checklist

- [ ] Double-entry enforced: every journal entry has debits = credits (database constraint)
- [ ] Chart of accounts fully configurable with types, sub-types, and hierarchy
- [ ] Normal balance rules correctly applied (debit-normal vs credit-normal accounts)
- [ ] Posted journal entries immutable — corrections via reversing entries only
- [ ] Fiscal period management with open/close/lock states
- [ ] Period close prevents posting to closed periods (trigger-enforced)
- [ ] Trial balance verification before any financial statement generation
- [ ] Income Statement, Balance Sheet, and Cash Flow generation
- [ ] Bank reconciliation with transaction matching and outstanding items
- [ ] Accounts Receivable and Accounts Payable sub-ledgers
- [ ] Immutable audit trail on all financial transactions (append-only)
- [ ] All currency calculations use DECIMAL, never floating point
- [ ] Retained earnings calculated correctly for Balance Sheet
- [ ] Multi-period comparative reporting supported
- [ ] No hard deletes on any financial record

## Common Pitfalls

1. **Floating point currency** — Using `FLOAT` or JavaScript `number` for currency leads to rounding errors that compound over thousands of transactions. Always use `DECIMAL(14,2)` in PostgreSQL and fixed-point libraries in application code.
2. **Retained earnings gap** — The Balance Sheet needs retained earnings (accumulated net income from all prior periods). If you don't calculate this dynamically, the Balance Sheet won't balance.
3. **Year-end closing entries** — At fiscal year-end, revenue and expense accounts must be closed to retained earnings. This creates closing journal entries that zero out temporary accounts.
4. **Accrual vs cash basis** — Many small businesses use cash basis, but the system must support accrual basis for GAAP compliance. Some reports need to be available in both bases. Design the ledger to support both.
5. **Sub-ledger reconciliation** — The AR sub-ledger (sum of outstanding invoices) must equal the AR control account in the GL. Same for AP. If they diverge, something is posting incorrectly. Build automated reconciliation checks.
6. **Multi-currency rounding** — When converting between currencies, rounding differences accumulate. Use a dedicated "exchange rate gain/loss" account to capture these differences.
7. **Opening balances** — When a business migrates to your system mid-year, they need to enter opening balances. These must be entered as a journal entry as of the migration date, not as account configuration.
