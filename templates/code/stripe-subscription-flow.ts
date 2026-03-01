/**
 * Stripe Subscription Flow
 * CodeBakers Agent System — Code Template
 *
 * Usage: Server-side functions for managing the full subscription lifecycle
 * Requires: stripe package, Supabase client, STRIPE_SECRET_KEY env var
 *
 * Covers: checkout creation, plan changes, cancellation, reactivation, customer portal
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────

interface PricingPlan {
  id: string;
  name: string;
  stripe_price_id: string;
  features: string[];
  price_monthly: number;
  price_yearly: number;
}

interface CheckoutOptions {
  userId: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  couponId?: string;
}

// ─── Get or Create Stripe Customer ───────────────────────

async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  // Check if user already has a Stripe customer
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  // Save to profile
  await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  return customer.id;
}

// ─── Create Checkout Session ─────────────────────────────

export async function createCheckoutSession(options: CheckoutOptions): Promise<string> {
  const {
    userId, email, priceId, successUrl, cancelUrl, trialDays, couponId,
  } = options;

  const customerId = await getOrCreateCustomer(userId, email);

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: { user_id: userId },
    subscription_data: {
      metadata: { user_id: userId },
    },
    allow_promotion_codes: !couponId, // Don't allow promo codes if coupon is pre-applied
  };

  // Add trial period
  if (trialDays && trialDays > 0) {
    sessionConfig.subscription_data!.trial_period_days = trialDays;
  }

  // Add specific coupon
  if (couponId) {
    sessionConfig.discounts = [{ coupon: couponId }];
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return session.url!;
}

// ─── Change Subscription Plan ────────────────────────────

export async function changePlan(
  userId: string,
  newPriceId: string,
  prorate: boolean = true
): Promise<{ success: boolean; message: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) {
    return { success: false, message: 'No active subscription found' };
  }

  const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
  const currentItemId = subscription.items.data[0].id;

  await stripe.subscriptions.update(profile.stripe_subscription_id, {
    items: [{ id: currentItemId, price: newPriceId }],
    proration_behavior: prorate ? 'create_prorations' : 'none',
    // If downgrading, you might want to apply at period end:
    // proration_behavior: 'none',
    // cancel_at_period_end: false,
  });

  return { success: true, message: 'Plan updated successfully' };
}

// ─── Cancel Subscription ─────────────────────────────────

export async function cancelSubscription(
  userId: string,
  immediate: boolean = false
): Promise<{ success: boolean; endsAt?: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) {
    return { success: false };
  }

  if (immediate) {
    // Cancel immediately — access revoked now
    await stripe.subscriptions.cancel(profile.stripe_subscription_id);
    return { success: true };
  }

  // Cancel at period end — access continues until billing period ends
  const subscription = await stripe.subscriptions.update(
    profile.stripe_subscription_id,
    { cancel_at_period_end: true }
  );

  const endsAt = new Date(subscription.current_period_end * 1000).toISOString();
  return { success: true, endsAt };
}

// ─── Reactivate Canceled Subscription ────────────────────

export async function reactivateSubscription(
  userId: string
): Promise<{ success: boolean; message: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) {
    return { success: false, message: 'No subscription found' };
  }

  const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);

  // Can only reactivate if currently set to cancel at period end
  if (!subscription.cancel_at_period_end) {
    return { success: false, message: 'Subscription is not scheduled for cancellation' };
  }

  await stripe.subscriptions.update(profile.stripe_subscription_id, {
    cancel_at_period_end: false,
  });

  return { success: true, message: 'Subscription reactivated' };
}

// ─── Get Subscription Status ─────────────────────────────

export async function getSubscriptionStatus(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_status, plan_period_end, plan_cancels_at')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) {
    return {
      status: 'free',
      plan: null,
      periodEnd: null,
      cancelsAt: null,
    };
  }

  return {
    status: profile.plan_status,
    priceId: profile.stripe_price_id,
    periodEnd: profile.plan_period_end,
    cancelsAt: profile.plan_cancels_at,
  };
}

// ─── Create Customer Portal Session ──────────────────────

export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: returnUrl,
  });

  return session.url;
}

// ─── Preview Proration ───────────────────────────────────

export async function previewPlanChange(
  userId: string,
  newPriceId: string
): Promise<{ amount: number; currency: string } | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) return null;

  const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
  const currentItemId = subscription.items.data[0].id;

  const invoice = await stripe.invoices.createPreview({
    customer: subscription.customer as string,
    subscription: profile.stripe_subscription_id,
    subscription_items: [{ id: currentItemId, price: newPriceId }],
    subscription_proration_behavior: 'create_prorations',
  });

  return {
    amount: invoice.total,
    currency: invoice.currency,
  };
}

// ─── API Route Examples ──────────────────────────────────
/*
// app/api/billing/checkout/route.ts
export async function POST(req: Request) {
  const { userId, email, priceId } = await req.json();
  const url = await createCheckoutSession({
    userId,
    email,
    priceId,
    successUrl: `${process.env.NEXT_PUBLIC_URL}/billing/success`,
    cancelUrl: `${process.env.NEXT_PUBLIC_URL}/billing`,
  });
  return NextResponse.json({ url });
}

// app/api/billing/portal/route.ts
export async function POST(req: Request) {
  const { userId } = await req.json();
  const url = await createPortalSession(userId, `${process.env.NEXT_PUBLIC_URL}/billing`);
  return NextResponse.json({ url });
}

// app/api/billing/change-plan/route.ts
export async function POST(req: Request) {
  const { userId, newPriceId } = await req.json();
  const result = await changePlan(userId, newPriceId);
  return NextResponse.json(result);
}

// app/api/billing/cancel/route.ts
export async function POST(req: Request) {
  const { userId, immediate } = await req.json();
  const result = await cancelSubscription(userId, immediate);
  return NextResponse.json(result);
}
*/
