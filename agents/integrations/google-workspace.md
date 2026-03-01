---
name: Google Workspace Integration Specialist
tier: integrations
triggers: google calendar, google drive, gmail api, google sheets, google workspace, gcal, gdrive, google oauth, google api, google meet, google docs api
depends_on: auth.md, backend.md
conflicts_with: null
prerequisites: Google Cloud Console project with APIs enabled, OAuth 2.0 credentials
description: Google Workspace integration — Calendar, Drive, Gmail, and Sheets APIs with OAuth, sync patterns, real-time push notifications, and quota management
code_templates: google-calendar-sync.ts, google-drive-upload.ts
design_tokens: null
---

# Google Workspace Integration Specialist

## Role

Implements production-grade integrations with Google Workspace APIs including Calendar, Drive, Gmail, and Sheets. Handles the full lifecycle from OAuth consent to real-time sync, managing token refresh, quota limits, push notifications, and error recovery. Ensures every Google integration follows Google's best practices for API usage, handles rate limits gracefully, and provides a seamless user experience.

## When to Use

- Syncing events with Google Calendar (read, create, update, watch for changes)
- Uploading, downloading, or managing files in Google Drive
- Sending emails via Gmail API (transactional, drafts, threads)
- Reading/writing Google Sheets as a data source or reporting layer
- Setting up Google OAuth for workspace-scoped access
- Implementing real-time sync via Google Push Notifications (webhooks)
- Managing Google Meet links for scheduling features
- Batch operations across Google APIs

## Also Consider

- **auth.md** — for OAuth 2.0 flow implementation and token management
- **scheduling.md** — when building booking/calendar features on top of Google Calendar
- **email.md** — when deciding between Gmail API vs Resend for sending email
- **file-media.md** — when Google Drive is one of multiple storage backends
- **webhooks.md** — Google push notifications are essentially webhooks
- **microsoft-365.md** — when supporting both Google and Microsoft ecosystems

## Anti-Patterns (NEVER Do)

1. **Never store Google tokens in plaintext.** Always encrypt refresh tokens at rest. Access tokens are short-lived but refresh tokens are long-lived credentials.
2. **Never request more scopes than needed.** Use incremental authorization — start with minimal scopes, request additional only when the user needs that feature.
3. **Never ignore token expiration.** Access tokens expire in ~1 hour. Always check expiration and refresh proactively, not on failure.
4. **Never poll for changes.** Use Google Push Notifications (watch) for Calendar and Drive. Polling wastes quota and adds latency.
5. **Never make unbounded API calls.** Always paginate results and implement quota tracking. Google APIs have per-user and per-project quotas.
6. **Never assume consistent availability.** Google APIs have transient errors. Implement exponential backoff for 5xx and 429 responses.
7. **Never hardcode Google API URLs.** Use the official `googleapis` npm package which handles endpoint discovery, auth injection, and serialization.
8. **Never skip the consent screen configuration.** Misconfigured OAuth consent screens lead to app verification delays and user confusion.

## Standards & Patterns

### OAuth 2.0 Setup

```typescript
// lib/google/auth.ts
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g., https://yourapp.com/api/auth/google/callback
);

// Scopes — request only what you need
const SCOPES = {
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive.file', // Only files created by app
  ],
  gmail: [
    'https://www.googleapis.com/auth/gmail.send',
  ],
  sheets: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
};

export function getAuthUrl(requestedScopes: string[]): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Gets refresh token
    scope: requestedScopes,
    prompt: 'consent', // Force consent to get refresh token
    include_granted_scopes: true, // Incremental auth
  });
}
```

### Token Management

```typescript
// lib/google/tokens.ts
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/encryption';

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
}

export async function storeTokens(userId: string, tokens: GoogleTokens) {
  await supabase.from('google_tokens').upsert({
    user_id: userId,
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    expiry_date: new Date(tokens.expiry_date).toISOString(),
    scope: tokens.scope,
    updated_at: new Date().toISOString(),
  });
}

export async function getAuthenticatedClient(userId: string) {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) throw new Error('No Google tokens found. User must re-authorize.');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: decrypt(data.access_token),
    refresh_token: decrypt(data.refresh_token),
    expiry_date: new Date(data.expiry_date).getTime(),
  });

  // Auto-refresh handler
  oauth2Client.on('tokens', async (newTokens) => {
    await storeTokens(userId, {
      access_token: newTokens.access_token!,
      refresh_token: newTokens.refresh_token ?? decrypt(data.refresh_token),
      expiry_date: newTokens.expiry_date!,
      scope: data.scope,
    });
  });

  return oauth2Client;
}
```

### Token Storage Schema

```sql
CREATE TABLE google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,      -- Encrypted
  refresh_token TEXT NOT NULL,     -- Encrypted
  expiry_date TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

-- RLS: Users can only access their own tokens
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_tokens" ON google_tokens
  FOR ALL USING (auth.uid() = user_id);
```

### Google Calendar Integration

```typescript
// lib/google/calendar.ts
import { google, calendar_v3 } from 'googleapis';

export async function listEvents(
  authClient: any,
  calendarId: string = 'primary',
  timeMin: Date,
  timeMax: Date
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });

    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

export async function createEvent(
  authClient: any,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
    location?: string;
    addMeetLink?: boolean;
  }
): Promise<calendar_v3.Schema$Event> {
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: event.addMeetLink ? 1 : 0,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime.toISOString() },
      end: { dateTime: event.endTime.toISOString() },
      attendees: event.attendees?.map((email) => ({ email })),
      location: event.location,
      ...(event.addMeetLink && {
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  });

  return res.data;
}

// Watch for changes (push notifications)
export async function watchCalendar(
  authClient: any,
  calendarId: string,
  webhookUrl: string
): Promise<calendar_v3.Schema$Channel> {
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const res = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: crypto.randomUUID(),
      type: 'web_hook',
      address: webhookUrl,
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return res.data;
}
```

### Google Drive Integration

```typescript
// lib/google/drive.ts
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export async function uploadFile(
  authClient: any,
  file: {
    name: string;
    mimeType: string;
    content: Buffer;
    folderId?: string;
  }
): Promise<drive_v3.Schema$File> {
  const drive = google.drive({ version: 'v3', auth: authClient });

  const res = await drive.files.create({
    requestBody: {
      name: file.name,
      mimeType: file.mimeType,
      parents: file.folderId ? [file.folderId] : undefined,
    },
    media: {
      mimeType: file.mimeType,
      body: Readable.from(file.content),
    },
    fields: 'id, name, mimeType, webViewLink, webContentLink, size',
  });

  return res.data;
}

export async function listFiles(
  authClient: any,
  query?: string,
  folderId?: string
): Promise<drive_v3.Schema$File[]> {
  const drive = google.drive({ version: 'v3', auth: authClient });

  let q = "trashed = false";
  if (folderId) q += ` and '${folderId}' in parents`;
  if (query) q += ` and name contains '${query}'`;

  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)',
      pageSize: 100,
      pageToken,
    });

    files.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function downloadFile(
  authClient: any,
  fileId: string
): Promise<Buffer> {
  const drive = google.drive({ version: 'v3', auth: authClient });

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(res.data as ArrayBuffer);
}
```

### Gmail Integration

```typescript
// lib/google/gmail.ts
import { google } from 'googleapis';

export async function sendEmail(
  authClient: any,
  to: string,
  subject: string,
  htmlBody: string,
  from?: string
) {
  const gmail = google.gmail({ version: 'v1', auth: authClient });

  const message = [
    `To: ${to}`,
    from ? `From: ${from}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].filter(Boolean).join('\r\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}
```

### Google Sheets Integration

```typescript
// lib/google/sheets.ts
import { google } from 'googleapis';

export async function readSheet(
  authClient: any,
  spreadsheetId: string,
  range: string // e.g., 'Sheet1!A1:D100'
): Promise<string[][]> {
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return res.data.values ?? [];
}

export async function appendToSheet(
  authClient: any,
  spreadsheetId: string,
  range: string,
  rows: string[][]
) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}
```

### Rate Limiting & Quota Management

```typescript
// lib/google/rate-limiter.ts
class GoogleQuotaManager {
  private requestCounts = new Map<string, { count: number; resetAt: number }>();

  // Google default: 10 requests/second per user for most APIs
  private readonly RATE_LIMIT = 10;
  private readonly WINDOW_MS = 1000;

  async throttle(userId: string): Promise<void> {
    const key = userId;
    const now = Date.now();
    const entry = this.requestCounts.get(key);

    if (!entry || now > entry.resetAt) {
      this.requestCounts.set(key, { count: 1, resetAt: now + this.WINDOW_MS });
      return;
    }

    if (entry.count >= this.RATE_LIMIT) {
      const waitMs = entry.resetAt - now;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.requestCounts.set(key, { count: 1, resetAt: Date.now() + this.WINDOW_MS });
      return;
    }

    entry.count++;
  }
}

// Retry with exponential backoff for 429 and 5xx
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.response?.status ?? error?.code;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (!isRetryable || attempt === maxAttempts - 1) throw error;

      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
```

### Push Notification Webhook Handler

```typescript
// app/api/webhooks/google/route.ts
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id');
  const resourceState = req.headers.get('x-goog-resource-state');
  const resourceId = req.headers.get('x-goog-resource-id');

  // 'sync' = initial verification, 'exists' = change, 'not_exists' = deleted
  if (resourceState === 'sync') {
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // Look up which user/calendar this channel belongs to
  const { data: watch } = await supabase
    .from('google_watches')
    .select('user_id, calendar_id')
    .eq('channel_id', channelId)
    .single();

  if (!watch) {
    return NextResponse.json({ status: 'unknown_channel' }, { status: 200 });
  }

  // Queue a sync job for this user's calendar
  await queueCalendarSync(watch.user_id, watch.calendar_id);

  return NextResponse.json({ status: 'accepted' }, { status: 200 });
}
```

### Environment Variables Required

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://yourapp.com/api/auth/google/callback
```

## Code Templates

- **`google-calendar-sync.ts`** — full calendar sync with event CRUD, push notifications, and incremental sync using syncToken
- **`google-drive-upload.ts`** — file upload/download with resumable uploads for large files, folder management, and permission sharing

## Checklist

- [ ] OAuth 2.0 configured with minimal scopes and incremental authorization
- [ ] Refresh tokens encrypted at rest in database
- [ ] Token auto-refresh implemented with race condition protection
- [ ] All API calls use pagination (no unbounded fetches)
- [ ] Rate limiting and quota tracking in place
- [ ] Exponential backoff for 429 and 5xx errors
- [ ] Push notifications configured for real-time sync (Calendar/Drive)
- [ ] Push notification channels renewed before expiration (max 7 days)
- [ ] Webhook handler validates `x-goog-channel-id` against stored channels
- [ ] User revocation handled (detect invalid_grant, prompt re-auth)
- [ ] Google Cloud Console project properly configured (consent screen, scopes, redirect URIs)
- [ ] Error messages are user-friendly (not raw Google API errors)

## Common Pitfalls

1. **Missing refresh token** — Google only returns a refresh token on the first consent. If you lose it, you must prompt with `prompt: 'consent'` to get a new one. Always store it immediately.
2. **Scope creep** — Requesting too many scopes triggers Google's app verification process, which can take weeks. Use `drive.file` instead of `drive` (full access) when possible.
3. **Watch expiration** — Google push notification channels expire (max 7 days for Calendar). You need a cron job to renew them before expiry.
4. **Sync tokens invalidate** — If you use `syncToken` for incremental sync and it becomes invalid (410 Gone), you must do a full sync and get a new token.
5. **Time zone handling** — Calendar events can be all-day (date only) or timed (dateTime). Your code must handle both formats correctly.
6. **Service account confusion** — Service accounts access their own data, not user data. For user data you need OAuth 2.0 with user consent (or domain-wide delegation for Google Workspace admins).
7. **Quota exhaustion** — Default Calendar API quota is 1,000,000 queries/day but only 10 queries/second/user. Batch operations and caching are essential at scale.
