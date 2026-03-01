---
name: Microsoft 365 Integration Specialist
tier: integrations
triggers: microsoft 365, ms graph, graph api, outlook, teams, sharepoint, onedrive, microsoft oauth, azure ad, entra id, microsoft calendar, microsoft teams bot, office 365
depends_on: auth.md, backend.md
conflicts_with: null
prerequisites: Azure App Registration with Microsoft Graph API permissions
description: Microsoft 365 integration — Graph API for Outlook mail/calendar, Teams messaging/bots, SharePoint/OneDrive files, with Azure AD/Entra ID OAuth and delegated/application permissions
code_templates: null
design_tokens: null
---

# Microsoft 365 Integration Specialist

## Role

Implements production-grade integrations with the Microsoft 365 ecosystem via the Microsoft Graph API. Handles Outlook email and calendar, Teams messaging and bots, SharePoint document libraries, and OneDrive file storage. Manages the complexity of Azure AD (Entra ID) authentication, delegated vs application permissions, tenant configuration, and the unique quirks of the Graph API. Ensures every integration handles token refresh, pagination, throttling, and error recovery correctly.

## When to Use

- Sending or reading emails through Outlook/Exchange
- Syncing calendars with Outlook Calendar
- Posting messages to Microsoft Teams channels or chats
- Building Teams bots or interactive message cards
- Uploading/downloading files from SharePoint or OneDrive
- Querying Azure AD for user profiles, groups, or org structure
- Implementing Microsoft SSO (Azure AD/Entra ID)
- Building apps that serve Microsoft-heavy enterprise customers

## Also Consider

- **auth.md** — for OAuth 2.0 flow patterns (MSAL library specifics here)
- **google-workspace.md** — when supporting both Google and Microsoft ecosystems
- **email.md** — when deciding between Graph API and Resend for email
- **scheduling.md** — when building booking features on top of Outlook Calendar
- **webhooks.md** — Graph API subscriptions are webhook-based
- **slack.md** — when supporting both Teams and Slack

## Anti-Patterns (NEVER Do)

1. **Never use client secrets in frontend code.** Azure app secrets must stay server-side. Use authorization code flow with PKCE for SPAs, never implicit flow.
2. **Never request admin-consent permissions when delegated will do.** Application permissions bypass user consent and require tenant admin approval. Use delegated permissions unless you truly need daemon/background access.
3. **Never ignore the `@odata.nextLink`.** Graph API paginates by default. If you don't follow nextLink, you'll get incomplete data.
4. **Never hardcode tenant IDs.** Use `common` or `organizations` for multi-tenant apps. Single-tenant apps should use environment variables.
5. **Never poll for changes.** Use Graph API subscriptions (change notifications) for real-time updates. Polling is wasteful and slow.
6. **Never ignore throttling responses.** Graph API returns 429 with a `Retry-After` header. You must respect it or face extended throttling.
7. **Never request `Directory.ReadWrite.All` unless absolutely necessary.** This is a dangerous scope that gives broad directory access. Use the most specific scope possible.
8. **Never skip consent screen configuration.** Misconfigured redirect URIs and permissions in Azure Portal are the #1 cause of auth failures.

## Standards & Patterns

### Azure App Registration Setup

```
Azure Portal → App Registrations → New Registration
├── Name: Your App Name
├── Supported account types:
│   ├── Single tenant: Your org only
│   ├── Multi-tenant: Any Azure AD org
│   └── Multi-tenant + personal: Broadest (includes consumer accounts)
├── Redirect URI: https://yourapp.com/api/auth/microsoft/callback
├── API Permissions:
│   ├── Delegated: User.Read, Mail.Send, Calendars.ReadWrite
│   └── Application: Mail.Send (for daemon/background)
├── Certificates & Secrets: Generate client secret
└── Token configuration: Optional claims (email, groups)
```

### Authentication with MSAL

```typescript
// lib/microsoft/auth.ts
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID ?? 'common'}`,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

// Delegated permissions — scopes for user-level access
const SCOPES = {
  mail: ['Mail.Read', 'Mail.Send'],
  calendar: ['Calendars.ReadWrite'],
  files: ['Files.ReadWrite'],
  teams: ['Chat.ReadWrite', 'ChannelMessage.Send'],
  user: ['User.Read'],
};

export function getAuthUrl(scopes: string[], state?: string): string {
  const authCodeUrlParams = {
    scopes,
    redirectUri: process.env.AZURE_REDIRECT_URI!,
    state,
  };

  // Note: This returns a Promise in MSAL v2
  return msalClient.getAuthCodeUrl(authCodeUrlParams) as unknown as string;
}

export async function getTokenFromCode(code: string, scopes: string[]) {
  const tokenRequest: AuthorizationCodeRequest = {
    code,
    scopes,
    redirectUri: process.env.AZURE_REDIRECT_URI!,
  };

  const response = await msalClient.acquireTokenByCode(tokenRequest);
  return response;
}

// Silent token refresh
export async function getTokenSilent(userId: string, scopes: string[]) {
  // Retrieve cached account from your database
  const account = await getCachedAccount(userId);

  const silentRequest = {
    account,
    scopes,
    forceRefresh: false,
  };

  try {
    const response = await msalClient.acquireTokenSilent(silentRequest);
    return response.accessToken;
  } catch (error) {
    // Token cache miss or expired — trigger interactive flow
    throw new Error('Token expired. User must re-authenticate.');
  }
}

// Application permissions (daemon/background — no user context)
export async function getAppToken(scopes: string[] = ['https://graph.microsoft.com/.default']) {
  const response = await msalClient.acquireTokenByClientCredential({ scopes });
  return response?.accessToken;
}
```

### Token Storage Schema

```sql
CREATE TABLE microsoft_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,        -- Encrypted
  refresh_token TEXT,                -- Encrypted (may be null for app-only)
  id_token TEXT,                     -- Encrypted
  expiry_date TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  microsoft_user_id TEXT NOT NULL,   -- OID from Azure AD
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

ALTER TABLE microsoft_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_tokens" ON microsoft_tokens
  FOR ALL USING (auth.uid() = user_id);
```

### Graph API Client

```typescript
// lib/microsoft/graph.ts
import { Client, PageCollection, PageIterator } from '@microsoft/microsoft-graph-client';

export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

// Generic paginated fetch
export async function getAllPages<T>(
  client: Client,
  endpoint: string,
  select?: string[],
  filter?: string
): Promise<T[]> {
  let request = client.api(endpoint);
  if (select) request = request.select(select);
  if (filter) request = request.filter(filter);

  const response: PageCollection = await request.get();
  const items: T[] = [];

  const iterator = new PageIterator(response, (item) => {
    items.push(item);
    return true; // Continue iteration
  });

  await iterator.iterate();
  return items;
}
```

### Outlook Mail Integration

```typescript
// lib/microsoft/mail.ts

export async function sendMail(
  client: Client,
  to: string[],
  subject: string,
  htmlBody: string,
  options?: {
    cc?: string[];
    bcc?: string[];
    attachments?: { name: string; contentBytes: string; contentType: string }[];
    saveToSentItems?: boolean;
  }
) {
  const message = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: to.map((email) => ({ emailAddress: { address: email } })),
    ccRecipients: options?.cc?.map((email) => ({ emailAddress: { address: email } })),
    bccRecipients: options?.bcc?.map((email) => ({ emailAddress: { address: email } })),
    attachments: options?.attachments?.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentBytes: a.contentBytes,
      contentType: a.contentType,
    })),
  };

  await client.api('/me/sendMail').post({
    message,
    saveToSentItems: options?.saveToSentItems ?? true,
  });
}

export async function listInboxMessages(
  client: Client,
  top: number = 25,
  skip: number = 0
) {
  return client
    .api('/me/mailFolders/inbox/messages')
    .select(['subject', 'from', 'receivedDateTime', 'bodyPreview', 'isRead', 'hasAttachments'])
    .orderby('receivedDateTime desc')
    .top(top)
    .skip(skip)
    .get();
}
```

### Outlook Calendar Integration

```typescript
// lib/microsoft/calendar.ts

export async function listEvents(
  client: Client,
  startDateTime: string, // ISO 8601
  endDateTime: string
) {
  return client
    .api('/me/calendarView')
    .query({
      startDateTime,
      endDateTime,
    })
    .select(['subject', 'start', 'end', 'location', 'organizer', 'attendees', 'isOnlineMeeting', 'onlineMeetingUrl'])
    .orderby('start/dateTime')
    .top(50)
    .get();
}

export async function createEvent(
  client: Client,
  event: {
    subject: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    attendees?: string[];
    body?: string;
    isOnlineMeeting?: boolean;
    location?: string;
  }
) {
  return client.api('/me/events').post({
    subject: event.subject,
    start: event.start,
    end: event.end,
    body: event.body ? { contentType: 'HTML', content: event.body } : undefined,
    location: event.location ? { displayName: event.location } : undefined,
    attendees: event.attendees?.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    })),
    isOnlineMeeting: event.isOnlineMeeting ?? false,
    onlineMeetingProvider: event.isOnlineMeeting ? 'teamsForBusiness' : undefined,
  });
}
```

### Teams Integration

```typescript
// lib/microsoft/teams.ts

// Send message to a Teams channel (application permission)
export async function sendChannelMessage(
  client: Client,
  teamId: string,
  channelId: string,
  htmlContent: string
) {
  return client
    .api(`/teams/${teamId}/channels/${channelId}/messages`)
    .post({
      body: { contentType: 'html', content: htmlContent },
    });
}

// Send Adaptive Card to channel
export async function sendAdaptiveCard(
  client: Client,
  teamId: string,
  channelId: string,
  card: Record<string, unknown>
) {
  return client
    .api(`/teams/${teamId}/channels/${channelId}/messages`)
    .post({
      body: { contentType: 'html', content: '' },
      attachments: [
        {
          id: crypto.randomUUID(),
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: JSON.stringify(card),
        },
      ],
    });
}

// List user's joined teams
export async function listTeams(client: Client) {
  return client
    .api('/me/joinedTeams')
    .select(['id', 'displayName', 'description'])
    .get();
}

// List channels in a team
export async function listChannels(client: Client, teamId: string) {
  return client
    .api(`/teams/${teamId}/channels`)
    .select(['id', 'displayName', 'membershipType'])
    .get();
}
```

### SharePoint / OneDrive File Operations

```typescript
// lib/microsoft/files.ts

// Upload small file (< 4MB) to OneDrive
export async function uploadSmallFile(
  client: Client,
  fileName: string,
  content: Buffer,
  folder: string = 'root'
) {
  return client
    .api(`/me/drive/${folder === 'root' ? 'root' : `items/${folder}`}:/${fileName}:/content`)
    .putStream(content);
}

// Upload large file (> 4MB) with resumable upload session
export async function uploadLargeFile(
  client: Client,
  fileName: string,
  content: Buffer,
  folder: string = 'root'
) {
  // Create upload session
  const session = await client
    .api(`/me/drive/${folder === 'root' ? 'root' : `items/${folder}`}:/${fileName}:/createUploadSession`)
    .post({ item: { name: fileName } });

  const uploadUrl = session.uploadUrl;
  const fileSize = content.length;
  const chunkSize = 320 * 1024 * 10; // ~3.2MB chunks

  for (let offset = 0; offset < fileSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, fileSize);
    const chunk = content.slice(offset, end);

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': chunk.length.toString(),
        'Content-Range': `bytes ${offset}-${end - 1}/${fileSize}`,
      },
      body: chunk,
    });
  }
}

// List files in a folder
export async function listFiles(
  client: Client,
  folderId: string = 'root'
) {
  const path = folderId === 'root' ? '/me/drive/root/children' : `/me/drive/items/${folderId}/children`;

  return client
    .api(path)
    .select(['id', 'name', 'size', 'lastModifiedDateTime', 'webUrl', 'file', 'folder'])
    .orderby('name')
    .get();
}

// Download file content
export async function downloadFile(
  client: Client,
  fileId: string
): Promise<ArrayBuffer> {
  return client
    .api(`/me/drive/items/${fileId}/content`)
    .getStream();
}
```

### Graph API Change Notifications (Subscriptions)

```typescript
// lib/microsoft/subscriptions.ts

export async function createSubscription(
  client: Client,
  resource: string, // e.g., '/me/messages', '/me/events', '/me/drive/root'
  notificationUrl: string,
  expirationMinutes: number = 4230 // Max ~3 days for most resources
) {
  const expiration = new Date(Date.now() + expirationMinutes * 60 * 1000);

  return client.api('/subscriptions').post({
    changeType: 'created,updated,deleted',
    notificationUrl,
    resource,
    expirationDateTime: expiration.toISOString(),
    clientState: process.env.GRAPH_WEBHOOK_SECRET, // Verified on incoming notifications
  });
}

// Webhook handler for Graph notifications
// app/api/webhooks/microsoft/route.ts
export async function POST(req: NextRequest) {
  // Validation token handshake (required on subscription creation)
  const validationToken = new URL(req.url).searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const body = await req.json();
  const notifications = body.value ?? [];

  for (const notification of notifications) {
    // Verify client state
    if (notification.clientState !== process.env.GRAPH_WEBHOOK_SECRET) {
      console.error('Invalid client state in Graph notification');
      continue;
    }

    // Queue processing
    await queueNotification({
      subscriptionId: notification.subscriptionId,
      changeType: notification.changeType,
      resource: notification.resource,
      resourceData: notification.resourceData,
      tenantId: notification.tenantId,
    });
  }

  return NextResponse.json({ status: 'accepted' }, { status: 202 });
}
```

### Throttling & Error Handling

```typescript
// lib/microsoft/retry.ts

export async function withGraphRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.statusCode ?? error?.code;

      // 429 — throttled
      if (status === 429) {
        const retryAfter = parseInt(error?.headers?.['retry-after'] ?? '10', 10);
        console.warn(`Graph API throttled. Retrying in ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // 503/504 — service unavailable
      if (status === 503 || status === 504) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable
      throw error;
    }
  }
  throw new Error('Max retry attempts exceeded');
}
```

### Environment Variables Required

```env
AZURE_CLIENT_ID=your-app-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=common                    # or specific tenant ID
AZURE_REDIRECT_URI=https://yourapp.com/api/auth/microsoft/callback
GRAPH_WEBHOOK_SECRET=random-validation-string
```

### Delegated vs Application Permissions Decision Matrix

| Scenario | Permission Type | Example Scope |
|---|---|---|
| User reads own email | Delegated | `Mail.Read` |
| User sends email | Delegated | `Mail.Send` |
| Background service sends email | Application | `Mail.Send` |
| User syncs own calendar | Delegated | `Calendars.ReadWrite` |
| Admin reads all users' calendars | Application | `Calendars.Read` |
| User uploads to own OneDrive | Delegated | `Files.ReadWrite` |
| Bot posts to Teams channel | Application | `ChannelMessage.Send` |

## Code Templates

No dedicated code templates for this agent — the inline patterns above cover all major scenarios. For complex integrations, combine with the webhooks agent templates for subscription management.

## Checklist

- [ ] Azure App Registration configured with correct redirect URIs and permissions
- [ ] MSAL configured for correct flow (auth code + PKCE for web, client credentials for daemon)
- [ ] Tokens encrypted at rest, refresh handled automatically
- [ ] All paginated endpoints followed to completion (nextLink)
- [ ] Graph API subscriptions set up for real-time sync (not polling)
- [ ] Subscription renewal cron job configured (max 3 days for most resources)
- [ ] Webhook handler validates clientState on all notifications
- [ ] Validation token handshake implemented for subscription creation
- [ ] Throttling (429) handled with Retry-After header
- [ ] Large file uploads use resumable upload sessions (> 4MB)
- [ ] Error messages mapped to user-friendly text
- [ ] Multi-tenant support tested if `authority` uses `common`

## Common Pitfalls

1. **Admin consent confusion** — Application permissions require tenant admin consent. Delegated permissions only need user consent. If your app doesn't need background access, stick to delegated.
2. **Subscription expiration** — Graph subscriptions expire (max ~3 days for mail/calendar, ~30 days for Teams). You must renew them proactively or you'll silently stop receiving notifications.
3. **Token cache management** — MSAL has its own token cache. In serverless environments (Vercel), you need to persist the MSAL cache to a database, not in-memory. Otherwise every cold start loses all cached tokens.
4. **Beta vs v1.0** — Some Graph endpoints are only available in `/beta`. Beta endpoints can change without notice. Always prefer `/v1.0` for production code.
5. **Teams bot framework** — Teams bots use the Bot Framework SDK, which is separate from Graph API. Don't try to build a Teams bot purely with Graph — you need the Bot Framework for interactive messaging.
6. **File path encoding** — SharePoint file paths with special characters must be URL-encoded. The Graph SDK handles this for IDs but not always for path-based access.
7. **Consent scope mismatch** — If you request a scope the user hasn't consented to, the token request will fail silently or return a token without that scope. Always verify the granted scopes in the token response.
