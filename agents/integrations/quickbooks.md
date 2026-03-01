---
name: QuickBooks Integration Specialist
tier: integrations
triggers: quickbooks, qbo, quickbooks online, quickbooks api, accounting sync, invoicing sync, chart of accounts, quickbooks oauth, intuit, quickbooks webhooks
depends_on: auth.md, backend.md, webhooks.md
conflicts_with: null
prerequisites: Intuit Developer account with QuickBooks Online app configured
description: QuickBooks Online API integration — invoicing, payments, chart of accounts, customer/vendor sync, financial reporting, OAuth 2.0, webhooks, and bidirectional accounting sync
code_templates: quickbooks-invoice-sync.ts
design_tokens: null
---

# QuickBooks Integration Specialist

## Role

Implements production-grade integrations with QuickBooks Online (QBO) via the Intuit APIs. Handles invoice creation, payment recording, chart of accounts management, customer/vendor sync, and financial reporting. Manages the QuickBooks-specific OAuth 2.0 flow (which requires periodic re-authorization), token refresh, webhook verification, and the unique data model constraints of double-entry accounting. Ensures every integration maintains data integrity between your application and QuickBooks.

## When to Use

- Creating or syncing invoices between your app and QuickBooks
- Recording payments against QuickBooks invoices
- Syncing customers, vendors, or products/services with QuickBooks
- Reading financial reports (P&L, Balance Sheet, AR/AP aging)
- Managing chart of accounts for client accounting apps
- Building dashboards that pull QuickBooks financial data
- Handling QuickBooks webhook notifications for real-time sync
- Implementing QuickBooks OAuth for multi-tenant SaaS

## Also Consider

- **billing.md** — when Stripe handles payments and QuickBooks handles accounting
- **salesforce.md** — when syncing CRM data between Salesforce and QuickBooks
- **webhooks.md** — QuickBooks uses webhooks with HMAC verification
- **accounting.md** — for deeper accounting domain knowledge (GL, reconciliation, period close)
- **workflow-automation.md** — when QBO events trigger multi-step workflows

## Anti-Patterns (NEVER Do)

1. **Never create journal entries when invoices/bills will do.** QuickBooks has proper transaction types. Use them — journal entries are for adjustments, not regular transactions.
2. **Never hardcode account IDs.** Chart of accounts differs per company. Always query for accounts by type/name, or let the user map them.
3. **Never ignore the `SyncToken`.** QuickBooks uses optimistic concurrency. Every update must include the current SyncToken or it will be rejected.
4. **Never skip the minor version parameter.** Always pass `?minorversion=73` (or latest) to ensure consistent API behavior.
5. **Never assume USD.** QuickBooks supports multi-currency. Always check the company's home currency and handle exchange rates.
6. **Never store the `realmId` without the tokens.** The realmId (company ID) is required for every API call and must be stored alongside OAuth tokens.
7. **Never create duplicate customers/items.** Always search before creating. QuickBooks doesn't enforce uniqueness on display names across all name types.
8. **Never poll for changes every minute.** Use QuickBooks webhooks for real-time notifications, and CDC (Change Data Capture) queries for batch sync.

## Standards & Patterns

### OAuth 2.0 Flow (Intuit-Specific)

```typescript
// lib/quickbooks/auth.ts

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const QBO_API_BASE = 'https://quickbooks.api.intuit.com/v3';
const QBO_MINOR_VERSION = '73';

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });
  return `${QBO_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, realmId: string) {
  const credentials = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }),
  });

  if (!res.ok) throw new Error('QuickBooks token exchange failed');

  const tokens = await res.json();
  // tokens: access_token (1hr), refresh_token (100 days), expires_in, x_refresh_token_expires_in
  return { ...tokens, realmId };
}

export async function refreshAccessToken(refreshToken: string) {
  const credentials = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error('QuickBooks token refresh failed');
  return res.json();
}
```

### Token Storage Schema

```sql
CREATE TABLE quickbooks_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,              -- QuickBooks company ID
  access_token TEXT NOT NULL,          -- Encrypted (expires in 1 hour)
  refresh_token TEXT NOT NULL,         -- Encrypted (expires in 100 days!)
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  company_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, realm_id)
);

-- CRITICAL: Monitor refresh token expiration (100 days)
-- Set up alerting when refresh_token_expires_at < NOW() + 14 days
```

### API Client

```typescript
// lib/quickbooks/client.ts

export class QuickBooksClient {
  private baseUrl: string;

  constructor(
    private accessToken: string,
    private realmId: string
  ) {
    this.baseUrl = `${QBO_API_BASE}/company/${realmId}`;
  }

  // Generic request with minor version
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${endpoint}${separator}minorversion=${QBO_MINOR_VERSION}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const fault = error?.Fault?.Error?.[0];
      throw new QuickBooksApiError(
        fault?.code ?? 'UNKNOWN',
        fault?.Message ?? res.statusText,
        fault?.Detail,
        res.status
      );
    }

    return res.json();
  }

  // === CUSTOMERS ===

  async createCustomer(data: {
    DisplayName: string;
    PrimaryEmailAddr?: { Address: string };
    PrimaryPhone?: { FreeFormNumber: string };
    BillAddr?: {
      Line1?: string;
      City?: string;
      CountrySubDivisionCode?: string;
      PostalCode?: string;
    };
    CompanyName?: string;
  }) {
    const res = await this.request('/customer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.Customer;
  }

  async findCustomerByName(displayName: string) {
    const escaped = displayName.replace(/'/g, "\\'");
    const res = await this.request(
      `/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${escaped}'`)}`
    );
    return res.QueryResponse?.Customer?.[0] ?? null;
  }

  async getCustomer(id: string) {
    const res = await this.request(`/customer/${id}`);
    return res.Customer;
  }

  // === INVOICES ===

  async createInvoice(data: {
    CustomerRef: { value: string };
    Line: InvoiceLine[];
    DueDate?: string;
    DocNumber?: string;
    BillEmail?: { Address: string };
    CustomerMemo?: { value: string };
  }) {
    const res = await this.request('/invoice', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.Invoice;
  }

  async getInvoice(id: string) {
    const res = await this.request(`/invoice/${id}`);
    return res.Invoice;
  }

  async sendInvoiceEmail(invoiceId: string, email?: string) {
    const query = email ? `?sendTo=${encodeURIComponent(email)}` : '';
    const res = await this.request(`/invoice/${invoiceId}/send${query}`, {
      method: 'POST',
    });
    return res.Invoice;
  }

  async voidInvoice(invoice: { Id: string; SyncToken: string }) {
    const res = await this.request(`/invoice?operation=void`, {
      method: 'POST',
      body: JSON.stringify(invoice),
    });
    return res.Invoice;
  }

  // === PAYMENTS ===

  async createPayment(data: {
    CustomerRef: { value: string };
    TotalAmt: number;
    Line?: { Amount: number; LinkedTxn: { TxnId: string; TxnType: 'Invoice' }[] }[];
  }) {
    const res = await this.request('/payment', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.Payment;
  }

  // === ITEMS (Products/Services) ===

  async createItem(data: {
    Name: string;
    Type: 'Service' | 'Inventory' | 'NonInventory';
    IncomeAccountRef: { value: string };
    ExpenseAccountRef?: { value: string };
    UnitPrice?: number;
    Description?: string;
  }) {
    const res = await this.request('/item', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.Item;
  }

  async findItemByName(name: string) {
    const escaped = name.replace(/'/g, "\\'");
    const res = await this.request(
      `/query?query=${encodeURIComponent(`SELECT * FROM Item WHERE Name = '${escaped}'`)}`
    );
    return res.QueryResponse?.Item?.[0] ?? null;
  }

  // === ACCOUNTS (Chart of Accounts) ===

  async getAccounts(accountType?: string) {
    let query = 'SELECT * FROM Account';
    if (accountType) query += ` WHERE AccountType = '${accountType}'`;
    query += ' ORDERBY Name';

    const res = await this.request(`/query?query=${encodeURIComponent(query)}`);
    return res.QueryResponse?.Account ?? [];
  }

  // === REPORTS ===

  async getProfitAndLoss(startDate: string, endDate: string) {
    return this.request(
      `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`
    );
  }

  async getBalanceSheet(date: string) {
    return this.request(`/reports/BalanceSheet?date=${date}`);
  }

  async getARAgingSummary() {
    return this.request('/reports/AgedReceivables');
  }

  // === CHANGE DATA CAPTURE ===

  async getChanges(entities: string[], sinceDate: string) {
    const entityList = entities.join(',');
    return this.request(
      `/cdc?entities=${entityList}&changedSince=${encodeURIComponent(sinceDate)}`
    );
  }

  // === QUERY (Generic) ===

  async query(soql: string) {
    const res = await this.request(
      `/query?query=${encodeURIComponent(soql)}`
    );
    return res.QueryResponse;
  }
}

// Types
interface InvoiceLine {
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail: {
    ItemRef: { value: string };
    Qty?: number;
    UnitPrice?: number;
  };
  Description?: string;
}

export class QuickBooksApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public detail: string | undefined,
    public status: number
  ) {
    super(`QBO ${code}: ${message}${detail ? ` — ${detail}` : ''}`);
    this.name = 'QuickBooksApiError';
  }
}
```

### Invoice Sync Pattern (Your App → QuickBooks)

```typescript
// lib/quickbooks/sync-invoices.ts

async function syncInvoiceToQuickBooks(
  qbo: QuickBooksClient,
  localInvoice: LocalInvoice,
  accountMapping: AccountMapping
): Promise<string> {
  // 1. Find or create customer in QBO
  let customer = await qbo.findCustomerByName(localInvoice.customerName);
  if (!customer) {
    customer = await qbo.createCustomer({
      DisplayName: localInvoice.customerName,
      PrimaryEmailAddr: localInvoice.customerEmail
        ? { Address: localInvoice.customerEmail }
        : undefined,
    });
  }

  // 2. Find or create line items
  const lines: InvoiceLine[] = [];
  for (const item of localInvoice.lineItems) {
    let qboItem = await qbo.findItemByName(item.name);
    if (!qboItem) {
      qboItem = await qbo.createItem({
        Name: item.name,
        Type: 'Service',
        IncomeAccountRef: { value: accountMapping.defaultIncomeAccount },
        UnitPrice: item.unitPrice,
      });
    }

    lines.push({
      Amount: item.quantity * item.unitPrice,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: qboItem.Id },
        Qty: item.quantity,
        UnitPrice: item.unitPrice,
      },
      Description: item.description,
    });
  }

  // 3. Create invoice
  const invoice = await qbo.createInvoice({
    CustomerRef: { value: customer.Id },
    Line: lines,
    DueDate: localInvoice.dueDate,
    DocNumber: localInvoice.invoiceNumber,
    BillEmail: localInvoice.customerEmail
      ? { Address: localInvoice.customerEmail }
      : undefined,
  });

  // 4. Optionally send email
  if (localInvoice.sendEmail) {
    await qbo.sendInvoiceEmail(invoice.Id);
  }

  return invoice.Id;
}
```

### Webhook Handler

```typescript
// app/api/webhooks/quickbooks/route.ts
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('intuit-signature');

  // Verify HMAC-SHA256 signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.QBO_WEBHOOK_VERIFIER_TOKEN!)
    .update(body)
    .digest('base64');

  if (signature !== expectedSignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Process each notification
  for (const notification of payload.eventNotifications ?? []) {
    const realmId = notification.realmId;

    for (const entity of notification.dataChangeEvent?.entities ?? []) {
      await queueQuickBooksSync({
        realmId,
        entityName: entity.name,    // e.g., 'Invoice', 'Customer', 'Payment'
        entityId: entity.id,
        operation: entity.operation, // 'Create', 'Update', 'Delete', 'Void'
        lastUpdated: entity.lastUpdated,
      });
    }
  }

  return NextResponse.json({ status: 'accepted' }, { status: 200 });
}
```

### Refresh Token Expiration Monitoring

```typescript
// CRITICAL: QuickBooks refresh tokens expire after 100 days
// If it expires, the user must go through OAuth again

async function checkExpiringConnections() {
  const { data: expiring } = await supabase
    .from('quickbooks_connections')
    .select('*')
    .eq('is_active', true)
    .lt('refresh_token_expires_at', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());

  for (const conn of expiring ?? []) {
    // Refresh the token now to extend the 100-day window
    try {
      const newTokens = await refreshAccessToken(decrypt(conn.refresh_token));
      await storeTokens(conn.org_id, conn.realm_id, newTokens);
    } catch {
      // Alert admin — user will need to re-authorize
      await notifyReAuthRequired(conn.org_id, conn.realm_id);
    }
  }
}
// Run this as a weekly cron job
```

### Environment Variables

```env
QBO_CLIENT_ID=your-intuit-client-id
QBO_CLIENT_SECRET=your-intuit-client-secret
QBO_REDIRECT_URI=https://yourapp.com/api/auth/quickbooks/callback
QBO_WEBHOOK_VERIFIER_TOKEN=your-webhook-verifier-token
QBO_ENVIRONMENT=production  # or sandbox
```

## Code Templates

- **`quickbooks-invoice-sync.ts`** — bidirectional invoice sync with customer/item resolution, SyncToken handling, and conflict detection

## Checklist

- [ ] OAuth 2.0 flow implemented with Basic auth header (not body params)
- [ ] Refresh tokens encrypted at rest with expiration tracking
- [ ] Refresh token renewal cron job running (100-day expiration!)
- [ ] All API calls include `?minorversion=73` parameter
- [ ] SyncToken included on every update request
- [ ] Customers/Items searched before creation (prevent duplicates)
- [ ] SOQL-style queries escape single quotes in user input
- [ ] Webhook signature verified with HMAC-SHA256
- [ ] CDC (Change Data Capture) used for batch sync operations
- [ ] Account mapping configurable per QBO company (not hardcoded)
- [ ] Error handling covers stale SyncToken, rate limits, and auth expiration
- [ ] Sandbox vs production environment configurable via env var

## Common Pitfalls

1. **100-day refresh token expiration** — This is the #1 cause of broken QuickBooks integrations. Unlike most OAuth providers, QuickBooks refresh tokens expire. You must refresh proactively or the user has to re-authorize.
2. **SyncToken conflicts** — If you read a record, someone edits it in QuickBooks, then you try to update with the stale SyncToken, it fails. Always re-read before updating, or handle the conflict gracefully.
3. **Sandbox vs Production URLs** — Sandbox uses `sandbox-quickbooks.api.intuit.com`, production uses `quickbooks.api.intuit.com`. Make sure your environment config is correct.
4. **Display name uniqueness** — QuickBooks enforces uniqueness on `DisplayName` across ALL name-list entities (Customer, Vendor, Employee). A customer and vendor can't share the same display name.
5. **Decimal precision** — QuickBooks uses up to 2 decimal places for amounts. Rounding differences between your app and QBO can cause reconciliation headaches. Always round to 2 decimals before sending.
6. **Deleted vs Voided** — Invoices can be voided (reversing entry) or deleted. Void is the correct accounting practice for issued invoices. Delete should only be used for draft/unsent invoices.
7. **Rate limits** — QuickBooks throttles at 500 requests per minute per realmId. Use batch queries and CDC instead of individual record fetches for sync operations.
