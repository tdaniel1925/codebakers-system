---
name: Slack Integration Specialist
tier: integrations
triggers: slack, slack bot, slack api, slash command, block kit, slack webhook, slack app, slack interactive, slack notifications, slack oauth, bolt
depends_on: backend.md, auth.md, webhooks.md
conflicts_with: null
prerequisites: Slack App configured at api.slack.com/apps
description: Slack integration — bots, slash commands, Block Kit interactive messages, incoming/outgoing webhooks, OAuth for workspace installs, event subscriptions, and modals
code_templates: slack-bot-handler.ts
design_tokens: null
---

# Slack Integration Specialist

## Role

Implements production-grade Slack integrations including bots, slash commands, interactive messages with Block Kit, event subscriptions, and OAuth-based workspace installation. Handles the Slack-specific patterns of request verification, 3-second response deadlines, interactive payloads, modal workflows, and the nuances of building apps that work across multiple workspaces. Ensures every Slack integration feels native, responsive, and reliable.

## When to Use

- Building a Slack bot that responds to messages or mentions
- Implementing slash commands (e.g., `/invoice create`)
- Sending rich notifications to Slack channels with Block Kit
- Building interactive workflows with buttons, menus, and modals
- Distributing a Slack app across multiple workspaces (OAuth install flow)
- Integrating your app's events with Slack (e.g., new deal → Slack notification)
- Receiving Slack events (message posted, channel created, user joined)
- Building approval workflows with interactive Slack messages

## Also Consider

- **microsoft-365.md** — when supporting both Slack and Teams
- **webhooks.md** — Slack events and interactions are webhook-based
- **notifications.md** — when Slack is one channel in a multi-channel notification system
- **chatbot.md** — when building conversational AI within Slack
- **zapier-make.md** — when providing Slack integration via automation platforms instead of native

## Anti-Patterns (NEVER Do)

1. **Never skip request verification.** Every inbound request from Slack must be verified using the signing secret. Unverified endpoints are a security vulnerability.
2. **Never respond after 3 seconds.** Slack requires an acknowledgment within 3 seconds for slash commands and interactions. Do heavy work asynchronously and use `response_url` to update later.
3. **Never hardcode webhook URLs.** Incoming webhook URLs are workspace-specific. Store them per-installation in your database.
4. **Never use plain text when Block Kit is available.** Block Kit provides rich, interactive, well-formatted messages. Plain text looks unprofessional.
5. **Never store bot tokens without encryption.** Slack bot tokens (`xoxb-`) grant persistent access to workspaces. Encrypt at rest.
6. **Never ignore rate limits.** Slack rate limits are per-method and per-workspace. Respect `Retry-After` headers or face temporary bans.
7. **Never send walls of text.** Slack messages have a 40,000 character limit but users stop reading after ~500 characters. Use attachments, threads, or links for long content.
8. **Never use legacy APIs.** Slack has deprecated many older endpoints. Use the current Web API, Events API, and Block Kit — not legacy slash commands or outgoing webhooks.

## Standards & Patterns

### Slack App Setup

```
api.slack.com/apps → Create New App → From Scratch
├── App Credentials
│   ├── Client ID + Client Secret (for OAuth)
│   └── Signing Secret (for request verification)
├── OAuth & Permissions
│   ├── Redirect URL: https://yourapp.com/api/auth/slack/callback
│   ├── Bot Token Scopes:
│   │   ├── chat:write (send messages)
│   │   ├── commands (slash commands)
│   │   ├── channels:read (list channels)
│   │   ├── users:read (user info)
│   │   └── app_mentions:read (respond to @mentions)
│   └── User Token Scopes: (only if needed)
├── Event Subscriptions
│   ├── Request URL: https://yourapp.com/api/webhooks/slack/events
│   └── Subscribe to: app_mention, message.channels, etc.
├── Interactivity & Shortcuts
│   ├── Request URL: https://yourapp.com/api/webhooks/slack/interactive
│   └── Options Load URL: (for dynamic select menus)
└── Slash Commands
    └── /yourcommand → https://yourapp.com/api/webhooks/slack/commands
```

### Request Verification

```typescript
// lib/slack/verify.ts
import crypto from 'crypto';

export function verifySlackRequest(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Reject requests older than 5 minutes (replay protection)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

// Middleware helper
export async function verifyAndParseSlack(req: NextRequest): Promise<{ verified: boolean; body: string }> {
  const body = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';

  const verified = verifySlackRequest(
    process.env.SLACK_SIGNING_SECRET!,
    signature,
    timestamp,
    body
  );

  return { verified, body };
}
```

### OAuth Installation Flow

```typescript
// lib/slack/auth.ts
import { WebClient } from '@slack/web-api';

export function getInstallUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    scope: 'chat:write,commands,channels:read,users:read,app_mentions:read',
    redirect_uri: process.env.SLACK_REDIRECT_URI!,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

// OAuth callback handler
// GET /api/auth/slack/callback
export async function handleOAuthCallback(code: string) {
  const client = new WebClient();

  const result = await client.oauth.v2.access({
    client_id: process.env.SLACK_CLIENT_ID!,
    client_secret: process.env.SLACK_CLIENT_SECRET!,
    code,
    redirect_uri: process.env.SLACK_REDIRECT_URI!,
  });

  // Store installation data
  await storeSlackInstallation({
    team_id: result.team?.id!,
    team_name: result.team?.name!,
    bot_token: encrypt(result.access_token!),    // xoxb-... token
    bot_user_id: result.bot_user_id!,
    installing_user_id: result.authed_user?.id!,
    scope: result.scope!,
  });

  return result;
}
```

### Installation Storage Schema

```sql
CREATE TABLE slack_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  team_id TEXT NOT NULL UNIQUE,       -- Slack workspace ID
  team_name TEXT NOT NULL,
  bot_token TEXT NOT NULL,            -- Encrypted xoxb-... token
  bot_user_id TEXT NOT NULL,
  installing_user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_channel_id TEXT,            -- Default channel for notifications
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE slack_installations ENABLE ROW LEVEL SECURITY;
```

### Slash Command Handler

```typescript
// app/api/webhooks/slack/commands/route.ts

export async function POST(req: NextRequest) {
  const { verified, body } = await verifyAndParseSlack(req);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(body);
  const command = params.get('command');       // e.g., '/invoice'
  const text = params.get('text') ?? '';       // e.g., 'create Acme Corp $5000'
  const userId = params.get('user_id')!;
  const channelId = params.get('channel_id')!;
  const responseUrl = params.get('response_url')!;
  const triggerId = params.get('trigger_id')!;
  const teamId = params.get('team_id')!;

  // MUST respond within 3 seconds — acknowledge immediately
  // Then use response_url for the actual result

  // For simple responses, return directly:
  if (text === 'help') {
    return NextResponse.json({
      response_type: 'ephemeral', // Only visible to the user
      text: 'Available commands: `/invoice create`, `/invoice list`, `/invoice status <id>`',
    });
  }

  // For complex work, acknowledge and process async:
  processCommandAsync(command!, text, userId, channelId, responseUrl, triggerId, teamId);

  return NextResponse.json({
    response_type: 'ephemeral',
    text: '⏳ Processing your request...',
  });
}

async function processCommandAsync(
  command: string,
  text: string,
  userId: string,
  channelId: string,
  responseUrl: string,
  triggerId: string,
  teamId: string
) {
  try {
    const result = await handleCommand(command, text, userId, teamId);

    // Send result via response_url
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel', // Visible to everyone
        replace_original: true,
        blocks: result.blocks,
      }),
    });
  } catch (error) {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: true,
        text: `❌ Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
      }),
    });
  }
}
```

### Event Subscription Handler

```typescript
// app/api/webhooks/slack/events/route.ts

export async function POST(req: NextRequest) {
  const { verified, body } = await verifyAndParseSlack(req);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // URL verification challenge (one-time during event subscription setup)
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Event callback
  if (payload.type === 'event_callback') {
    const event = payload.event;
    const teamId = payload.team_id;

    // Ignore bot's own messages (prevent loops)
    if (event.bot_id) {
      return NextResponse.json({ status: 'ok' });
    }

    // Route by event type
    switch (event.type) {
      case 'app_mention':
        await handleAppMention(teamId, event);
        break;
      case 'message':
        if (event.channel_type === 'im') {
          await handleDirectMessage(teamId, event);
        }
        break;
    }
  }

  return NextResponse.json({ status: 'ok' });
}
```

### Interactive Message Handler

```typescript
// app/api/webhooks/slack/interactive/route.ts

export async function POST(req: NextRequest) {
  const { verified, body } = await verifyAndParseSlack(req);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Interactive payloads come as form-encoded with a `payload` field
  const params = new URLSearchParams(body);
  const payload = JSON.parse(params.get('payload')!);

  switch (payload.type) {
    case 'block_actions': {
      const action = payload.actions[0];
      const userId = payload.user.id;
      const responseUrl = payload.response_url;

      // Handle button clicks, menu selections, etc.
      await handleBlockAction(action, userId, responseUrl, payload);
      break;
    }

    case 'view_submission': {
      // Modal form submitted
      const values = payload.view.state.values;
      const userId = payload.user.id;
      const privateMetadata = JSON.parse(payload.view.private_metadata || '{}');

      await handleModalSubmission(values, userId, privateMetadata);

      // Return empty 200 to close the modal
      // Or return errors to keep the modal open:
      // return NextResponse.json({ response_action: 'errors', errors: { block_id: 'Error message' } });
      break;
    }

    case 'shortcut':
    case 'message_action': {
      // Global or message shortcuts
      const triggerId = payload.trigger_id;
      await openModal(triggerId, payload);
      break;
    }
  }

  return new NextResponse('', { status: 200 });
}
```

### Block Kit Message Builder

```typescript
// lib/slack/blocks.ts

export function buildInvoiceNotification(invoice: {
  id: string;
  customer: string;
  amount: number;
  status: string;
  dueDate: string;
}) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📄 Invoice #${invoice.id}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Customer:*\n${invoice.customer}` },
        { type: 'mrkdwn', text: `*Amount:*\n$${invoice.amount.toLocaleString()}` },
        { type: 'mrkdwn', text: `*Status:*\n${invoice.status}` },
        { type: 'mrkdwn', text: `*Due Date:*\n${invoice.dueDate}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve' },
          style: 'primary',
          action_id: 'approve_invoice',
          value: invoice.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Reject' },
          style: 'danger',
          action_id: 'reject_invoice',
          value: invoice.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '👁️ View Details' },
          action_id: 'view_invoice',
          url: `https://yourapp.com/invoices/${invoice.id}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Sent via YourApp • <https://yourapp.com/invoices/${invoice.id}|View in app>` },
      ],
    },
  ];
}

// Modal builder
export function buildCreateInvoiceModal(triggerId: string, client: WebClient) {
  return client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'create_invoice_modal',
      title: { type: 'plain_text', text: 'Create Invoice' },
      submit: { type: 'plain_text', text: 'Create' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ source: 'slash_command' }),
      blocks: [
        {
          type: 'input',
          block_id: 'customer_block',
          label: { type: 'plain_text', text: 'Customer' },
          element: {
            type: 'plain_text_input',
            action_id: 'customer_input',
            placeholder: { type: 'plain_text', text: 'Enter customer name' },
          },
        },
        {
          type: 'input',
          block_id: 'amount_block',
          label: { type: 'plain_text', text: 'Amount ($)' },
          element: {
            type: 'plain_text_input',
            action_id: 'amount_input',
            placeholder: { type: 'plain_text', text: '0.00' },
          },
        },
        {
          type: 'input',
          block_id: 'due_date_block',
          label: { type: 'plain_text', text: 'Due Date' },
          element: {
            type: 'datepicker',
            action_id: 'due_date_input',
          },
        },
      ],
    },
  });
}
```

### Sending Messages to Channels

```typescript
// lib/slack/messaging.ts
import { WebClient } from '@slack/web-api';

export async function sendChannelMessage(
  teamId: string,
  channelId: string,
  blocks: any[],
  text: string // Fallback text for notifications
) {
  const installation = await getSlackInstallation(teamId);
  const client = new WebClient(decrypt(installation.bot_token));

  return client.chat.postMessage({
    channel: channelId,
    blocks,
    text, // Shows in push notifications and accessibility readers
  });
}

// Send to thread
export async function sendThreadReply(
  teamId: string,
  channelId: string,
  threadTs: string,
  text: string
) {
  const installation = await getSlackInstallation(teamId);
  const client = new WebClient(decrypt(installation.bot_token));

  return client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}

// Update existing message
export async function updateMessage(
  teamId: string,
  channelId: string,
  messageTs: string,
  blocks: any[],
  text: string
) {
  const installation = await getSlackInstallation(teamId);
  const client = new WebClient(decrypt(installation.bot_token));

  return client.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks,
    text,
  });
}

// Send ephemeral message (only visible to one user)
export async function sendEphemeral(
  teamId: string,
  channelId: string,
  userId: string,
  text: string
) {
  const installation = await getSlackInstallation(teamId);
  const client = new WebClient(decrypt(installation.bot_token));

  return client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    text,
  });
}
```

### Incoming Webhook (Simple Notifications)

```typescript
// For simple one-way notifications without a full bot
// Set up via Slack App → Incoming Webhooks

export async function sendIncomingWebhook(
  webhookUrl: string,
  message: { text: string; blocks?: any[] }
) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}
```

### Rate Limiting

```typescript
// Slack rate limits by method tier:
// Tier 1: 1 req/min (rare admin methods)
// Tier 2: 20 req/min (most read methods)
// Tier 3: 50 req/min (most write methods)
// Tier 4: 100 req/min (some methods like chat.postMessage — but with burst limits)
// Special: chat.postMessage has a 1 msg/sec/channel limit

// Handle 429 responses
export async function withSlackRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (error?.data?.error === 'ratelimited') {
      const retryAfter = parseInt(error.data.headers?.['retry-after'] ?? '5', 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return fn();
    }
    throw error;
  }
}
```

### Environment Variables

```env
SLACK_CLIENT_ID=your-app-client-id
SLACK_CLIENT_SECRET=your-app-client-secret
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_REDIRECT_URI=https://yourapp.com/api/auth/slack/callback
```

## Code Templates

- **`slack-bot-handler.ts`** — complete Slack bot with command routing, event handling, interactive messages, modal workflows, and multi-workspace support

## Checklist

- [ ] Slack App configured with correct scopes, event subscriptions, and interactivity URL
- [ ] Request signature verification on ALL inbound Slack requests
- [ ] Slash commands and interactions respond within 3 seconds (async processing via response_url)
- [ ] Bot tokens encrypted at rest per workspace installation
- [ ] OAuth install flow implemented for multi-workspace distribution
- [ ] Block Kit used for rich message formatting (not plain text)
- [ ] Fallback `text` provided on every message for notifications/accessibility
- [ ] Bot ignores its own messages (no infinite loops)
- [ ] URL verification challenge handled for event subscription setup
- [ ] Rate limits respected with Retry-After handling
- [ ] Interactive payload routing handles block_actions, view_submission, and shortcuts
- [ ] Error messages sent as ephemeral (not broadcast to channel)
- [ ] Modal private_metadata used to pass context through form submissions

## Common Pitfalls

1. **3-second timeout** — The #1 cause of slash command failures. If your database query takes 4 seconds, the command fails silently. Always acknowledge immediately and use `response_url` for async responses.
2. **Event retries** — Slack retries event deliveries if you don't return 200 within 3 seconds. This can cause duplicate processing. Track event IDs and deduplicate.
3. **Token per workspace** — Each Slack workspace that installs your app gets its own bot token. You must store and retrieve the correct token per team_id.
4. **Block Kit limits** — Max 50 blocks per message, 10 elements per action block, 100 options per static select. Plan your UI within these constraints.
5. **Channel membership** — Your bot must be a member of a channel to post in it (unless using `chat.postMessage` which auto-joins public channels). For private channels, the bot must be explicitly invited.
6. **Unfurl links** — If your app has a domain, Slack will try to unfurl links to your domain. Configure Link Unfurling in your app settings or users will see broken previews.
7. **Modal state extraction** — Modal form values are deeply nested under `view.state.values[block_id][action_id].value`. The path is easy to get wrong — always log the full payload during development.
