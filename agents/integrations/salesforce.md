---
name: Salesforce Integration Specialist
tier: integrations
triggers: salesforce, sfdc, salesforce api, salesforce sync, salesforce crm, soql, custom objects, salesforce webhook, salesforce oauth, salesforce bulk, salesforce rest api, salesforce soap
depends_on: auth.md, backend.md, webhooks.md
conflicts_with: null
prerequisites: Salesforce Connected App configured with OAuth 2.0
description: Salesforce REST/SOAP API integration — custom objects, SOQL queries, bulk data operations, real-time sync via Platform Events, OAuth flows, and bidirectional CRM sync patterns
code_templates: null
design_tokens: null
---

# Salesforce Integration Specialist

## Role

Implements production-grade integrations with Salesforce CRM using the REST API, Bulk API, and Platform Events. Handles the full lifecycle from Connected App OAuth to bidirectional data sync, managing token refresh, API versioning, governor limits, and error recovery. Ensures every Salesforce integration respects the platform's unique constraints (governor limits, bulkification) while providing a seamless experience for both admins and end users.

## When to Use

- Syncing contacts, leads, accounts, or opportunities between your app and Salesforce
- Querying Salesforce data via SOQL from your application
- Creating or updating custom objects in Salesforce
- Building bidirectional sync between your database and Salesforce
- Implementing Salesforce OAuth (Web Server flow) for user authentication
- Handling Salesforce Platform Events or outbound messages (webhooks)
- Bulk importing/exporting data to/from Salesforce
- Building admin tools that read/write Salesforce metadata

## Also Consider

- **webhooks.md** — Salesforce outbound messages and Platform Events follow webhook patterns
- **auth.md** — Salesforce OAuth has unique flows (Web Server, JWT Bearer, Username-Password)
- **crm.md** — when building your own CRM features that mirror Salesforce functionality
- **quickbooks.md** — when syncing between Salesforce and accounting systems
- **workflow-automation.md** — when Salesforce events trigger multi-step automation chains

## Anti-Patterns (NEVER Do)

1. **Never make API calls in a loop without bulkification.** Salesforce has strict API call limits. Use composite/batch endpoints or the Bulk API for multi-record operations.
2. **Never hardcode Salesforce instance URLs.** The instance URL is returned during OAuth and can change. Always use the `instance_url` from the auth response.
3. **Never ignore API version pinning.** Always specify the API version (e.g., `v59.0`). Unpinned versions can break when Salesforce releases updates.
4. **Never store refresh tokens in plaintext.** Salesforce refresh tokens are long-lived and grant full API access. Encrypt at rest.
5. **Never skip error handling for governor limits.** Salesforce returns specific error codes for limit violations. Handle `REQUEST_LIMIT_EXCEEDED` gracefully.
6. **Never poll for changes when Platform Events are available.** Use Platform Events, Change Data Capture, or outbound messages for real-time sync.
7. **Never assume field names are stable across orgs.** Custom fields have `__c` suffixes, and different orgs may have different custom fields. Always validate schema.
8. **Never send unescaped strings in SOQL.** SOQL injection is real. Always escape single quotes and special characters in query parameters.

## Standards & Patterns

### OAuth 2.0 — Web Server Flow

```typescript
// lib/salesforce/auth.ts

const SF_AUTH_URL = 'https://login.salesforce.com/services/oauth2/authorize';
const SF_TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';
const SF_API_VERSION = 'v59.0';

export function getAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    redirect_uri: process.env.SALESFORCE_REDIRECT_URI!,
    scope: 'api refresh_token',
    ...(state && { state }),
  });
  return `${SF_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(SF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      redirect_uri: process.env.SALESFORCE_REDIRECT_URI!,
      code,
    }),
  });

  if (!res.ok) throw new Error(`Salesforce token exchange failed: ${res.statusText}`);

  const data = await res.json();
  // data includes: access_token, refresh_token, instance_url, id, token_type
  return data;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(SF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error('Salesforce token refresh failed');
  return res.json();
}
```

### Token Storage Schema

```sql
CREATE TABLE salesforce_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sf_org_id TEXT NOT NULL,          -- Salesforce org ID
  instance_url TEXT NOT NULL,       -- e.g., https://na1.salesforce.com
  access_token TEXT NOT NULL,       -- Encrypted
  refresh_token TEXT NOT NULL,      -- Encrypted
  sf_user_id TEXT NOT NULL,
  api_version TEXT NOT NULL DEFAULT 'v59.0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, sf_org_id)
);
```

### REST API Client

```typescript
// lib/salesforce/client.ts

interface SalesforceConfig {
  instanceUrl: string;
  accessToken: string;
  apiVersion: string;
}

export class SalesforceClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private config: SalesforceConfig) {
    this.baseUrl = `${config.instanceUrl}/services/data/${config.apiVersion}`;
    this.headers = {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  // SOQL Query
  async query<T = Record<string, any>>(soql: string): Promise<T[]> {
    const records: T[] = [];
    let url = `${this.baseUrl}/query?q=${encodeURIComponent(soql)}`;

    do {
      const res = await this.request(url);
      records.push(...res.records);
      url = res.nextRecordsUrl
        ? `${this.config.instanceUrl}${res.nextRecordsUrl}`
        : '';
    } while (url);

    return records;
  }

  // Get single record
  async getRecord(sobject: string, id: string, fields?: string[]): Promise<any> {
    let url = `${this.baseUrl}/sobjects/${sobject}/${id}`;
    if (fields) url += `?fields=${fields.join(',')}`;
    return this.request(url);
  }

  // Create record
  async createRecord(sobject: string, data: Record<string, any>): Promise<{ id: string; success: boolean }> {
    return this.request(`${this.baseUrl}/sobjects/${sobject}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Update record
  async updateRecord(sobject: string, id: string, data: Record<string, any>): Promise<void> {
    await this.request(`${this.baseUrl}/sobjects/${sobject}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Delete record
  async deleteRecord(sobject: string, id: string): Promise<void> {
    await this.request(`${this.baseUrl}/sobjects/${sobject}/${id}`, {
      method: 'DELETE',
    });
  }

  // Upsert by external ID
  async upsertRecord(
    sobject: string,
    externalIdField: string,
    externalIdValue: string,
    data: Record<string, any>
  ): Promise<{ id: string; created: boolean }> {
    return this.request(
      `${this.baseUrl}/sobjects/${sobject}/${externalIdField}/${externalIdValue}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    );
  }

  // Composite request (up to 25 subrequests in one call)
  async composite(requests: CompositeSubrequest[]): Promise<CompositeResponse> {
    return this.request(`${this.baseUrl}/composite`, {
      method: 'POST',
      body: JSON.stringify({ compositeRequest: requests }),
    });
  }

  // Describe object (get metadata/fields)
  async describe(sobject: string): Promise<any> {
    return this.request(`${this.baseUrl}/sobjects/${sobject}/describe`);
  }

  private async request(url: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers },
    });

    if (res.status === 204) return; // No content (successful DELETE/PATCH)

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      const sfError = Array.isArray(error) ? error[0] : error;

      // Handle specific Salesforce errors
      if (res.status === 401) throw new SalesforceAuthError('Token expired');
      if (sfError?.errorCode === 'REQUEST_LIMIT_EXCEEDED') {
        throw new SalesforceRateLimitError(sfError.message);
      }

      throw new SalesforceApiError(sfError.errorCode, sfError.message, res.status);
    }

    return res.json();
  }
}

// Custom error classes
export class SalesforceAuthError extends Error { name = 'SalesforceAuthError'; }
export class SalesforceRateLimitError extends Error { name = 'SalesforceRateLimitError'; }
export class SalesforceApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(`${code}: ${message}`);
    this.name = 'SalesforceApiError';
  }
}
```

### SOQL Query Safety

```typescript
// ALWAYS escape user input in SOQL
export function escapeSoql(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

// Usage
const name = escapeSoql(userInput);
const results = await sf.query(`SELECT Id, Name FROM Contact WHERE LastName = '${name}'`);
```

### Bidirectional Sync Pattern

```typescript
// Sync strategy: Last-write-wins with conflict detection

interface SyncMapping {
  localTable: string;
  sfObject: string;
  fieldMap: Record<string, string>; // local_field → sf_field
  externalIdField: string;         // SF external ID field for upsert
  localIdField: string;            // Local field storing SF record ID
}

// Push local changes → Salesforce
async function pushToSalesforce(
  sf: SalesforceClient,
  mapping: SyncMapping,
  localRecords: any[]
) {
  const results = [];

  // Use composite API for batches of 25
  for (let i = 0; i < localRecords.length; i += 25) {
    const batch = localRecords.slice(i, i + 25);
    const compositeRequests = batch.map((record, idx) => {
      const sfData: Record<string, any> = {};
      for (const [localField, sfField] of Object.entries(mapping.fieldMap)) {
        sfData[sfField] = record[localField];
      }

      const sfId = record[mapping.localIdField];
      return {
        referenceId: `ref_${idx}`,
        method: sfId ? 'PATCH' : 'POST',
        url: sfId
          ? `/services/data/v59.0/sobjects/${mapping.sfObject}/${sfId}`
          : `/services/data/v59.0/sobjects/${mapping.sfObject}`,
        body: sfData,
      };
    });

    const response = await sf.composite(compositeRequests);
    results.push(...response.compositeResponse);
  }

  return results;
}

// Pull Salesforce changes → local
async function pullFromSalesforce(
  sf: SalesforceClient,
  mapping: SyncMapping,
  lastSyncAt: Date
) {
  const sfFields = Object.values(mapping.fieldMap).join(', ');
  const soql = `
    SELECT Id, ${sfFields}, LastModifiedDate 
    FROM ${mapping.sfObject} 
    WHERE LastModifiedDate > ${lastSyncAt.toISOString()}
    ORDER BY LastModifiedDate ASC
  `;

  const records = await sf.query(soql);

  // Map SF fields back to local fields
  const reverseMap = Object.fromEntries(
    Object.entries(mapping.fieldMap).map(([k, v]) => [v, k])
  );

  return records.map((record: any) => {
    const localData: Record<string, any> = { sf_id: record.Id };
    for (const [sfField, localField] of Object.entries(reverseMap)) {
      localData[localField] = record[sfField];
    }
    return localData;
  });
}
```

### Bulk API 2.0 (for large data volumes)

```typescript
// lib/salesforce/bulk.ts

export async function bulkUpsert(
  sf: SalesforceClient,
  sobject: string,
  externalIdField: string,
  records: Record<string, any>[],
  config: SalesforceConfig
): Promise<{ jobId: string; state: string }> {
  const baseUrl = `${config.instanceUrl}/services/data/${config.apiVersion}`;
  const headers = {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Create job
  const jobRes = await fetch(`${baseUrl}/jobs/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'upsert',
      object: sobject,
      externalIdFieldName: externalIdField,
      contentType: 'CSV',
      lineEnding: 'LF',
    }),
  });
  const job = await jobRes.json();

  // 2. Upload CSV data
  const csv = recordsToCsv(records);
  await fetch(`${baseUrl}/jobs/ingest/${job.id}/batches`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'text/csv' },
    body: csv,
  });

  // 3. Close job to start processing
  await fetch(`${baseUrl}/jobs/ingest/${job.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ state: 'UploadComplete' }),
  });

  return { jobId: job.id, state: 'UploadComplete' };
}

function recordsToCsv(records: Record<string, any>[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const rows = records.map((r) =>
    headers.map((h) => {
      const val = r[h] ?? '';
      return typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))
        ? `"${val.replace(/"/g, '""')}"`
        : String(val);
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
```

### Platform Events (Real-Time Inbound)

```
Salesforce Platform Event → CometD Streaming → Your Webhook Endpoint
  OR
Salesforce Outbound Message → POST to your webhook URL
  OR
Change Data Capture → CometD Streaming → Your processing pipeline
```

For serverless apps, use Salesforce → Outbound Message → your webhook endpoint (see webhooks.md). Platform Events with CometD require a persistent connection, better suited for long-running servers.

### Governor Limits Quick Reference

| Limit | Value |
|---|---|
| API calls per 24hr (Enterprise) | 100,000 (base) + per-license additions |
| SOQL query length | 100,000 characters |
| Records per SOQL query | 50,000 |
| Composite subrequests | 25 per call |
| Bulk API batches | 10,000 records per batch |
| Concurrent API requests | 25 per user |

### Environment Variables

```env
SALESFORCE_CLIENT_ID=your-connected-app-consumer-key
SALESFORCE_CLIENT_SECRET=your-connected-app-consumer-secret
SALESFORCE_REDIRECT_URI=https://yourapp.com/api/auth/salesforce/callback
```

## Code Templates

No dedicated code templates — the inline patterns above provide comprehensive coverage. For complex sync scenarios, combine with webhooks.md templates for outbound message handling.

## Checklist

- [ ] Connected App configured in Salesforce with correct OAuth scopes and callback URL
- [ ] OAuth Web Server flow implemented with proper token storage (encrypted)
- [ ] Token refresh logic handles 401 and re-authenticates automatically
- [ ] API version pinned in client configuration (e.g., `v59.0`)
- [ ] All SOQL queries use parameterized/escaped input (no injection)
- [ ] Pagination implemented for all query results (nextRecordsUrl)
- [ ] Bulk operations use Composite API (≤25 records) or Bulk API 2.0 (>25 records)
- [ ] Sync mapping table documents field-level correspondences
- [ ] Conflict resolution strategy defined (last-write-wins or manual merge)
- [ ] Governor limit monitoring in place (track daily API usage)
- [ ] Error handling covers auth errors, rate limits, and field validation errors
- [ ] Platform Events or Outbound Messages configured for real-time sync (not polling)

## Common Pitfalls

1. **Instance URL changes** — After a Salesforce org migration or sandbox refresh, the instance URL changes. Always use the URL from the OAuth response, not a hardcoded one.
2. **Sandbox vs Production auth URLs** — Production uses `login.salesforce.com`, sandboxes use `test.salesforce.com`. Make this configurable.
3. **Custom field naming** — Custom fields in Salesforce end with `__c`. Custom objects end with `__c`. Custom relationships end with `__r`. Don't forget these suffixes.
4. **Record type IDs differ across orgs** — Record Type IDs are org-specific. Never hardcode them. Query `RecordType` to get the correct IDs dynamically.
5. **Bulk API is async** — Bulk API 2.0 jobs process asynchronously. You must poll for job completion status, not assume immediate results.
6. **Formula fields are read-only** — You can't write to formula fields, rollup summaries, or auto-number fields via the API. Filter them from your sync mapping.
7. **Deleted records** — Standard SOQL doesn't return deleted records. Use `queryAll` or check the `IsDeleted` field to handle deletions in sync.
