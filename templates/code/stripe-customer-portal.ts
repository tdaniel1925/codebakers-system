/**
 * Stripe Customer Portal Configuration
 * CodeBakers Agent System — Code Template
 *
 * Usage: Run once to configure the Stripe Customer Portal, then use the
 * portal session creator in your billing pages.
 *
 * The Customer Portal lets users self-manage:
 * - Update payment method
 * - View invoices and payment history
 * - Switch plans (upgrade/downgrade)
 * - Cancel subscription
 * - Update billing info (name, address, tax ID)
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// ─── Portal Configuration (Run Once) ─────────────────────
// This configures WHAT users can do in the portal.
// Run this script once or update via Stripe Dashboard.

export async function configurePortal() {
  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: 'Manage your subscription',
      privacy_policy_url: `${process.env.NEXT_PUBLIC_URL}/privacy`,
      terms_of_service_url: `${process.env.NEXT_PUBLIC_URL}/terms`,
    },
    features: {
      // Allow customers to update their payment method
      payment_method_update: {
        enabled: true,
      },
      // Allow customers to view invoice history
      invoice_history: {
        enabled: true,
      },
      // Allow customers to switch between plans
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price', 'promotion_code'],
        proration_behavior: 'create_prorations',
        // Define which products/prices they can switch between
        products: [
          {
            product: process.env.STRIPE_PRODUCT_ID!,
            prices: [
              process.env.STRIPE_PRICE_MONTHLY!,
              process.env.STRIPE_PRICE_YEARLY!,
            ],
          },
        ],
      },
      // Allow customers to cancel
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end', // 'immediately' or 'at_period_end'
        cancellation_reason: {
          enabled: true,
          options: [
            'too_expensive',
            'missing_features',
            'switched_service',
            'unused',
            'other',
          ],
        },
      },
      // Allow customers to pause (optional)
      subscription_pause: {
        enabled: false, // Enable if you support pausing
      },
      // Allow customers to update billing address
      customer_update: {
        enabled: true,
        allowed_updates: ['email', 'address', 'tax_id'],
      },
    },
  });

  console.log('Portal configured:', configuration.id);
  return configuration;
}

// ─── Create Portal Session ───────────────────────────────

export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

// ─── Next.js API Route ───────────────────────────────────
/*
// app/api/billing/portal/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createPortalSession } from '@/lib/stripe/customer-portal';

export async function POST(req: Request) {
  // 1. Authenticate user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Get Stripe customer ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
  }

  // 3. Create portal session
  const url = await createPortalSession(
    profile.stripe_customer_id,
    `${process.env.NEXT_PUBLIC_URL}/settings/billing`
  );

  return NextResponse.json({ url });
}
*/

// ─── Client Component ────────────────────────────────────
/*
// components/ManageBillingButton.tsx
'use client';

import { useState } from 'react';

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? 'Opening...' : 'Manage Billing'}
    </button>
  );
}
*/
