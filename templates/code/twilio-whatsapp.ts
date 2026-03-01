/**
 * twilio-whatsapp.ts
 * WhatsApp Business integration with template messages, media handling,
 * 24hr conversation window management, and conversation tracking.
 *
 * Usage:
 *   import { WhatsAppService } from '@/lib/twilio/whatsapp-service';
 *   const wa = new WhatsAppService();
 *   await wa.sendTemplate('+15551234567', 'HX...template_sid', { '1': 'John' });
 */

import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const WHATSAPP_FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const STATUS_CALLBACK = `${process.env.APP_URL}/api/webhooks/twilio/whatsapp/status`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConversationWindow {
  phone: string;
  last_inbound_at: string;
  is_open: boolean; // true if within 24hr window
}

interface WhatsAppMessage {
  id: string;
  phone: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  template_sid: string | null;
  media_urls: string[];
  status: string;
  twilio_sid: string;
  conversation_id: string | null;
  created_at: string;
}

// ─── WhatsApp Service ───────────────────────────────────────────────────────

export class WhatsAppService {

  // ─── Sending Messages ─────────────────────────────────────────────────

  /**
   * Send a freeform message. Only works within the 24hr conversation window.
   * Throws if window is closed — use sendTemplate() instead.
   */
  async sendMessage(
    to: string,
    body: string,
    options?: { mediaUrls?: string[] }
  ): Promise<{ sid: string; status: string }> {
    // Check conversation window
    const window = await this.getConversationWindow(to);
    if (!window.is_open) {
      throw new WhatsAppWindowError(
        `24hr conversation window is closed for ${to}. Use sendTemplate() to initiate a new conversation.`
      );
    }

    const message = await twilioClient.messages.create({
      to: `whatsapp:${to}`,
      from: WHATSAPP_FROM,
      body,
      mediaUrl: options?.mediaUrls,
      statusCallback: STATUS_CALLBACK,
    });

    await this.logMessage({
      phone: to,
      direction: 'outbound',
      body,
      media_urls: options?.mediaUrls ?? [],
      twilio_sid: message.sid,
      status: message.status,
    });

    return { sid: message.sid, status: message.status };
  }

  /**
   * Send a pre-approved template message. Works anytime (opens a new 24hr window).
   * Templates must be created and approved via Twilio Console or Content API.
   */
  async sendTemplate(
    to: string,
    contentSid: string,
    contentVariables?: Record<string, string>
  ): Promise<{ sid: string; status: string }> {
    const message = await twilioClient.messages.create({
      to: `whatsapp:${to}`,
      from: WHATSAPP_FROM,
      contentSid,
      contentVariables: contentVariables ? JSON.stringify(contentVariables) : undefined,
      statusCallback: STATUS_CALLBACK,
    });

    await this.logMessage({
      phone: to,
      direction: 'outbound',
      body: null,
      template_sid: contentSid,
      media_urls: [],
      twilio_sid: message.sid,
      status: message.status,
    });

    return { sid: message.sid, status: message.status };
  }

  /**
   * Smart send — uses freeform if window is open, falls back to template.
   */
  async smartSend(
    to: string,
    freeformBody: string,
    fallbackTemplateSid: string,
    fallbackVariables?: Record<string, string>
  ): Promise<{ sid: string; method: 'freeform' | 'template' }> {
    const window = await this.getConversationWindow(to);

    if (window.is_open) {
      const result = await this.sendMessage(to, freeformBody);
      return { sid: result.sid, method: 'freeform' };
    } else {
      const result = await this.sendTemplate(to, fallbackTemplateSid, fallbackVariables);
      return { sid: result.sid, method: 'template' };
    }
  }

  /**
   * Send media (image, document, video, audio).
   */
  async sendMedia(
    to: string,
    mediaUrl: string,
    caption?: string
  ): Promise<{ sid: string }> {
    const window = await this.getConversationWindow(to);
    if (!window.is_open) {
      throw new WhatsAppWindowError('24hr window closed. Cannot send media outside conversation window.');
    }

    // Validate media URL
    if (!mediaUrl.startsWith('https://')) {
      throw new Error('Media URL must use HTTPS');
    }

    const message = await twilioClient.messages.create({
      to: `whatsapp:${to}`,
      from: WHATSAPP_FROM,
      body: caption ?? '',
      mediaUrl: [mediaUrl],
      statusCallback: STATUS_CALLBACK,
    });

    await this.logMessage({
      phone: to,
      direction: 'outbound',
      body: caption ?? null,
      media_urls: [mediaUrl],
      twilio_sid: message.sid,
      status: message.status,
    });

    return { sid: message.sid };
  }

  // ─── Conversation Window Management ─────────────────────────────────

  async getConversationWindow(phone: string): Promise<ConversationWindow> {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('last_inbound_at')
      .eq('phone', phone)
      .single();

    if (!data?.last_inbound_at) {
      return { phone, last_inbound_at: '', is_open: false };
    }

    const lastInbound = new Date(data.last_inbound_at);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isOpen = lastInbound > twentyFourHoursAgo;

    return { phone, last_inbound_at: data.last_inbound_at, is_open: isOpen };
  }

  async updateConversationWindow(phone: string): Promise<void> {
    await supabase.from('whatsapp_conversations').upsert({
      phone,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone' });
  }

  // ─── Inbound Message Processing ────────────────────────────────────

  async handleInbound(params: URLSearchParams): Promise<void> {
    const from = (params.get('From') ?? '').replace('whatsapp:', '');
    const body = params.get('Body') ?? '';
    const numMedia = parseInt(params.get('NumMedia') ?? '0');
    const sid = params.get('MessageSid')!;

    // Extract media URLs
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url = params.get(`MediaUrl${i}`);
      if (url) mediaUrls.push(url);
    }

    // Update conversation window (user messaged us = 24hr window opens)
    await this.updateConversationWindow(from);

    // Log inbound message
    await this.logMessage({
      phone: from,
      direction: 'inbound',
      body,
      media_urls: mediaUrls,
      twilio_sid: sid,
      status: 'received',
    });

    // Route message to your business logic
    // await this.routeMessage(from, body, mediaUrls);
  }

  // ─── Status Updates ─────────────────────────────────────────────────

  async handleStatusUpdate(params: URLSearchParams): Promise<void> {
    const sid = params.get('MessageSid')!;
    const status = params.get('MessageStatus')!;
    // WhatsApp statuses: queued → sending → sent → delivered → read
    // Error: failed, undelivered

    await supabase
      .from('whatsapp_messages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('twilio_sid', sid);

    // Track read receipts
    if (status === 'read') {
      await supabase
        .from('whatsapp_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('twilio_sid', sid);
    }

    if (status === 'failed' || status === 'undelivered') {
      const errorCode = params.get('ErrorCode');
      const errorMsg = params.get('ErrorMessage');
      console.error(`[whatsapp] Delivery failed: ${sid} code=${errorCode} msg=${errorMsg}`);

      await supabase
        .from('whatsapp_messages')
        .update({ error_code: errorCode, error_message: errorMsg })
        .eq('twilio_sid', sid);
    }
  }

  // ─── Conversation History ──────────────────────────────────────────

  async getConversation(phone: string, limit: number = 50): Promise<WhatsAppMessage[]> {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []).reverse(); // Chronological order
  }

  // ─── Logging ────────────────────────────────────────────────────────

  private async logMessage(data: {
    phone: string;
    direction: 'inbound' | 'outbound';
    body: string | null;
    template_sid?: string;
    media_urls: string[];
    twilio_sid: string;
    status: string;
  }) {
    await supabase.from('whatsapp_messages').insert({
      ...data,
      created_at: new Date().toISOString(),
    });
  }
}

// ─── Custom Errors ──────────────────────────────────────────────────────────

export class WhatsAppWindowError extends Error {
  name = 'WhatsAppWindowError';
}

// ─── Common Template Examples ───────────────────────────────────────────────
/*
  Templates are created in Twilio Console → Messaging → Content Editor

  Appointment Reminder:
    "Hi {{1}}, this is a reminder about your appointment on {{2}} at {{3}}.
     Reply YES to confirm or NO to reschedule."
    Variables: { "1": "John", "2": "Jan 15", "3": "2:00 PM" }

  Order Update:
    "Your order #{{1}} has been {{2}}. Track it here: {{3}}"
    Variables: { "1": "ORD-5678", "2": "shipped", "3": "https://..." }

  Verification Code:
    "Your verification code is {{1}}. It expires in 10 minutes."
    Variables: { "1": "482910" }

  Invoice:
    "Hi {{1}}, invoice #{{2}} for ${{3}} is due on {{4}}.
     Pay now: {{5}}"
    Variables: { "1": "Jane", "2": "INV-123", "3": "2,500.00", "4": "Feb 1", "5": "https://..." }
*/

// ─── Database Schema ────────────────────────────────────────────────────────
/*
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT,
  template_sid TEXT,
  media_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  twilio_sid TEXT UNIQUE,
  error_code TEXT,
  error_message TEXT,
  read_at TIMESTAMPTZ,
  conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_messages_phone ON whatsapp_messages(phone, created_at DESC);
CREATE INDEX idx_wa_messages_status ON whatsapp_messages(status) WHERE status IN ('queued', 'sending', 'failed');

CREATE TABLE whatsapp_conversations (
  phone TEXT PRIMARY KEY,
  last_inbound_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
*/
