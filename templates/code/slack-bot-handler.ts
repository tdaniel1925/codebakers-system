/**
 * slack-bot-handler.ts
 * Complete Slack bot with command routing, event handling,
 * interactive messages, modal workflows, and multi-workspace support.
 *
 * Usage:
 *   Set webhook URLs in Slack App config:
 *   - Slash Commands:    /api/webhooks/slack/commands
 *   - Events:            /api/webhooks/slack/events
 *   - Interactivity:     /api/webhooks/slack/interactive
 *
 *   import { SlackBot } from '@/lib/slack/bot';
 *   const bot = new SlackBot();
 *   bot.command('/invoice', invoiceCommandHandler);
 *   bot.action('approve_invoice', approveHandler);
 *   bot.event('app_mention', mentionHandler);
 */

import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface SlackCommandContext {
  command: string;
  text: string;
  args: string[];
  userId: string;
  userName: string;
  channelId: string;
  teamId: string;
  triggerId: string;
  responseUrl: string;
  client: WebClient;
}

interface SlackActionContext {
  action: any;
  userId: string;
  teamId: string;
  channelId?: string;
  messageTs?: string;
  triggerId: string;
  responseUrl: string;
  client: WebClient;
}

interface SlackEventContext {
  event: any;
  teamId: string;
  client: WebClient;
}

interface SlackViewContext {
  view: any;
  values: Record<string, Record<string, any>>;
  userId: string;
  teamId: string;
  privateMetadata: Record<string, any>;
  client: WebClient;
}

type CommandHandler = (ctx: SlackCommandContext) => Promise<SlackResponse | void>;
type ActionHandler = (ctx: SlackActionContext) => Promise<void>;
type EventHandler = (ctx: SlackEventContext) => Promise<void>;
type ViewHandler = (ctx: SlackViewContext) => Promise<SlackViewResponse | void>;

interface SlackResponse {
  text?: string;
  blocks?: any[];
  response_type?: 'ephemeral' | 'in_channel';
  replace_original?: boolean;
}

interface SlackViewResponse {
  response_action?: 'errors' | 'update' | 'push' | 'clear';
  errors?: Record<string, string>;
  view?: any;
}

// ─── Request Verification ───────────────────────────────────────────────────

function verifySlackSignature(signingSecret: string, signature: string, timestamp: string, body: string): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function verifyAndParse(req: NextRequest): Promise<{ verified: boolean; body: string }> {
  const body = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';
  const verified = verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, signature, timestamp, body);
  return { verified, body };
}

// ─── Workspace Token Management ─────────────────────────────────────────────

async function getClientForTeam(teamId: string): Promise<WebClient> {
  const { data } = await supabase
    .from('slack_installations')
    .select('bot_token')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .single();

  if (!data) throw new Error(`No Slack installation for team ${teamId}`);

  // In production: decrypt(data.bot_token)
  return new WebClient(data.bot_token);
}

// ─── Slack Bot Class ────────────────────────────────────────────────────────

export class SlackBot {
  private commands = new Map<string, CommandHandler>();
  private actions = new Map<string, ActionHandler>();
  private events = new Map<string, EventHandler>();
  private views = new Map<string, ViewHandler>();

  // ─── Registration ───────────────────────────────────────────────────

  /** Register a slash command handler. */
  command(commandName: string, handler: CommandHandler): this {
    this.commands.set(commandName, handler);
    return this;
  }

  /** Register a block action handler (buttons, menus, etc). */
  action(actionId: string, handler: ActionHandler): this {
    this.actions.set(actionId, handler);
    return this;
  }

  /** Register an event handler (app_mention, message, etc). */
  event(eventType: string, handler: EventHandler): this {
    this.events.set(eventType, handler);
    return this;
  }

  /** Register a modal view submission handler. */
  view(callbackId: string, handler: ViewHandler): this {
    this.views.set(callbackId, handler);
    return this;
  }

  // ─── Route: Slash Commands ──────────────────────────────────────────

  async handleCommand(req: NextRequest): Promise<NextResponse> {
    const { verified, body } = await verifyAndParse(req);
    if (!verified) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const params = new URLSearchParams(body);
    const command = params.get('command')!;
    const text = params.get('text') ?? '';
    const teamId = params.get('team_id')!;

    const handler = this.commands.get(command);
    if (!handler) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `Unknown command: ${command}. Available: ${[...this.commands.keys()].join(', ')}`,
      });
    }

    const client = await getClientForTeam(teamId);
    const ctx: SlackCommandContext = {
      command,
      text,
      args: text.split(/\s+/).filter(Boolean),
      userId: params.get('user_id')!,
      userName: params.get('user_name')!,
      channelId: params.get('channel_id')!,
      teamId,
      triggerId: params.get('trigger_id')!,
      responseUrl: params.get('response_url')!,
      client,
    };

    // Try to handle synchronously (under 3 seconds)
    try {
      const result = await Promise.race([
        handler(ctx),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 2500)),
      ]);

      if (result === 'timeout') {
        // Handler is slow — acknowledge and let it finish async
        this.runAsync(async () => {
          const asyncResult = await handler(ctx);
          if (asyncResult) {
            await this.sendToResponseUrl(ctx.responseUrl, asyncResult);
          }
        });
        return NextResponse.json({ response_type: 'ephemeral', text: '⏳ Working on it...' });
      }

      if (result) {
        return NextResponse.json(result);
      }
      return new NextResponse('', { status: 200 });
    } catch (error) {
      console.error(`[slack-bot] Command error ${command}:`, error);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `❌ Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
      });
    }
  }

  // ─── Route: Events ────────────────────────────────────────────────

  async handleEvent(req: NextRequest): Promise<NextResponse> {
    const { verified, body } = await verifyAndParse(req);
    if (!verified) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const payload = JSON.parse(body);

    // URL verification challenge
    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge });
    }

    if (payload.type === 'event_callback') {
      const event = payload.event;
      const teamId = payload.team_id;

      // Ignore bot messages (prevent loops)
      if (event.bot_id || event.subtype === 'bot_message') {
        return NextResponse.json({ status: 'ok' });
      }

      // Deduplicate events (Slack retries on slow responses)
      const eventId = payload.event_id;
      if (eventId && await this.isDuplicateEvent(eventId)) {
        return NextResponse.json({ status: 'ok' });
      }
      if (eventId) await this.markEventProcessed(eventId);

      const handler = this.events.get(event.type);
      if (handler) {
        // Process async to return 200 quickly
        this.runAsync(async () => {
          const client = await getClientForTeam(teamId);
          await handler({ event, teamId, client });
        });
      }
    }

    return NextResponse.json({ status: 'ok' });
  }

  // ─── Route: Interactive (Actions + Modals) ────────────────────────

  async handleInteractive(req: NextRequest): Promise<NextResponse> {
    const { verified, body } = await verifyAndParse(req);
    if (!verified) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    const params = new URLSearchParams(body);
    const payload = JSON.parse(params.get('payload')!);

    switch (payload.type) {
      case 'block_actions':
        return this.handleBlockActions(payload);

      case 'view_submission':
        return this.handleViewSubmission(payload);

      case 'view_closed':
        return new NextResponse('', { status: 200 });

      case 'shortcut':
      case 'message_action':
        return this.handleShortcut(payload);

      default:
        console.warn(`[slack-bot] Unknown interactive type: ${payload.type}`);
        return new NextResponse('', { status: 200 });
    }
  }

  private async handleBlockActions(payload: any): Promise<NextResponse> {
    const teamId = payload.team?.id ?? payload.user?.team_id;
    const client = await getClientForTeam(teamId);

    for (const action of payload.actions ?? []) {
      const handler = this.actions.get(action.action_id);
      if (handler) {
        const ctx: SlackActionContext = {
          action,
          userId: payload.user.id,
          teamId,
          channelId: payload.channel?.id,
          messageTs: payload.message?.ts,
          triggerId: payload.trigger_id,
          responseUrl: payload.response_url,
          client,
        };

        this.runAsync(() => handler(ctx));
      }
    }

    return new NextResponse('', { status: 200 });
  }

  private async handleViewSubmission(payload: any): Promise<NextResponse> {
    const callbackId = payload.view.callback_id;
    const handler = this.views.get(callbackId);

    if (!handler) {
      return new NextResponse('', { status: 200 });
    }

    const teamId = payload.user?.team_id;
    const client = await getClientForTeam(teamId);

    let privateMetadata = {};
    try {
      privateMetadata = JSON.parse(payload.view.private_metadata || '{}');
    } catch { /* ignore parse errors */ }

    const ctx: SlackViewContext = {
      view: payload.view,
      values: payload.view.state.values,
      userId: payload.user.id,
      teamId,
      privateMetadata,
      client,
    };

    try {
      const result = await handler(ctx);
      if (result) return NextResponse.json(result);
      return new NextResponse('', { status: 200 }); // Closes modal
    } catch (error) {
      console.error(`[slack-bot] View submission error ${callbackId}:`, error);
      return NextResponse.json({
        response_action: 'errors',
        errors: { _: 'Something went wrong. Please try again.' },
      });
    }
  }

  private async handleShortcut(payload: any): Promise<NextResponse> {
    // Shortcuts can trigger modals via trigger_id
    // Implement per-shortcut logic as needed
    console.log(`[slack-bot] Shortcut received: ${payload.callback_id}`);
    return new NextResponse('', { status: 200 });
  }

  // ─── Messaging Helpers ────────────────────────────────────────────

  /** Send a message to a channel. */
  async sendMessage(teamId: string, channelId: string, options: {
    text: string;
    blocks?: any[];
    threadTs?: string;
    unfurlLinks?: boolean;
  }) {
    const client = await getClientForTeam(teamId);
    return client.chat.postMessage({
      channel: channelId,
      text: options.text,
      blocks: options.blocks,
      thread_ts: options.threadTs,
      unfurl_links: options.unfurlLinks ?? false,
    });
  }

  /** Send an ephemeral message (visible only to one user). */
  async sendEphemeral(teamId: string, channelId: string, userId: string, text: string) {
    const client = await getClientForTeam(teamId);
    return client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text,
    });
  }

  /** Update an existing message. */
  async updateMessage(teamId: string, channelId: string, ts: string, options: {
    text: string;
    blocks?: any[];
  }) {
    const client = await getClientForTeam(teamId);
    return client.chat.update({
      channel: channelId,
      ts,
      text: options.text,
      blocks: options.blocks,
    });
  }

  /** Open a modal. */
  async openModal(teamId: string, triggerId: string, view: any) {
    const client = await getClientForTeam(teamId);
    return client.views.open({ trigger_id: triggerId, view });
  }

  // ─── Block Kit Builders ───────────────────────────────────────────

  static blocks = {
    header(text: string) {
      return { type: 'header', text: { type: 'plain_text', text } };
    },

    section(text: string) {
      return { type: 'section', text: { type: 'mrkdwn', text } };
    },

    fields(pairs: [string, string][]) {
      return {
        type: 'section',
        fields: pairs.map(([label, value]) => ({
          type: 'mrkdwn',
          text: `*${label}:*\n${value}`,
        })),
      };
    },

    divider() {
      return { type: 'divider' };
    },

    actions(elements: any[]) {
      return { type: 'actions', elements };
    },

    button(text: string, actionId: string, value?: string, style?: 'primary' | 'danger') {
      return {
        type: 'button',
        text: { type: 'plain_text', text },
        action_id: actionId,
        ...(value && { value }),
        ...(style && { style }),
      };
    },

    linkButton(text: string, url: string, actionId: string) {
      return {
        type: 'button',
        text: { type: 'plain_text', text },
        action_id: actionId,
        url,
      };
    },

    context(text: string) {
      return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
    },

    input(blockId: string, label: string, actionId: string, options?: {
      placeholder?: string;
      multiline?: boolean;
      optional?: boolean;
      initialValue?: string;
    }) {
      return {
        type: 'input',
        block_id: blockId,
        optional: options?.optional ?? false,
        label: { type: 'plain_text', text: label },
        element: {
          type: 'plain_text_input',
          action_id: actionId,
          ...(options?.placeholder && { placeholder: { type: 'plain_text', text: options.placeholder } }),
          ...(options?.multiline && { multiline: true }),
          ...(options?.initialValue && { initial_value: options.initialValue }),
        },
      };
    },

    datePicker(blockId: string, label: string, actionId: string, initialDate?: string) {
      return {
        type: 'input',
        block_id: blockId,
        label: { type: 'plain_text', text: label },
        element: {
          type: 'datepicker',
          action_id: actionId,
          ...(initialDate && { initial_date: initialDate }),
        },
      };
    },

    staticSelect(blockId: string, label: string, actionId: string, options: { text: string; value: string }[]) {
      return {
        type: 'input',
        block_id: blockId,
        label: { type: 'plain_text', text: label },
        element: {
          type: 'static_select',
          action_id: actionId,
          options: options.map((o) => ({
            text: { type: 'plain_text', text: o.text },
            value: o.value,
          })),
        },
      };
    },

    modal(callbackId: string, title: string, blocks: any[], options?: {
      submitText?: string;
      privateMetadata?: Record<string, any>;
    }) {
      return {
        type: 'modal',
        callback_id: callbackId,
        title: { type: 'plain_text', text: title },
        submit: { type: 'plain_text', text: options?.submitText ?? 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: options?.privateMetadata ? JSON.stringify(options.privateMetadata) : undefined,
        blocks,
      };
    },
  };

  // ─── Internal Utilities ───────────────────────────────────────────

  private async sendToResponseUrl(url: string, response: SlackResponse) {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });
  }

  private runAsync(fn: () => Promise<void>) {
    fn().catch((err) => console.error('[slack-bot] Async error:', err));
  }

  private async isDuplicateEvent(eventId: string): Promise<boolean> {
    const { data } = await supabase
      .from('slack_processed_events')
      .select('id')
      .eq('event_id', eventId)
      .single();
    return !!data;
  }

  private async markEventProcessed(eventId: string) {
    await supabase.from('slack_processed_events').insert({ event_id: eventId }).onConflict('event_id').ignore();
  }
}

// ─── Example: Wiring It All Up ──────────────────────────────────────────────
/*
  // lib/slack/bot-instance.ts
  import { SlackBot } from './bot';

  export const bot = new SlackBot();

  // Slash command
  bot.command('/invoice', async (ctx) => {
    const [subcommand, ...rest] = ctx.args;

    if (subcommand === 'create') {
      // Open a modal
      await ctx.client.views.open({
        trigger_id: ctx.triggerId,
        view: SlackBot.blocks.modal('create_invoice', 'Create Invoice', [
          SlackBot.blocks.input('customer', 'Customer', 'customer_input', { placeholder: 'Acme Corp' }),
          SlackBot.blocks.input('amount', 'Amount ($)', 'amount_input', { placeholder: '1000.00' }),
          SlackBot.blocks.datePicker('due_date', 'Due Date', 'due_date_input'),
        ], { privateMetadata: { channel: ctx.channelId } }),
      });
      return; // Modal handles the rest
    }

    if (subcommand === 'list') {
      return {
        response_type: 'ephemeral',
        blocks: [
          SlackBot.blocks.header('📄 Recent Invoices'),
          SlackBot.blocks.fields([['INV-001', '$5,000 — Acme Corp'], ['INV-002', '$2,500 — Beta LLC']]),
        ],
      };
    }

    return { response_type: 'ephemeral', text: 'Usage: `/invoice create` or `/invoice list`' };
  });

  // Button action
  bot.action('approve_invoice', async (ctx) => {
    // Update the message to show approved state
    await fetch(ctx.responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        blocks: [
          SlackBot.blocks.section(`✅ Invoice approved by <@${ctx.userId}>`),
        ],
      }),
    });
  });

  // Modal submission
  bot.view('create_invoice', async (ctx) => {
    const customer = ctx.values.customer.customer_input.value;
    const amount = ctx.values.amount.amount_input.value;
    const dueDate = ctx.values.due_date.due_date_input.selected_date;

    if (isNaN(parseFloat(amount))) {
      return { response_action: 'errors', errors: { amount: 'Must be a valid number' } };
    }

    // Create invoice in your system...
    const { channel } = ctx.privateMetadata;
    if (channel) {
      await ctx.client.chat.postMessage({
        channel,
        text: `New invoice created: ${customer} — $${amount} due ${dueDate}`,
      });
    }
  });

  // Event
  bot.event('app_mention', async (ctx) => {
    await ctx.client.chat.postMessage({
      channel: ctx.event.channel,
      thread_ts: ctx.event.ts,
      text: `Hey <@${ctx.event.user}>! How can I help? Try \`/invoice create\` to get started.`,
    });
  });

  // --- Route files ---
  // app/api/webhooks/slack/commands/route.ts
  export async function POST(req) { return bot.handleCommand(req); }

  // app/api/webhooks/slack/events/route.ts
  export async function POST(req) { return bot.handleEvent(req); }

  // app/api/webhooks/slack/interactive/route.ts
  export async function POST(req) { return bot.handleInteractive(req); }
*/

// ─── Database Schema ────────────────────────────────────────────────────────
/*
CREATE TABLE slack_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  team_id TEXT NOT NULL UNIQUE,
  team_name TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  installing_user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE slack_processed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clean up old processed events (run daily)
-- DELETE FROM slack_processed_events WHERE created_at < NOW() - INTERVAL '7 days';
*/
