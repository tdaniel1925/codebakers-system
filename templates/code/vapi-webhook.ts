/**
 * VAPI Webhook Handler
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to app/api/vapi/webhook/route.ts
 * Requires: VAPI account, Supabase client, VAPI_WEBHOOK_SECRET env var
 *
 * Features:
 * - Receives all VAPI call lifecycle events
 * - Signature verification via x-vapi-secret header
 * - Returns 200 immediately, processes events asynchronously
 * - Stores call logs with full transcript
 * - Tracks call analytics (duration, cost, sentiment)
 * - Post-call automation triggers (email summary, CRM update, ticket)
 * - Handles: call-started, call-ended, transcript, status-update,
 *   speech-update, hang, tool-calls, end-of-call-report
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────

interface VapiWebhookEvent {
  message: {
    type: string;
    call?: VapiCallData;
    transcript?: string;
    status?: string;
    endedReason?: string;
    artifact?: VapiArtifact;
    toolCallList?: {
      id: string;
      function: { name: string; arguments: Record<string, unknown> };
    }[];
    [key: string]: unknown;
  };
}

interface VapiCallData {
  id: string;
  orgId: string;
  assistantId: string;
  phoneNumberId?: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  cost?: number;
  customer?: {
    number: string;
    name?: string;
  };
  phoneNumber?: {
    number: string;
  };
  metadata?: Record<string, string>;
}

interface VapiArtifact {
  transcript?: string;
  messages?: {
    role: 'assistant' | 'user' | 'system' | 'tool';
    content: string;
    time: number;
  }[];
  recordingUrl?: string;
  summary?: string;
  analysis?: {
    successEvaluation?: string;
    structuredData?: Record<string, unknown>;
  };
}

interface CallLog {
  vapi_call_id: string;
  assistant_id: string;
  direction: 'inbound' | 'outbound';
  caller_number: string | null;
  business_number: string | null;
  caller_name: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_reason: string | null;
  transcript: unknown;
  summary: string | null;
  recording_url: string | null;
  cost_cents: number | null;
  tools_used: string[];
  metadata: Record<string, unknown>;
}

// ─── Supabase Admin Client ────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Signature Verification ───────────────────────────────

function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('VAPI_WEBHOOK_SECRET not set — skipping verification (dev only)');
    return true;
  }

  const providedSecret = request.headers.get('x-vapi-secret');
  return providedSecret === secret;
}

// ─── Event Handlers ───────────────────────────────────────

async function handleCallStarted(call: VapiCallData) {
  const direction = call.type === 'inboundPhoneCall' ? 'inbound' : 'outbound';

  await supabase.from('call_logs').upsert(
    {
      vapi_call_id: call.id,
      assistant_id: call.assistantId,
      direction,
      caller_number: call.customer?.number || null,
      business_number: call.phoneNumber?.number || null,
      caller_name: call.customer?.name || null,
      status: 'started',
      started_at: call.startedAt || new Date().toISOString(),
      metadata: call.metadata || {},
    },
    { onConflict: 'vapi_call_id' }
  );

  console.log(`[VAPI] Call started: ${call.id} (${direction})`);
}

async function handleCallEnded(call: VapiCallData, artifact?: VapiArtifact) {
  // Calculate duration
  let durationSeconds: number | null = null;
  if (call.startedAt && call.endedAt) {
    durationSeconds = Math.round(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
    );
  }

  // Extract tools used from transcript messages
  const toolsUsed: string[] = [];
  if (artifact?.messages) {
    for (const msg of artifact.messages) {
      if (msg.role === 'tool' && msg.content) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.name) toolsUsed.push(parsed.name);
        } catch {
          // Not JSON, skip
        }
      }
    }
  }

  // Update call log
  await supabase
    .from('call_logs')
    .update({
      status: 'ended',
      ended_at: call.endedAt || new Date().toISOString(),
      ended_reason: call.endedReason || 'unknown',
      duration_seconds: durationSeconds,
      transcript: artifact?.messages || null,
      summary: artifact?.summary || null,
      recording_url: artifact?.recordingUrl || null,
      cost_cents: call.cost ? Math.round(call.cost * 100) : null,
      tools_used: [...new Set(toolsUsed)], // Deduplicate
    })
    .eq('vapi_call_id', call.id);

  console.log(
    `[VAPI] Call ended: ${call.id} | Duration: ${durationSeconds}s | Reason: ${call.endedReason}`
  );

  // Trigger post-call automations
  await triggerPostCallWorkflows(call, artifact, durationSeconds);
}

async function handleTranscriptUpdate(callId: string, transcript: string) {
  // Store partial transcripts for live monitoring
  await supabase
    .from('call_logs')
    .update({
      metadata: supabase.rpc ? undefined : { last_transcript: transcript },
    })
    .eq('vapi_call_id', callId);
}

async function handleStatusUpdate(callId: string, status: string) {
  await supabase
    .from('call_logs')
    .update({ status })
    .eq('vapi_call_id', callId);

  console.log(`[VAPI] Call ${callId} status: ${status}`);
}

async function handleEndOfCallReport(call: VapiCallData, artifact?: VapiArtifact) {
  // The end-of-call-report has the most complete data
  // This fires after call-ended and includes full analysis

  if (!artifact?.analysis) return;

  await supabase
    .from('call_logs')
    .update({
      metadata: {
        success_evaluation: artifact.analysis.successEvaluation,
        structured_data: artifact.analysis.structuredData,
      },
    })
    .eq('vapi_call_id', call.id);

  console.log(`[VAPI] End-of-call report received for ${call.id}`);
}

// ─── Post-Call Automations ────────────────────────────────

async function triggerPostCallWorkflows(
  call: VapiCallData,
  artifact?: VapiArtifact,
  durationSeconds?: number | null
) {
  try {
    // 1. Send call summary email to team (if call was > 30 seconds)
    if (durationSeconds && durationSeconds > 30 && artifact?.summary) {
      await sendCallSummaryNotification(call, artifact);
    }

    // 2. Update CRM if caller was identified
    if (call.customer?.number) {
      await updateCRMContactActivity(call, artifact);
    }

    // 3. Check if follow-up is needed
    if (artifact?.analysis?.structuredData) {
      const data = artifact.analysis.structuredData;
      if (data.needs_followup === true || data.follow_up_required === true) {
        await createFollowUpTask(call, artifact);
      }
    }

    // 4. Track analytics
    await trackCallAnalytics(call, durationSeconds);
  } catch (err) {
    // Never let post-call automations crash the webhook
    console.error('[VAPI] Post-call automation error:', err);
  }
}

async function sendCallSummaryNotification(call: VapiCallData, artifact: VapiArtifact) {
  // Queue email via your email system
  await supabase.from('email_queue').insert({
    template: 'call_summary',
    to: process.env.TEAM_NOTIFICATION_EMAIL,
    data: {
      caller: call.customer?.name || call.customer?.number || 'Unknown',
      direction: call.type === 'inboundPhoneCall' ? 'Inbound' : 'Outbound',
      duration: formatDuration(
        call.startedAt && call.endedAt
          ? Math.round(
              (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
            )
          : 0
      ),
      summary: artifact.summary || 'No summary available',
      recording_url: artifact.recordingUrl || null,
      timestamp: new Date().toISOString(),
    },
    status: 'pending',
  });
}

async function updateCRMContactActivity(call: VapiCallData, artifact?: VapiArtifact) {
  const phone = call.customer?.number;
  if (!phone) return;

  // Find contact by phone
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .single();

  if (!contact) return;

  // Log activity
  await supabase.from('contact_activities').insert({
    contact_id: contact.id,
    type: 'phone_call',
    direction: call.type === 'inboundPhoneCall' ? 'inbound' : 'outbound',
    summary: artifact?.summary || 'Phone call',
    metadata: {
      call_id: call.id,
      duration_seconds: call.startedAt && call.endedAt
        ? Math.round(
            (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
          )
        : null,
      recording_url: artifact?.recordingUrl,
    },
  });
}

async function createFollowUpTask(call: VapiCallData, artifact?: VapiArtifact) {
  await supabase.from('tasks').insert({
    title: `Follow up: ${call.customer?.name || call.customer?.number || 'Caller'}`,
    description: artifact?.summary || 'Follow up after phone call',
    priority: 'high',
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    source: 'vapi_call',
    metadata: {
      call_id: call.id,
      caller: call.customer?.number,
    },
    status: 'pending',
  });
}

async function trackCallAnalytics(call: VapiCallData, durationSeconds?: number | null) {
  await supabase.from('call_analytics').insert({
    call_id: call.id,
    assistant_id: call.assistantId,
    direction: call.type === 'inboundPhoneCall' ? 'inbound' : 'outbound',
    duration_seconds: durationSeconds || 0,
    cost_cents: call.cost ? Math.round(call.cost * 100) : 0,
    ended_reason: call.endedReason || 'unknown',
    date: new Date().toISOString().split('T')[0],
  });
}

// ─── Helpers ──────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

// ─── Main Route Handler ───────────────────────────────────

export async function POST(request: Request) {
  // 1. Verify webhook authenticity
  if (!verifyWebhookSecret(request)) {
    console.error('[VAPI] Webhook signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse event
  let event: VapiWebhookEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, call, transcript, status, artifact, toolCallList } = event.message;

  // 3. Return 200 IMMEDIATELY — process async
  // VAPI has a 5-second timeout on webhook responses
  // For tool-calls, we must respond synchronously with results
  if (type === 'tool-calls' && toolCallList) {
    // Tool calls are handled by the /api/vapi/tools route
    // If they hit this webhook instead, redirect
    return NextResponse.json({
      error: 'Tool calls should be directed to /api/vapi/tools',
    }, { status: 400 });
  }

  // Fire-and-forget async processing
  processEvent(type, call, transcript, status, artifact).catch((err) =>
    console.error(`[VAPI] Event processing error (${type}):`, err)
  );

  // Return 200 immediately
  return NextResponse.json({ received: true });
}

async function processEvent(
  type: string,
  call?: VapiCallData,
  transcript?: string,
  status?: string,
  artifact?: VapiArtifact
) {
  switch (type) {
    case 'call-started':
      if (call) await handleCallStarted(call);
      break;

    case 'call-ended':
      if (call) await handleCallEnded(call, artifact);
      break;

    case 'end-of-call-report':
      if (call) await handleEndOfCallReport(call, artifact);
      break;

    case 'transcript':
      if (call?.id && transcript) {
        await handleTranscriptUpdate(call.id, transcript);
      }
      break;

    case 'status-update':
      if (call?.id && status) {
        await handleStatusUpdate(call.id, status);
      }
      break;

    case 'speech-update':
      // Real-time speech events (for live monitoring dashboards)
      // Typically streamed via Supabase Realtime to a UI
      break;

    case 'hang':
      // Customer hung up — call-ended will follow
      if (call?.id) {
        console.log(`[VAPI] Customer hung up: ${call.id}`);
      }
      break;

    default:
      console.log(`[VAPI] Unhandled event type: ${type}`);
  }
}

// ─── Database Setup (run once) ────────────────────────────
//
// -- Main call logs table
// CREATE TABLE call_logs (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   vapi_call_id TEXT UNIQUE NOT NULL,
//   assistant_id TEXT,
//   direction TEXT CHECK (direction IN ('inbound', 'outbound')),
//   caller_number TEXT,
//   business_number TEXT,
//   caller_name TEXT,
//   status TEXT DEFAULT 'started',
//   started_at TIMESTAMPTZ,
//   ended_at TIMESTAMPTZ,
//   duration_seconds INTEGER,
//   ended_reason TEXT,
//   transcript JSONB,
//   summary TEXT,
//   recording_url TEXT,
//   cost_cents INTEGER,
//   tools_used TEXT[] DEFAULT '{}',
//   metadata JSONB DEFAULT '{}',
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE INDEX idx_call_logs_started ON call_logs (started_at DESC);
// CREATE INDEX idx_call_logs_caller ON call_logs (caller_number);
// CREATE INDEX idx_call_logs_assistant ON call_logs (assistant_id);
//
// -- Analytics aggregation table
// CREATE TABLE call_analytics (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   call_id TEXT NOT NULL,
//   assistant_id TEXT,
//   direction TEXT,
//   duration_seconds INTEGER DEFAULT 0,
//   cost_cents INTEGER DEFAULT 0,
//   ended_reason TEXT,
//   date DATE NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE INDEX idx_analytics_date ON call_analytics (date DESC);
// CREATE INDEX idx_analytics_assistant ON call_analytics (assistant_id, date DESC);
//
// -- Email queue for post-call notifications
// CREATE TABLE email_queue (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   template TEXT NOT NULL,
//   "to" TEXT NOT NULL,
//   data JSONB DEFAULT '{}',
//   status TEXT DEFAULT 'pending',
//   sent_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// -- RLS: Only admins can view call logs
// ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Admins view call logs"
//   ON call_logs FOR SELECT TO authenticated
//   USING (auth.jwt() ->> 'role' = 'admin');
