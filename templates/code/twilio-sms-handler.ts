/**
 * twilio-sms-handler.ts
 * Complete SMS send/receive with opt-in/out compliance,
 * status tracking, and segment calculation.
 *
 * Usage:
 *   import { SmsService } from '@/lib/twilio/sms-service';
 *   const sms = new SmsService();
 *   await sms.send({ to: '+15551234567', body: 'Hello!', type: 'transactional' });
 */

import twilio from 'twilio';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface SendSmsOptions {
  to: string;
  body: string;
  type: 'transactional' | 'marketing';
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}

interface SendResult {
  success: boolean;
  sid?: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  segments?: number;
}

// ─── SMS Service ────────────────────────────────────────────────────────────

export class SmsService {
  private messagingServices: Record<string, string>;

  constructor() {
    this.messagingServices = {
      transactional: process.env.TWILIO_MESSAGING_SERVICE_TRANSACTIONAL!,
      marketing: process.env.TWILIO_MESSAGING_SERVICE_MARKETING!,
    };
  }

  async send(options: SendSmsOptions): Promise<SendResult> {
    // 1. Validate phone number
    if (!this.isValidE164(options.to)) {
      return { success: false, status: 'failed', reason: `Invalid phone: ${options.to}. Use E.164 format (+15551234567)` };
    }

    // 2. Check opt-out
    const isOptedOut = await this.checkOptOut(options.to, options.type);
    if (isOptedOut) {
      return { success: false, status: 'skipped', reason: `opted_out_${options.type}` };
    }

    // 3. Calculate segments for cost awareness
    const { segments, encoding } = this.calculateSegments(options.body);

    // 4. Send via Twilio
    try {
      const message = await twilioClient.messages.create({
        to: options.to,
        messagingServiceSid: this.messagingServices[options.type],
        body: options.body,
        mediaUrl: options.mediaUrls,
        statusCallback: `${process.env.APP_URL}/api/webhooks/twilio/status`,
      });

      // 5. Log
      await this.logMessage({
        twilio_sid: message.sid,
        to: options.to,
        from: message.from ?? '',
        body: options.body,
        type: options.type,
        channel: options.mediaUrls?.length ? 'mms' : 'sms',
        direction: 'outbound',
        status: message.status,
        segments,
        encoding,
        metadata: options.metadata,
      });

      return { success: true, sid: message.sid, status: 'sent', segments };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[sms] Send failed to ${options.to}:`, errorMsg);

      await this.logMessage({
        to: options.to,
        from: '',
        body: options.body,
        type: options.type,
        channel: 'sms',
        direction: 'outbound',
        status: 'failed',
        error_message: errorMsg,
        metadata: options.metadata,
      });

      return { success: false, status: 'failed', reason: errorMsg };
    }
  }

  /**
   * Send to multiple recipients with rate limiting.
   */
  async sendBulk(
    recipients: string[],
    body: string,
    type: 'transactional' | 'marketing',
    options?: { delayMs?: number }
  ): Promise<{ sent: number; skipped: number; failed: number; results: SendResult[] }> {
    const results: SendResult[] = [];
    let sent = 0, skipped = 0, failed = 0;
    const delay = options?.delayMs ?? 100; // 10 msg/sec default

    for (const to of recipients) {
      const result = await this.send({ to, body, type });
      results.push(result);

      if (result.status === 'sent') sent++;
      else if (result.status === 'skipped') skipped++;
      else failed++;

      // Rate limit
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }

    return { sent, skipped, failed, results };
  }

  // ─── Compliance ─────────────────────────────────────────────────────────

  async checkOptOut(phone: string, type: 'transactional' | 'marketing'): Promise<boolean> {
    const { data } = await supabase
      .from('messaging_consent')
      .select('status')
      .eq('phone_number', phone)
      .eq('consent_type', type)
      .single();

    // No record: transactional = allowed, marketing = blocked
    if (!data) return type === 'marketing';
    return data.status === 'opted_out';
  }

  async recordOptIn(phone: string, type: 'transactional' | 'marketing', method: string, source: string) {
    await supabase.from('messaging_consent').upsert({
      phone_number: phone,
      consent_type: type,
      status: 'opted_in',
      opted_in_at: new Date().toISOString(),
      opt_in_method: method,
      opt_in_source: source,
    }, { onConflict: 'phone_number,consent_type' });
  }

  async handleOptOut(phone: string) {
    const types = ['transactional', 'marketing'];
    await supabase.from('messaging_consent').upsert(
      types.map((t) => ({
        phone_number: phone,
        consent_type: t,
        status: 'opted_out',
        opted_out_at: new Date().toISOString(),
      })),
      { onConflict: 'phone_number,consent_type' }
    );
  }

  async handleOptIn(phone: string) {
    const types = ['transactional', 'marketing'];
    await supabase.from('messaging_consent').upsert(
      types.map((t) => ({
        phone_number: phone,
        consent_type: t,
        status: 'opted_in',
        opted_in_at: new Date().toISOString(),
      })),
      { onConflict: 'phone_number,consent_type' }
    );
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }

  calculateSegments(body: string): { segments: number; encoding: 'GSM-7' | 'UCS-2' } {
    const gsm7 = /^[\x20-\x7E\n\r]+$/;
    const isGsm7 = gsm7.test(body);

    if (isGsm7) {
      return { segments: body.length <= 160 ? 1 : Math.ceil(body.length / 153), encoding: 'GSM-7' };
    }
    return { segments: body.length <= 70 ? 1 : Math.ceil(body.length / 67), encoding: 'UCS-2' };
  }

  // ─── Logging ────────────────────────────────────────────────────────────

  private async logMessage(data: Record<string, unknown>) {
    await supabase.from('messages').insert({
      ...data,
      created_at: new Date().toISOString(),
    });
  }
}

// ─── Inbound Webhook Handler ────────────────────────────────────────────────
// Copy to: app/api/webhooks/twilio/inbound/route.ts

export async function handleInboundSms(req: NextRequest): Promise<NextResponse> {
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

  const from = params.get('From')!;
  const messageBody = params.get('Body') ?? '';
  const cleanFrom = from.replace('whatsapp:', '');
  const smsService = new SmsService();

  // Opt-out keywords
  const optOutWords = ['stop', 'unsubscribe', 'cancel', 'end', 'quit'];
  if (optOutWords.includes(messageBody.trim().toLowerCase())) {
    await smsService.handleOptOut(cleanFrom);
    return new NextResponse('', { status: 200 });
  }

  // Opt-in keywords
  const optInWords = ['start', 'yes', 'unstop'];
  if (optInWords.includes(messageBody.trim().toLowerCase())) {
    await smsService.handleOptIn(cleanFrom);
    return new NextResponse('', { status: 200 });
  }

  // Log inbound
  await supabase.from('messages').insert({
    twilio_sid: params.get('MessageSid'),
    from_number: cleanFrom,
    to_number: params.get('To'),
    body: messageBody,
    channel: from.startsWith('whatsapp:') ? 'whatsapp' : 'sms',
    direction: 'inbound',
    status: 'received',
  });

  // TODO: Route to your message processing logic
  // await processInboundMessage(cleanFrom, messageBody);

  return new NextResponse('', { status: 200 });
}

// ─── Status Callback Handler ────────────────────────────────────────────────
// Copy to: app/api/webhooks/twilio/status/route.ts

export async function handleStatusCallback(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const params = new URLSearchParams(body);

  const sid = params.get('MessageSid')!;
  const status = params.get('MessageStatus')!;
  const errorCode = params.get('ErrorCode');

  await supabase
    .from('messages')
    .update({
      status,
      error_code: errorCode,
      error_message: params.get('ErrorMessage'),
      updated_at: new Date().toISOString(),
    })
    .eq('twilio_sid', sid);

  if (status === 'failed' || status === 'undelivered') {
    console.error(`[sms] Delivery failed: ${sid} error=${errorCode}`);
    // TODO: Alert or retry logic
  }

  return new NextResponse('', { status: 200 });
}
