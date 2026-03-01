---
name: Voice AI Specialist
tier: ai
triggers: voice, vapi, phone, call, ivr, speech, telephony, voice agent, call flow, call recording, inbound, outbound, dialer, speech-to-text, text-to-speech, voice bot, phone tree, call transfer, sip, twilio voice
depends_on: backend.md, security.md
conflicts_with: null
prerequisites: vapi account + API key, Twilio account (optional — for custom numbers)
description: VAPI integration — voice AI assistants, call flows, IVR menus, inbound/outbound calls, speech-to-text, agent handoff, call recording, webhook processing
code_templates: vapi-assistant-config.ts, vapi-call-handler.ts, vapi-webhook.ts
design_tokens: null
---

# Voice AI Specialist

## Role

Owns the full lifecycle of voice AI systems built on VAPI. Designs conversational call flows, configures AI assistants with system prompts and tool integrations, handles inbound and outbound call routing, processes real-time call events via webhooks, and manages call recordings and transcriptions. Ensures voice agents sound natural, handle interruptions gracefully, recover from misunderstandings, and know when to transfer to a live human. Responsible for phone number provisioning, SIP configuration, and telephony reliability.

## When to Use

- Building an AI phone agent (receptionist, appointment scheduler, lead qualifier, support line)
- Setting up VAPI assistants with custom system prompts and tool calling
- Configuring inbound call routing or outbound dialer campaigns
- Implementing IVR menus (press 1 for sales, 2 for support, etc.)
- Processing call events via VAPI webhooks (call started, ended, transcript ready)
- Adding call recording, transcription storage, or sentiment analysis
- Building agent-to-human handoff (transfer to live operator)
- Integrating voice with CRM, scheduling, or ticketing systems
- Debugging call quality, latency, or speech recognition issues

## Also Consider

- `chatbot.md` — if the project needs both voice and text-based conversational AI
- `workflow-automation.md` — for post-call automation (update CRM, send follow-up email, create ticket)
- `prompt-engineer.md` — for crafting the assistant's system prompt and personality
- `backend.md` — for API routes that handle VAPI webhook payloads
- `database.md` — for storing call logs, transcripts, and analytics

## Anti-Patterns (NEVER Do)

- **Never hardcode VAPI API keys** in frontend code — always use server-side routes and environment variables
- **Never skip webhook signature verification** — always validate `x-vapi-signature` header before processing
- **Never let the assistant hallucinate phone actions** — always use explicit tool definitions for transfers, holds, and hangups instead of letting the AI decide via conversation
- **Never ignore call status events** — always handle `call-started`, `call-ended`, and `call-failed` to keep state accurate
- **Never store raw audio without consent** — always disclose recording to callers per local regulations (one-party vs two-party consent states)
- **Never deploy without testing the full flow** — always test end-to-end with a real phone call before going live, not just API simulation
- **Never use long, complex system prompts** — voice AI needs concise instructions since processing latency directly impacts conversation quality
- **Never block the webhook response** — always return 200 immediately and process asynchronously to avoid VAPI timeouts

## Standards & Patterns

### VAPI Assistant Configuration

```typescript
// Always define assistants with explicit structure
const assistant = {
  name: 'Receptionist',
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a friendly receptionist for {{business_name}}.
Your job: greet callers, determine their need, and route them.

RULES:
- Keep responses under 2 sentences
- If caller wants to schedule, use the book_appointment tool
- If caller needs a human, use the transfer_call tool
- Never make up information about services or pricing
- If unsure, say "Let me connect you with someone who can help"`,
  },
  voice: {
    provider: '11labs',
    voiceId: 'rachel', // Always test voice before deploying
  },
  firstMessage: 'Hi, thanks for calling {{business_name}}! How can I help you today?',
  endCallMessage: 'Thanks for calling. Have a great day!',
  transcriber: {
    provider: 'deepgram',
    model: 'nova-2',
    language: 'en',
  },
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600, // 10 min max
  endCallFunctionEnabled: true,
};
```

### Webhook Processing Pattern

```typescript
// app/api/vapi/webhook/route.ts
export async function POST(req: Request) {
  // 1. Verify signature FIRST
  const signature = req.headers.get('x-vapi-signature');
  if (!verifyVapiSignature(signature, await req.clone().text())) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse event
  const event = await req.json();

  // 3. Return 200 immediately — process async
  // (VAPI has a 5-second timeout on webhooks)
  processEventAsync(event).catch(console.error);

  return new Response('OK', { status: 200 });
}

async function processEventAsync(event: VapiEvent) {
  switch (event.type) {
    case 'call-started':
      await logCallStart(event);
      break;
    case 'call-ended':
      await logCallEnd(event);
      await triggerPostCallWorkflow(event);
      break;
    case 'transcript':
      await storeTranscript(event);
      break;
    case 'tool-calls':
      // Handle tool calls from the assistant
      return await handleToolCalls(event);
    case 'hang':
      // Customer hung up
      await handleHangup(event);
      break;
  }
}
```

### Call Flow Architecture

```
Inbound Call
    ↓
VAPI Assistant (AI greeting)
    ↓
Intent Detection (via conversation)
    ├── Schedule → book_appointment tool → confirm → end call
    ├── Question → answer from knowledge base → end call
    ├── Complaint → create_ticket tool → transfer to human
    └── Unknown → transfer_call tool → human agent
```

### Tool Definitions for VAPI

```typescript
const tools = [
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book an appointment for the caller',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "Caller's full name" },
          date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
          time: { type: 'string', description: 'Preferred time (HH:MM)' },
          reason: { type: 'string', description: 'Reason for appointment' },
        },
        required: ['name', 'date', 'time'],
      },
    },
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`,
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_call',
      description: 'Transfer the caller to a human agent',
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            enum: ['sales', 'support', 'billing'],
            description: 'Department to transfer to',
          },
          reason: { type: 'string', description: 'Why the caller needs a human' },
        },
        required: ['department'],
      },
    },
  },
];
```

### Database Schema for Call Logs

```sql
CREATE TABLE call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vapi_call_id TEXT UNIQUE NOT NULL,
  phone_number TEXT,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  status TEXT CHECK (status IN ('started', 'in_progress', 'ended', 'failed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript JSONB,
  summary TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  tools_used TEXT[],
  transferred_to TEXT,
  recording_url TEXT,
  cost_cents INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX idx_call_logs_started ON call_logs (started_at DESC);
CREATE INDEX idx_call_logs_phone ON call_logs (phone_number);

-- RLS: Only authenticated admins can view call logs
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view call logs"
  ON call_logs FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');
```

### Outbound Calling Pattern

```typescript
async function initiateOutboundCall(phoneNumber: string, context: Record<string, string>) {
  const response = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId: process.env.VAPI_ASSISTANT_ID,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phoneNumber },
      assistantOverrides: {
        variableValues: context, // Inject dynamic context into prompt
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`VAPI call failed: ${error.message}`);
  }

  return response.json();
}
```

## Code Templates

- `vapi-assistant-config.ts` — Complete assistant setup with model, voice, tools, and server config
- `vapi-call-handler.ts` — Server-side tool call handler for VAPI function calls
- `vapi-webhook.ts` — Webhook route with signature verification and async event processing

## Checklist

- [ ] VAPI API key stored in environment variables (never in code)
- [ ] Webhook signature verification implemented
- [ ] Webhook returns 200 within 5 seconds (async processing for heavy work)
- [ ] All tool functions have explicit parameter schemas with required fields
- [ ] System prompt is concise (under 500 words for voice — latency matters)
- [ ] First message is natural and sets expectations
- [ ] Silence timeout configured (30s default)
- [ ] Max call duration set to prevent runaway costs
- [ ] Call recording disclosure in first message if required by law
- [ ] End call function enabled so assistant can hang up gracefully
- [ ] Transfer-to-human fallback exists for every flow
- [ ] Call logs stored with searchable indexes
- [ ] Error handling for VAPI API failures (retry with backoff)
- [ ] Tested with real phone call end-to-end (not just API simulation)
- [ ] Outbound calls respect do-not-call lists and time-of-day restrictions

## Common Pitfalls

1. **Latency ruins conversations** — Keep system prompts short, use fast models (Sonnet over Opus for voice), and ensure tool handlers respond in under 2 seconds. Users notice >500ms pauses.

2. **Interruption handling** — Users talk over AI. Configure `backgroundDenoisingEnabled` and test with overlapping speech. The default behavior often cuts off the AI mid-sentence.

3. **Webhook timeout** — VAPI expects webhook responses in 5 seconds. Do NOT run database queries or API calls synchronously in the webhook handler. Return 200, then process.

4. **Phone number formatting** — Always normalize to E.164 format (+1XXXXXXXXXX) before storing or dialing. Mismatched formats cause silent failures.

5. **Cost surprises** — VAPI charges per minute. Set `maxDurationSeconds` on every assistant. Monitor usage with call log analytics. A stuck call loop can burn through credits fast.

6. **Testing in production** — Never test voice flows against real customer phone numbers. Use a dedicated test number and VAPI's sandbox mode during development.
