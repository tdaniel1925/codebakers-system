/**
 * Stripe Webhook Handler
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to app/api/webhooks/stripe/route.ts
 * Requires: stripe package, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars
 *
 * Handles all critical Stripe webhook events with:
 * - Signature verification
 * - Idempotent event processing
 * - Typed event routing
 * - Error isolation per handler
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Admin client for webhook processing (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Event Handlers ───────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) throw new Error('Missing user_id in session metadata');

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Link Stripe customer to user
  await supabase
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      plan_status: 'active',
    })
    .eq('id', userId);

  // If subscription, fetch plan details
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price.id;

    await supabase
      .from('profiles')
      .update({
        stripe_price_id: priceId,
        plan_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      })
      .eq('id', userId);
  }

  console.log(`[stripe] Checkout completed for user ${userId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  const updateData: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan_status: subscription.status, // active, past_due, canceled, etc.
    plan_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  };

  // Handle cancellation at period end
  if (subscription.cancel_at_period_end) {
    updateData.plan_cancels_at = new Date(subscription.current_period_end * 1000).toISOString();
  } else {
    updateData.plan_cancels_at = null;
  }

  await supabase
    .from('profiles')
    .update(updateData)
    .eq('stripe_customer_id', customerId);

  console.log(`[stripe] Subscription ${subscription.id} updated: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  await supabase
    .from('profiles')
    .update({
      plan_status: 'canceled',
      stripe_subscription_id: null,
      stripe_price_id: null,
    })
    .eq('stripe_customer_id', customerId);

  console.log(`[stripe] Subscription ${subscription.id} deleted`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Record payment
  await supabase.from('payments').insert({
    stripe_customer_id: customerId,
    stripe_invoice_id: invoice.id,
    amount_cents: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    invoice_url: invoice.hosted_invoice_url,
    paid_at: new Date((invoice.status_transitions?.paid_at ?? Date.now() / 1000) * 1000).toISOString(),
  });

  console.log(`[stripe] Invoice ${invoice.id} paid: ${invoice.amount_paid}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Update user status
  await supabase
    .from('profiles')
    .update({ plan_status: 'past_due' })
    .eq('stripe_customer_id', customerId);

  // Record failed payment for dunning
  await supabase.from('payments').insert({
    stripe_customer_id: customerId,
    stripe_invoice_id: invoice.id,
    amount_cents: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    paid_at: null,
  });

  // TODO: Trigger dunning email via Email Specialist
  console.log(`[stripe] Invoice ${invoice.id} FAILED for customer ${customerId}`);
}

// ─── Event Router ─────────────────────────────────────────

type EventHandler = (data: any) => Promise<void>;

const EVENT_HANDLERS: Record<string, EventHandler> = {
  'checkout.session.completed': handleCheckoutCompleted,
  'customer.subscription.created': handleSubscriptionUpdated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.payment_succeeded': handleInvoicePaymentSucceeded,
  'invoice.payment_failed': handleInvoicePaymentFailed,
};

// ─── Idempotency Check ───────────────────────────────────

async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('event_id', eventId)
    .single();
  return !!data;
}

async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  await supabase.from('stripe_events').insert({
    event_id: eventId,
    event_type: eventType,
    processed_at: new Date().toISOString(),
  });
}

// ─── Main Handler ─────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  // 1. Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[stripe] Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Idempotency check — skip already-processed events
  if (await isEventProcessed(event.id)) {
    console.log(`[stripe] Event ${event.id} already processed, skipping`);
    return NextResponse.json({ received: true, skipped: true });
  }

  // 3. Route to handler
  const handler = EVENT_HANDLERS[event.type];
  if (!handler) {
    console.log(`[stripe] Unhandled event type: ${event.type}`);
    return NextResponse.json({ received: true });
  }

  // 4. Process event (isolated error handling)
  try {
    await handler(event.data.object);
    await markEventProcessed(event.id, event.type);
    console.log(`[stripe] Processed ${event.type} (${event.id})`);
  } catch (err) {
    console.error(`[stripe] Error processing ${event.type}:`, err);
    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Required Database Tables ─────────────────────────────
/*
-- Idempotency tracking
CREATE TABLE stripe_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payment history
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  stripe_invoice_id TEXT,
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL, -- 'succeeded', 'failed', 'refunded'
  invoice_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add to profiles table:
ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN stripe_price_id TEXT;
ALTER TABLE profiles ADD COLUMN plan_status TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN plan_period_end TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN plan_cancels_at TIMESTAMPTZ;
*/
