/**
 * VAPI Call & Tool Handler
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to app/api/vapi/tools/route.ts
 * Requires: VAPI account, Supabase client, VAPI_TOOL_SECRET env var
 *
 * Features:
 * - Receives tool call requests from VAPI assistant during live calls
 * - Routes to typed handler functions per tool name
 * - Returns structured results back to the assistant
 * - Logs all tool executions for debugging and analytics
 * - Handles errors gracefully (returns user-friendly message to assistant)
 * - Signature verification for security
 * - Timeout protection (VAPI expects response within 5 seconds)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────

interface VapiToolCallPayload {
  message: {
    type: 'tool-calls';
    call: {
      id: string;
      phoneNumber?: { number: string };
      customer?: { number: string; name?: string };
    };
    toolCallList: ToolCall[];
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface ToolResult {
  name: string;
  result: string; // VAPI expects a string result the assistant can speak
  error?: string;
}

type ToolHandler = (
  args: Record<string, unknown>,
  callContext: CallContext
) => Promise<string>;

interface CallContext {
  callId: string;
  callerNumber?: string;
  callerName?: string;
}

// ─── Supabase Admin Client ────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Signature Verification ───────────────────────────────

function verifyToolSecret(request: Request): boolean {
  const secret = process.env.VAPI_TOOL_SECRET;
  if (!secret) return true; // Skip verification if no secret configured (dev only)

  const providedSecret = request.headers.get('x-vapi-secret');
  return providedSecret === secret;
}

// ─── Tool Handlers ────────────────────────────────────────

const toolHandlers: Record<string, ToolHandler> = {
  /**
   * Book an appointment
   */
  book_appointment: async (args, ctx) => {
    const {
      caller_name,
      phone_number,
      preferred_date,
      preferred_time,
      reason,
    } = args as {
      caller_name: string;
      phone_number?: string;
      preferred_date: string;
      preferred_time: string;
      reason?: string;
    };

    // Validate date is in the future
    const appointmentDate = new Date(`${preferred_date}T${preferred_time}`);
    if (appointmentDate <= new Date()) {
      return "I'm sorry, that date and time has already passed. Could you suggest a future date?";
    }

    // Check availability
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('date', preferred_date)
      .eq('start_time', preferred_time)
      .neq('status', 'cancelled')
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return `I'm sorry, ${preferred_time} on ${preferred_date} is already booked. Would you like to try a different time?`;
    }

    // Create the booking
    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        name: caller_name,
        phone: phone_number || ctx.callerNumber,
        date: preferred_date,
        start_time: `${preferred_date}T${preferred_time}:00`,
        end_time: `${preferred_date}T${addMinutes(preferred_time, 30)}:00`,
        reason: reason || 'Phone booking',
        source: 'vapi_call',
        call_id: ctx.callId,
        status: 'confirmed',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Booking error:', error);
      return "I'm having trouble booking that appointment right now. Let me transfer you to someone who can help.";
    }

    // Log the tool execution
    await logToolExecution(ctx.callId, 'book_appointment', args, {
      success: true,
      bookingId: booking.id,
    });

    return `Great, I've booked an appointment for ${caller_name} on ${formatDate(preferred_date)} at ${formatTime(preferred_time)}. You'll receive a confirmation shortly. Is there anything else I can help with?`;
  },

  /**
   * Look up a customer account
   */
  lookup_account: async (args, ctx) => {
    const { phone_number, account_number } = args as {
      phone_number?: string;
      account_number?: string;
    };

    const lookupValue = account_number || phone_number || ctx.callerNumber;
    if (!lookupValue) {
      return "I need either a phone number or account number to look up your account. Could you provide one?";
    }

    // Search by account number first, then phone
    let query = supabase.from('customers').select('id, name, email, plan_status, account_number');

    if (account_number) {
      query = query.eq('account_number', account_number);
    } else {
      query = query.eq('phone', lookupValue);
    }

    const { data: customer, error } = await query.single();

    if (error || !customer) {
      await logToolExecution(ctx.callId, 'lookup_account', args, {
        success: false,
        reason: 'not_found',
      });
      return "I wasn't able to find an account with that information. Could you double-check and try again, or would you like me to transfer you to someone who can help?";
    }

    await logToolExecution(ctx.callId, 'lookup_account', args, {
      success: true,
      customerId: customer.id,
    });

    return `I found the account for ${customer.name}. The account number is ${customer.account_number} and the current status is ${customer.plan_status}. How can I help with this account?`;
  },

  /**
   * Create a support ticket
   */
  create_support_ticket: async (args, ctx) => {
    const {
      caller_name,
      issue_summary,
      priority,
      callback_number,
    } = args as {
      caller_name: string;
      issue_summary: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      callback_number?: string;
    };

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        name: caller_name,
        phone: callback_number || ctx.callerNumber,
        summary: issue_summary,
        priority,
        source: 'vapi_call',
        call_id: ctx.callId,
        status: 'open',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Ticket creation error:', error);
      return "I'm having trouble creating a ticket right now. Let me transfer you to support directly.";
    }

    await logToolExecution(ctx.callId, 'create_support_ticket', args, {
      success: true,
      ticketId: ticket.id,
    });

    const ticketNumber = ticket.id.slice(0, 8).toUpperCase();
    return `I've created a ${priority} priority support ticket. Your reference number is ${ticketNumber}. Our team will follow up with you ${priority === 'urgent' ? 'within the hour' : 'within 24 hours'}. Is there anything else I can help with?`;
  },

  /**
   * Transfer call to department
   * Note: For actual call transfer, VAPI handles the telephony.
   * This handler logs the transfer and returns context for the assistant.
   */
  transfer_call: async (args, ctx) => {
    const { department, reason } = args as {
      department: string;
      reason?: string;
    };

    // Log the transfer
    await logToolExecution(ctx.callId, 'transfer_call', args, {
      success: true,
      department,
    });

    await supabase.from('call_transfers').insert({
      call_id: ctx.callId,
      from_number: ctx.callerNumber,
      to_department: department,
      reason: reason || 'Caller requested transfer',
      transferred_at: new Date().toISOString(),
    });

    return `I'm transferring you to our ${department} team now. I've let them know the reason for your call. Please hold for just a moment.`;
  },

  /**
   * Check business hours / availability
   */
  check_hours: async (args, _ctx) => {
    const { date } = args as { date?: string };

    // Pull business hours from config/database
    const { data: hours } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'business_hours')
      .single();

    if (!hours) {
      return 'Our regular hours are Monday through Friday, 9 AM to 5 PM Central Time.';
    }

    const parsed = JSON.parse(hours.value);
    if (date) {
      const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
      const dayHours = parsed[dayOfWeek.toLowerCase()];
      if (!dayHours || dayHours.closed) {
        return `We are closed on ${dayOfWeek}s. Would you like to schedule for a different day?`;
      }
      return `On ${dayOfWeek}s, we're open from ${dayHours.open} to ${dayHours.close}.`;
    }

    return `Our business hours are: ${formatBusinessHours(parsed)}`;
  },
};

// ─── Tool Execution Logger ────────────────────────────────

async function logToolExecution(
  callId: string,
  toolName: string,
  input: Record<string, unknown>,
  result: Record<string, unknown>
) {
  try {
    await supabase.from('tool_execution_logs').insert({
      call_id: callId,
      tool_name: toolName,
      input,
      result,
      executed_at: new Date().toISOString(),
    });
  } catch (err) {
    // Don't let logging failures affect the tool response
    console.error('Failed to log tool execution:', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatBusinessHours(hours: Record<string, { open: string; close: string; closed?: boolean }>): string {
  return Object.entries(hours)
    .map(([day, h]) =>
      h.closed
        ? `${day}: Closed`
        : `${day}: ${h.open} - ${h.close}`
    )
    .join(', ');
}

// ─── Main Route Handler ───────────────────────────────────

export async function POST(request: Request) {
  // 1. Verify request authenticity
  if (!verifyToolSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse payload
  let payload: VapiToolCallPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Extract call context
  const { call, toolCallList } = payload.message;
  const callContext: CallContext = {
    callId: call.id,
    callerNumber: call.customer?.number || call.phoneNumber?.number,
    callerName: call.customer?.name,
  };

  // 4. Process each tool call
  const results: { toolCallId: string; result: string }[] = [];

  for (const toolCall of toolCallList) {
    const { name, arguments: args } = toolCall.function;
    const handler = toolHandlers[name];

    let resultMessage: string;

    if (!handler) {
      console.error(`Unknown tool: ${name}`);
      resultMessage = "I'm sorry, I'm unable to perform that action right now. How else can I help?";
    } else {
      try {
        // Execute with timeout (VAPI expects fast responses)
        resultMessage = await Promise.race([
          handler(args, callContext),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Tool handler timeout')), 4500)
          ),
        ]);
      } catch (err) {
        console.error(`Tool ${name} failed:`, err);
        resultMessage = "I'm having a technical issue with that request. Would you like me to transfer you to someone who can help?";

        await logToolExecution(callContext.callId, name, args, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    results.push({
      toolCallId: toolCall.id,
      result: resultMessage,
    });
  }

  // 5. Return results to VAPI
  return NextResponse.json({ results });
}

// ─── Database Setup (run once) ────────────────────────────
//
// CREATE TABLE tool_execution_logs (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   call_id TEXT NOT NULL,
//   tool_name TEXT NOT NULL,
//   input JSONB DEFAULT '{}',
//   result JSONB DEFAULT '{}',
//   executed_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE INDEX idx_tool_logs_call ON tool_execution_logs (call_id);
// CREATE INDEX idx_tool_logs_tool ON tool_execution_logs (tool_name, executed_at DESC);
//
// CREATE TABLE call_transfers (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   call_id TEXT NOT NULL,
//   from_number TEXT,
//   to_department TEXT,
//   reason TEXT,
//   transferred_at TIMESTAMPTZ DEFAULT NOW()
// );
