---
name: SMS & WhatsApp Specialist
tier: integrations
triggers: sms, twilio, whatsapp, text message, mms, messaging, two-way sms, opt-in, opt-out, message templates, twilio conversations, whatsapp business, a2p messaging, 10dlc
depends_on: backend.md, webhooks.md
conflicts_with: null
prerequisites: Twilio account with phone number(s) provisioned
description: Twilio SMS/MMS and WhatsApp Business integration — transactional & marketing messages, two-way conversations, opt-in/out compliance, message templates, media handling, status callbacks, and A2P/10DLC registration
code_templates: twilio-sms-handler.ts, twilio-whatsapp.ts
design_tokens: null
---

# SMS & WhatsApp Specialist

## Role

Implements production-grade SMS, MMS, and WhatsApp messaging via the Twilio API. Handles transactional notifications, two-way conversations, marketing campaigns, opt-in/out compliance, message template management, media messages, delivery status tracking, and the regulatory requirements (A2P 10DLC, WhatsApp Business API approval) that are critical for production messaging at scale.

## When to Use

- Sending transactional SMS (verification codes, order confirmations, appointment reminders)
- Sending WhatsApp messages (notifications, customer support, marketing)
- Building two-way SMS/WhatsApp conversation flows
- Implementing opt-in/out and TCPA/messaging compliance
- Sending MMS with images, PDFs, or documents
- Tracking delivery status via Twilio status callbacks
- Setting up A2P 10DLC registration for US messaging
- Building WhatsApp Business message templates for approval

## Also Consider

- **notifications.md** — when SMS is one channel in a multi-channel notification system
- **webhooks.md** — Twilio uses webhooks for inbound messages and status callbacks
- **voice-ai.md** — when combining SMS with VAPI voice calls
- **chatbot.md** — when building conversational AI over SMS/WhatsApp
- **workflow-automation.md** — when messages trigger or result from automation chains
- **email.md** — when choosing between email and SMS for notifications

## Anti-Patterns (NEVER Do)

1. **Never send SMS without explicit opt-in.** TCPA violations carry $500-$1,500 per unsolicited message. Always require opt-in and honor opt-out immediately.
2. **Never hardcode phone numbers.** Use environment variables or database config for Twilio phone numbers and messaging service SIDs.
3. **Never ignore delivery status.** Always configure status callback URLs. Silent delivery failures are invisible without them.
4. **Never send WhatsApp messages outside the 24-hour window without a template.** WhatsApp Business API requires pre-approved templates for messages sent outside an active conversation window.
5. **Never store Twilio credentials in frontend code.** Auth tokens must stay server-side. Use Twilio's signed webhooks to verify inbound requests.
6. **Never send marketing messages from a transactional number.** Use separate Twilio Messaging Services for transactional vs marketing to protect deliverability.
7. **Never skip A2P 10DLC registration for US numbers.** Unregistered traffic faces heavy filtering and potential blocking by carriers.
8. **Never send long messages without checking segment count.** SMS segments are 160 chars (GSM-7) or 70 chars (Unicode). Multi-segment messages cost more.

## Standards & Patterns

### Twilio Client Setup

```typescript
// lib/twilio/client.ts
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export { twilioClient };

// Messaging Service SIDs (recommended over raw phone numbers)
export const MESSAGING_SERVICES = {
  transactional: process.env.TWILIO_MESSAGING_SERVICE_TRANSACTIONAL!,
  marketing: process.env.TWILIO_MESSAGING_SERVICE_MARKETING!,
};
```

### Sending SMS

```typescript
// lib/twilio/sms.ts
import { twilioClient, MESSAGING_SERVICES } from './client';

interface SendSmsOptions {
  to: string;
  body: string;
  type: 'transactional' | 'marketing';
  mediaUrls?: string[];   // For MMS
  statusCallback?: string;
}

export async function sendSms(options: SendSmsOptions) {
  // Validate phone number format
  if (!isValidE164(options.to)) {
    throw new Error(`Invalid phone number format: ${options.to}. Must be E.164 (e.g., +15551234567)`);
  }

  // Check opt-out status
  const isOptedOut = await checkOptOut(options.to, options.type);
  if (isOptedOut) {
    console.warn(`Skipping message to ${options.to}: opted out of ${options.type}`);
    return { status: 'skipped', reason: 'opted_out' };
  }

  const message = await twilioClient.messages.create({
    to: options.to,
    messagingServiceSid: MESSAGING_SERVICES[options.type],
    body: options.body,
    mediaUrl: options.mediaUrls,
    statusCallback: options.statusCallback ?? `${process.env.APP_URL}/api/webhooks/twilio/status`,
  });

  // Log message
  await logMessage({
    twilio_sid: message.sid,
    to: options.to,
    body: options.body,
    type: options.type,
    direction: 'outbound',
    status: message.status,
    segments: message.numSegments ? parseInt(message.numSegments) : 1,
  });

  return { status: 'sent', sid: message.sid };
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}
```

### WhatsApp Messages

```typescript
// lib/twilio/whatsapp.ts
import { twilioClient } from './client';

// Freeform message (only within 24hr conversation window)
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  mediaUrls?: string[]
) {
  return twilioClient.messages.create({
    to: `whatsapp:${to}`,
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    body,
    mediaUrl: mediaUrls,
    statusCallback: `${process.env.APP_URL}/api/webhooks/twilio/status`,
  });
}

// Template message (required outside 24hr window)
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,   // Pre-approved Twilio Content Template SID
  contentVariables?: Record<string, string>
) {
  return twilioClient.messages.create({
    to: `whatsapp:${to}`,
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    contentSid,
    contentVariables: contentVariables
      ? JSON.stringify(contentVariables)
      : undefined,
    statusCallback: `${process.env.APP_URL}/api/webhooks/twilio/status`,
  });
}

// WhatsApp Content Templates (created via Twilio Console or API)
// Examples:
// - Appointment reminder: "Hi {{1}}, your appointment is on {{2}} at {{3}}."
// - Order update: "Your order #{{1}} has been {{2}}."
// - Verification: "Your verification code is {{1}}."
```

### Inbound Message Handler

```typescript
// app/api/webhooks/twilio/inbound/route.ts
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);

  // Verify Twilio signature
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = `${process.env.APP_URL}/api/webhooks/twilio/inbound`;

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    Object.fromEntries(params)
  );

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const from = params.get('From')!;          // e.g., +15551234567 or whatsapp:+15551234567
  const to = params.get('To')!;
  const messageBody = params.get('Body') ?? '';
  const numMedia = parseInt(params.get('NumMedia') ?? '0');
  const isWhatsApp = from.startsWith('whatsapp:');

  // Extract clean phone number
  const cleanFrom = from.replace('whatsapp:', '');

  // Handle opt-out keywords (STOP, UNSUBSCRIBE, CANCEL, END, QUIT)
  const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'end', 'quit'];
  if (optOutKeywords.includes(messageBody.trim().toLowerCase())) {
    await handleOptOut(cleanFrom);
    // Twilio auto-replies for standard opt-out keywords
    return new NextResponse('', { status: 200 });
  }

  // Handle opt-in keywords (START, YES, UNSTOP)
  const optInKeywords = ['start', 'yes', 'unstop'];
  if (optInKeywords.includes(messageBody.trim().toLowerCase())) {
    await handleOptIn(cleanFrom);
    return new NextResponse('', { status: 200 });
  }

  // Extract media URLs if present
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params.get(`MediaUrl${i}`);
    if (mediaUrl) mediaUrls.push(mediaUrl);
  }

  // Log and process inbound message
  await processInboundMessage({
    from: cleanFrom,
    to,
    body: messageBody,
    mediaUrls,
    isWhatsApp,
    twilioSid: params.get('MessageSid')!,
  });

  // Return TwiML response (optional auto-reply)
  // Return empty 200 for no reply
  return new NextResponse('', { status: 200 });
}
```

### Status Callback Handler

```typescript
// app/api/webhooks/twilio/status/route.ts

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);

  // Verify signature (same pattern as inbound)
  // ... signature verification ...

  const messageSid = params.get('MessageSid')!;
  const status = params.get('MessageStatus')!;
  // Statuses: queued → sending → sent → delivered → read (WhatsApp only)
  // Error statuses: failed, undelivered

  const errorCode = params.get('ErrorCode');
  const errorMessage = params.get('ErrorMessage');

  await updateMessageStatus({
    twilio_sid: messageSid,
    status,
    error_code: errorCode,
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  });

  // Alert on failures
  if (status === 'failed' || status === 'undelivered') {
    await handleDeliveryFailure(messageSid, errorCode, errorMessage);
  }

  return new NextResponse('', { status: 200 });
}
```

### Message Log Schema

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_sid TEXT UNIQUE,
  org_id UUID REFERENCES organizations(id),
  contact_id UUID REFERENCES contacts(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'mms', 'whatsapp')),
  message_type TEXT NOT NULL DEFAULT 'transactional' CHECK (message_type IN ('transactional', 'marketing')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  media_urls TEXT[],
  status TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT,
  error_message TEXT,
  segments INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_contact ON messages(contact_id, created_at DESC);
CREATE INDEX idx_messages_status ON messages(status) WHERE status IN ('queued', 'sending', 'failed');
```

### Opt-In/Out Compliance Schema

```sql
CREATE TABLE messaging_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('transactional', 'marketing')),
  status TEXT NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
  opted_in_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  opt_in_method TEXT,          -- 'web_form', 'keyword', 'verbal', 'import'
  opt_in_source TEXT,          -- e.g., 'checkout_page', 'sms_keyword_JOIN'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(phone_number, consent_type)
);

-- Quick lookup for send-time checks
CREATE INDEX idx_consent_lookup ON messaging_consent(phone_number, consent_type, status);
```

### Compliance Functions

```typescript
// lib/twilio/compliance.ts

export async function checkOptOut(phone: string, type: 'transactional' | 'marketing'): Promise<boolean> {
  const { data } = await supabase
    .from('messaging_consent')
    .select('status')
    .eq('phone_number', phone)
    .eq('consent_type', type)
    .single();

  // If no record exists: transactional = allowed (implicit), marketing = blocked (explicit required)
  if (!data) return type === 'marketing';

  return data.status === 'opted_out';
}

export async function handleOptOut(phone: string) {
  // Opt out of ALL message types
  await supabase
    .from('messaging_consent')
    .upsert([
      { phone_number: phone, consent_type: 'transactional', status: 'opted_out', opted_out_at: new Date().toISOString() },
      { phone_number: phone, consent_type: 'marketing', status: 'opted_out', opted_out_at: new Date().toISOString() },
    ], { onConflict: 'phone_number,consent_type' });
}

export async function handleOptIn(phone: string) {
  await supabase
    .from('messaging_consent')
    .upsert([
      { phone_number: phone, consent_type: 'transactional', status: 'opted_in', opted_in_at: new Date().toISOString() },
      { phone_number: phone, consent_type: 'marketing', status: 'opted_in', opted_in_at: new Date().toISOString() },
    ], { onConflict: 'phone_number,consent_type' });
}

export async function recordOptIn(
  phone: string,
  type: 'transactional' | 'marketing',
  method: string,
  source: string
) {
  await supabase
    .from('messaging_consent')
    .upsert({
      phone_number: phone,
      consent_type: type,
      status: 'opted_in',
      opted_in_at: new Date().toISOString(),
      opt_in_method: method,
      opt_in_source: source,
    }, { onConflict: 'phone_number,consent_type' });
}
```

### SMS Segment Calculator

```typescript
export function calculateSegments(body: string): { segments: number; encoding: 'GSM-7' | 'UCS-2' } {
  // GSM-7 charset (basic Latin, digits, common symbols)
  const gsm7Regex = /^[\x20-\x7E\n\r]+$/;
  const isGsm7 = gsm7Regex.test(body);

  if (isGsm7) {
    // GSM-7: 160 chars for 1 segment, 153 per segment for multi-segment
    const segments = body.length <= 160 ? 1 : Math.ceil(body.length / 153);
    return { segments, encoding: 'GSM-7' };
  } else {
    // UCS-2 (Unicode): 70 chars for 1 segment, 67 per segment for multi-segment
    const segments = body.length <= 70 ? 1 : Math.ceil(body.length / 67);
    return { segments, encoding: 'UCS-2' };
  }
}
```

### A2P 10DLC Registration Checklist

For US messaging compliance:
1. **Brand Registration** — Register your company with The Campaign Registry (TCR) via Twilio Console
2. **Campaign Registration** — Register each messaging use case (transactional, marketing, etc.)
3. **Number Assignment** — Assign phone numbers to campaigns
4. **Content Review** — Ensure message content matches registered use case
5. **Throughput** — Registered campaigns get higher throughput (depends on trust score)

### WhatsApp Business API Setup

1. Create a Meta Business account
2. Connect via Twilio Console → Messaging → WhatsApp Senders
3. Verify business and phone number
4. Create Content Templates in Twilio Console
5. Submit templates for Meta approval (24-48 hours)
6. Configure webhook URLs for inbound and status callbacks

### Environment Variables

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_MESSAGING_SERVICE_TRANSACTIONAL=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MESSAGING_SERVICE_MARKETING=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+15551234567
APP_URL=https://yourapp.com
```

## Code Templates

- **`twilio-sms-handler.ts`** — complete SMS send/receive with opt-in/out compliance, status tracking, and segment calculation
- **`twilio-whatsapp.ts`** — WhatsApp integration with template messages, media handling, 24hr window management, and conversation tracking

## Checklist

- [ ] Twilio credentials stored in environment variables (never in code)
- [ ] Messaging Services configured (separate for transactional vs marketing)
- [ ] Inbound webhook handler verifies Twilio request signatures
- [ ] Opt-out keywords handled (STOP, UNSUBSCRIBE, CANCEL, END, QUIT)
- [ ] Opt-in recorded with method and source for compliance records
- [ ] Consent checked before every outbound message
- [ ] Status callbacks configured and delivery failures monitored
- [ ] Message log captures all inbound and outbound messages
- [ ] Phone numbers validated as E.164 before sending
- [ ] A2P 10DLC registration completed for US numbers
- [ ] WhatsApp templates created and approved for out-of-window messages
- [ ] SMS segment count considered for cost optimization
- [ ] Media URLs validated and size-checked for MMS/WhatsApp

## Common Pitfalls

1. **10DLC registration delays** — Brand and campaign registration can take days to weeks. Start early. Unregistered US traffic faces heavy carrier filtering.
2. **WhatsApp 24-hour window** — You can only send freeform messages within 24 hours of the user's last message. After that, you must use an approved template or the message will fail.
3. **Twilio signature verification URL** — The URL used for verification must exactly match the webhook URL configured in Twilio, including protocol and trailing slashes. Mismatches cause verification failures.
4. **International formatting** — Always use E.164 format (+1 for US, +44 for UK, etc.). Local formats will fail.
5. **Unicode in SMS** — A single emoji or non-Latin character switches the entire message to UCS-2 encoding, cutting capacity from 160 to 70 characters per segment. Costs can multiply unexpectedly.
6. **WhatsApp media limits** — Images max 5MB, documents max 100MB, but video max 16MB. Audio max 16MB. Always validate before sending.
7. **Twilio phone number capabilities** — Not all Twilio numbers support MMS or WhatsApp. Verify capabilities when provisioning numbers.
