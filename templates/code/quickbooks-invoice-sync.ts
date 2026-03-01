/**
 * quickbooks-invoice-sync.ts
 * Bidirectional invoice sync with customer/item resolution,
 * SyncToken handling, and conflict detection.
 *
 * Usage:
 *   import { QBOInvoiceSync } from '@/lib/quickbooks/invoice-sync';
 *   const sync = new QBOInvoiceSync(orgId);
 *   await sync.pushInvoice(localInvoice);
 *   await sync.pullChanges();
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const QBO_API_BASE = 'https://quickbooks.api.intuit.com/v3';
const QBO_MINOR_VERSION = '73';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LocalInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  line_items: {
    name: string;
    description?: string;
    quantity: number;
    unit_price: number;
  }[];
  due_date?: string;
  notes?: string;
  send_email?: boolean;
  qbo_id?: string;
  qbo_sync_token?: string;
}

interface QBOConnection {
  realm_id: string;
  access_token: string;
  instance_url: string;
}

interface QBOCustomer {
  Id: string;
  DisplayName: string;
  SyncToken: string;
}

interface QBOItem {
  Id: string;
  Name: string;
  SyncToken: string;
  UnitPrice?: number;
}

interface QBOInvoice {
  Id: string;
  SyncToken: string;
  DocNumber: string;
  TotalAmt: number;
  Balance: number;
  DueDate: string;
  MetaData: { LastUpdatedTime: string };
  CustomerRef: { value: string; name: string };
  Line: any[];
}

interface SyncResult {
  success: boolean;
  qbo_id?: string;
  qbo_sync_token?: string;
  error?: string;
}

// ─── QBO API Client (Lightweight) ───────────────────────────────────────────

class QBOClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private connection: QBOConnection) {
    this.baseUrl = `${QBO_API_BASE}/company/${connection.realm_id}`;
    this.headers = {
      Authorization: `Bearer ${connection.access_token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async query<T = any>(sql: string): Promise<T[]> {
    const url = `${this.baseUrl}/query?query=${encodeURIComponent(sql)}&minorversion=${QBO_MINOR_VERSION}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) await this.handleError(res);
    const data = await res.json();
    // QBO returns QueryResponse with entity-named arrays
    const key = Object.keys(data.QueryResponse).find((k) => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount');
    return key ? data.QueryResponse[key] : [];
  }

  async create(entity: string, body: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}/${entity.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) await this.handleError(res);
    const data = await res.json();
    return data[entity];
  }

  async update(entity: string, body: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}/${entity.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}`;
    const res = await fetch(url, {
      method: 'POST', // QBO uses POST for updates too
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) await this.handleError(res);
    const data = await res.json();
    return data[entity];
  }

  async read(entity: string, id: string): Promise<any> {
    const url = `${this.baseUrl}/${entity.toLowerCase()}/${id}?minorversion=${QBO_MINOR_VERSION}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) await this.handleError(res);
    const data = await res.json();
    return data[entity];
  }

  async sendInvoiceEmail(invoiceId: string, email?: string): Promise<any> {
    let url = `${this.baseUrl}/invoice/${invoiceId}/send?minorversion=${QBO_MINOR_VERSION}`;
    if (email) url += `&sendTo=${encodeURIComponent(email)}`;
    const res = await fetch(url, { method: 'POST', headers: this.headers });
    if (!res.ok) await this.handleError(res);
    const data = await res.json();
    return data.Invoice;
  }

  async cdc(entities: string[], changedSince: string): Promise<Record<string, any[]>> {
    const url = `${this.baseUrl}/cdc?entities=${entities.join(',')}&changedSince=${encodeURIComponent(changedSince)}&minorversion=${QBO_MINOR_VERSION}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) await this.handleError(res);
    const data = await res.json();

    const result: Record<string, any[]> = {};
    for (const entry of data.CDCResponse?.[0]?.QueryResponse ?? []) {
      for (const key of Object.keys(entry)) {
        if (key !== 'startPosition' && key !== 'maxResults') {
          result[key] = entry[key];
        }
      }
    }
    return result;
  }

  private async handleError(res: Response): Promise<never> {
    const body = await res.json().catch(() => ({}));
    const fault = body?.Fault?.Error?.[0];
    const code = fault?.code ?? 'UNKNOWN';
    const message = fault?.Message ?? res.statusText;
    const detail = fault?.Detail ?? '';

    if (res.status === 401) {
      throw new QBOAuthError('Token expired or invalid. Re-authenticate.');
    }
    if (code === 'REQUEST_LIMIT_EXCEEDED' || res.status === 429) {
      throw new QBORateLimitError(message);
    }
    if (code === '6140') {
      throw new QBOStaleError('SyncToken is stale. Record was modified in QuickBooks.');
    }

    throw new QBOApiError(code, `${message} — ${detail}`, res.status);
  }
}

// ─── Invoice Sync Class ─────────────────────────────────────────────────────

export class QBOInvoiceSync {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  // ─── Push: Local → QuickBooks ─────────────────────────────────────────

  /**
   * Push a local invoice to QuickBooks. Creates or updates based on qbo_id presence.
   */
  async pushInvoice(invoice: LocalInvoice): Promise<SyncResult> {
    const client = await this.getClient();

    try {
      // 1. Resolve customer (find or create)
      const customer = await this.resolveCustomer(client, invoice.customer_name, invoice.customer_email);

      // 2. Resolve line items (find or create)
      const lines = await this.resolveLineItems(client, invoice.line_items);

      if (invoice.qbo_id) {
        // UPDATE existing invoice
        return await this.updateQBOInvoice(client, invoice, customer, lines);
      } else {
        // CREATE new invoice
        return await this.createQBOInvoice(client, invoice, customer, lines);
      }
    } catch (error) {
      if (error instanceof QBOStaleError) {
        // SyncToken conflict — re-read and retry once
        return await this.handleSyncConflict(client, invoice);
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[qbo-sync] Push failed for invoice ${invoice.id}:`, msg);
      return { success: false, error: msg };
    }
  }

  private async createQBOInvoice(
    client: QBOClient,
    invoice: LocalInvoice,
    customer: QBOCustomer,
    lines: { Amount: number; DetailType: string; SalesItemLineDetail: any; Description?: string }[]
  ): Promise<SyncResult> {
    const qboInvoice = await client.create('Invoice', {
      CustomerRef: { value: customer.Id },
      Line: lines,
      DueDate: invoice.due_date,
      DocNumber: invoice.invoice_number,
      CustomerMemo: invoice.notes ? { value: invoice.notes } : undefined,
      BillEmail: invoice.customer_email ? { Address: invoice.customer_email } : undefined,
    });

    // Store mapping
    await this.storeSyncMapping(invoice.id, qboInvoice.Id, qboInvoice.SyncToken);

    // Optionally send email
    if (invoice.send_email && invoice.customer_email) {
      try {
        await client.sendInvoiceEmail(qboInvoice.Id, invoice.customer_email);
      } catch (e) {
        console.warn(`[qbo-sync] Email send failed for invoice ${qboInvoice.Id}:`, e);
      }
    }

    console.log(`[qbo-sync] Created QBO invoice ${qboInvoice.Id} for local ${invoice.id}`);
    return { success: true, qbo_id: qboInvoice.Id, qbo_sync_token: qboInvoice.SyncToken };
  }

  private async updateQBOInvoice(
    client: QBOClient,
    invoice: LocalInvoice,
    customer: QBOCustomer,
    lines: { Amount: number; DetailType: string; SalesItemLineDetail: any; Description?: string }[]
  ): Promise<SyncResult> {
    // Re-read to get fresh SyncToken
    const current = await client.read('Invoice', invoice.qbo_id!);

    const qboInvoice = await client.update('Invoice', {
      Id: invoice.qbo_id,
      SyncToken: current.SyncToken, // MUST include current SyncToken
      CustomerRef: { value: customer.Id },
      Line: lines,
      DueDate: invoice.due_date,
      DocNumber: invoice.invoice_number,
      CustomerMemo: invoice.notes ? { value: invoice.notes } : undefined,
      BillEmail: invoice.customer_email ? { Address: invoice.customer_email } : undefined,
    });

    await this.storeSyncMapping(invoice.id, qboInvoice.Id, qboInvoice.SyncToken);

    console.log(`[qbo-sync] Updated QBO invoice ${qboInvoice.Id}`);
    return { success: true, qbo_id: qboInvoice.Id, qbo_sync_token: qboInvoice.SyncToken };
  }

  private async handleSyncConflict(client: QBOClient, invoice: LocalInvoice): Promise<SyncResult> {
    if (!invoice.qbo_id) {
      return { success: false, error: 'SyncToken conflict on a new invoice — this should not happen.' };
    }

    console.warn(`[qbo-sync] SyncToken stale for QBO invoice ${invoice.qbo_id}, re-reading...`);

    try {
      const fresh = await client.read('Invoice', invoice.qbo_id);
      // Update the local SyncToken and retry
      invoice.qbo_sync_token = fresh.SyncToken;
      const customer = await this.resolveCustomer(client, invoice.customer_name, invoice.customer_email);
      const lines = await this.resolveLineItems(client, invoice.line_items);
      return await this.updateQBOInvoice(client, invoice, customer, lines);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Conflict retry failed: ${msg}` };
    }
  }

  // ─── Pull: QuickBooks → Local ─────────────────────────────────────────

  /**
   * Pull invoice changes from QuickBooks since last sync.
   * Uses Change Data Capture (CDC) for efficient incremental sync.
   */
  async pullChanges(): Promise<{ created: number; updated: number; voided: number }> {
    const client = await this.getClient();
    const lastSync = await this.getLastSyncTime();

    // Default to 24 hours ago if no previous sync
    const changedSince = lastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const changes = await client.cdc(['Invoice'], changedSince);
    const invoices: QBOInvoice[] = changes['Invoice'] ?? [];

    let created = 0, updated = 0, voided = 0;

    for (const qboInvoice of invoices) {
      // Check if we have a local mapping
      const { data: mapping } = await supabase
        .from('qbo_sync_mappings')
        .select('local_id')
        .eq('org_id', this.orgId)
        .eq('qbo_id', qboInvoice.Id)
        .eq('entity_type', 'invoice')
        .single();

      if (mapping) {
        // Update existing local record
        await this.updateLocalInvoice(mapping.local_id, qboInvoice);
        if ((qboInvoice as any).status === 'Voided') voided++;
        else updated++;
      } else {
        // New invoice created in QBO — create locally
        await this.createLocalFromQBO(qboInvoice);
        created++;
      }
    }

    // Update last sync time
    await this.setLastSyncTime(new Date().toISOString());

    console.log(`[qbo-sync] Pull complete: +${created} ~${updated} voided:${voided}`);
    return { created, updated, voided };
  }

  private async updateLocalInvoice(localId: string, qboInvoice: QBOInvoice) {
    await supabase
      .from('invoices')
      .update({
        total_amount: this.roundTo2(qboInvoice.TotalAmt),
        balance_due: this.roundTo2(qboInvoice.Balance),
        due_date: qboInvoice.DueDate,
        qbo_last_synced_at: new Date().toISOString(),
      })
      .eq('id', localId);

    // Update sync mapping with fresh SyncToken
    await supabase
      .from('qbo_sync_mappings')
      .update({ qbo_sync_token: qboInvoice.SyncToken, synced_at: new Date().toISOString() })
      .eq('org_id', this.orgId)
      .eq('qbo_id', qboInvoice.Id)
      .eq('entity_type', 'invoice');
  }

  private async createLocalFromQBO(qboInvoice: QBOInvoice) {
    const localId = crypto.randomUUID();

    await supabase.from('invoices').insert({
      id: localId,
      org_id: this.orgId,
      invoice_number: qboInvoice.DocNumber,
      customer_name: qboInvoice.CustomerRef.name,
      total_amount: this.roundTo2(qboInvoice.TotalAmt),
      balance_due: this.roundTo2(qboInvoice.Balance),
      due_date: qboInvoice.DueDate,
      source: 'quickbooks',
      qbo_last_synced_at: new Date().toISOString(),
    });

    await this.storeSyncMapping(localId, qboInvoice.Id, qboInvoice.SyncToken);
  }

  // ─── Entity Resolution ────────────────────────────────────────────────

  /**
   * Find existing QBO customer by name or create a new one.
   */
  private async resolveCustomer(
    client: QBOClient,
    displayName: string,
    email?: string
  ): Promise<QBOCustomer> {
    // Check local cache first
    const { data: cached } = await supabase
      .from('qbo_sync_mappings')
      .select('qbo_id')
      .eq('org_id', this.orgId)
      .eq('entity_type', 'customer')
      .eq('local_name', displayName)
      .single();

    if (cached) {
      try {
        return await client.read('Customer', cached.qbo_id);
      } catch {
        // Cached ID invalid, search fresh
      }
    }

    // Search in QBO
    const escaped = displayName.replace(/'/g, "\\'");
    const results = await client.query<QBOCustomer>(
      `SELECT Id, DisplayName, SyncToken FROM Customer WHERE DisplayName = '${escaped}'`
    );

    if (results.length > 0) {
      // Cache the mapping
      await supabase.from('qbo_sync_mappings').upsert({
        org_id: this.orgId,
        entity_type: 'customer',
        local_name: displayName,
        qbo_id: results[0].Id,
        qbo_sync_token: results[0].SyncToken,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'org_id,entity_type,local_name' });

      return results[0];
    }

    // Create new customer
    const newCustomer = await client.create('Customer', {
      DisplayName: displayName,
      PrimaryEmailAddr: email ? { Address: email } : undefined,
    });

    await supabase.from('qbo_sync_mappings').upsert({
      org_id: this.orgId,
      entity_type: 'customer',
      local_name: displayName,
      qbo_id: newCustomer.Id,
      qbo_sync_token: newCustomer.SyncToken,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'org_id,entity_type,local_name' });

    console.log(`[qbo-sync] Created QBO customer: ${displayName} (${newCustomer.Id})`);
    return newCustomer;
  }

  /**
   * Find existing QBO items by name or create new ones. Returns invoice line format.
   */
  private async resolveLineItems(
    client: QBOClient,
    lineItems: LocalInvoice['line_items']
  ): Promise<any[]> {
    // Get default income account for new items
    const incomeAccounts = await client.query(
      `SELECT Id FROM Account WHERE AccountType = 'Income' MAXRESULTS 1`
    );
    const defaultIncomeAccountId = incomeAccounts[0]?.Id;
    if (!defaultIncomeAccountId) {
      throw new Error('No income account found in QuickBooks. Create one before syncing invoices.');
    }

    const lines: any[] = [];

    for (const item of lineItems) {
      let qboItem: QBOItem | null = null;

      // Search by name
      const escaped = item.name.replace(/'/g, "\\'");
      const results = await client.query<QBOItem>(
        `SELECT Id, Name, SyncToken, UnitPrice FROM Item WHERE Name = '${escaped}'`
      );

      if (results.length > 0) {
        qboItem = results[0];
      } else {
        // Create item
        qboItem = await client.create('Item', {
          Name: item.name,
          Type: 'Service',
          IncomeAccountRef: { value: defaultIncomeAccountId },
          UnitPrice: this.roundTo2(item.unit_price),
          Description: item.description,
        });
        console.log(`[qbo-sync] Created QBO item: ${item.name} (${qboItem!.Id})`);
      }

      lines.push({
        Amount: this.roundTo2(item.quantity * item.unit_price),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: qboItem!.Id },
          Qty: item.quantity,
          UnitPrice: this.roundTo2(item.unit_price),
        },
        Description: item.description,
      });
    }

    return lines;
  }

  // ─── Sync State Management ────────────────────────────────────────────

  private async storeSyncMapping(localId: string, qboId: string, syncToken: string) {
    await supabase.from('qbo_sync_mappings').upsert({
      org_id: this.orgId,
      entity_type: 'invoice',
      local_id: localId,
      qbo_id: qboId,
      qbo_sync_token: syncToken,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'org_id,entity_type,local_id' });
  }

  private async getLastSyncTime(): Promise<string | null> {
    const { data } = await supabase
      .from('qbo_sync_state')
      .select('last_sync_at')
      .eq('org_id', this.orgId)
      .eq('entity_type', 'invoice')
      .single();
    return data?.last_sync_at ?? null;
  }

  private async setLastSyncTime(time: string) {
    await supabase.from('qbo_sync_state').upsert({
      org_id: this.orgId,
      entity_type: 'invoice',
      last_sync_at: time,
    }, { onConflict: 'org_id,entity_type' });
  }

  private async getClient(): Promise<QBOClient> {
    const { data: conn } = await supabase
      .from('quickbooks_connections')
      .select('realm_id, access_token, refresh_token, access_token_expires_at')
      .eq('org_id', this.orgId)
      .eq('is_active', true)
      .single();

    if (!conn) throw new Error(`No active QuickBooks connection for org ${this.orgId}`);

    // Check if token needs refresh
    if (new Date(conn.access_token_expires_at) < new Date(Date.now() + 60_000)) {
      // TODO: Call refreshAccessToken() from quickbooks auth module
      // const refreshed = await refreshAccessToken(decrypt(conn.refresh_token));
      // Update stored tokens...
      console.warn('[qbo-sync] Access token may be expired. Implement refresh logic.');
    }

    return new QBOClient({
      realm_id: conn.realm_id,
      access_token: conn.access_token, // Should be decrypt(conn.access_token) in production
      instance_url: QBO_API_BASE,
    });
  }

  // ─── Utilities ────────────────────────────────────────────────────────

  private roundTo2(num: number): number {
    return Math.round(num * 100) / 100;
  }
}

// ─── Error Classes ──────────────────────────────────────────────────────────

export class QBOAuthError extends Error { name = 'QBOAuthError'; }
export class QBORateLimitError extends Error { name = 'QBORateLimitError'; }
export class QBOStaleError extends Error { name = 'QBOStaleError'; }
export class QBOApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'QBOApiError';
  }
}

// ─── Database Schema ────────────────────────────────────────────────────────
/*
CREATE TABLE qbo_sync_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,          -- 'invoice', 'customer', 'item'
  local_id TEXT,                      -- Your app's record ID
  local_name TEXT,                    -- For name-based lookups (customers, items)
  qbo_id TEXT NOT NULL,               -- QuickBooks record ID
  qbo_sync_token TEXT,                -- For optimistic concurrency
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, entity_type, local_id),
  UNIQUE(org_id, entity_type, local_name)
);

CREATE INDEX idx_qbo_mapping_lookup ON qbo_sync_mappings(org_id, entity_type, qbo_id);

CREATE TABLE qbo_sync_state (
  org_id UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(org_id, entity_type)
);
*/
