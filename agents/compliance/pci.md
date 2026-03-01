---
name: PCI DSS Compliance Specialist
tier: compliance
triggers: PCI, PCI DSS, payment card, credit card, cardholder data, tokenization, Stripe Elements, SAQ, payment security, card data
depends_on: security.md, billing.md
conflicts_with: null
prerequisites: null
description: PCI DSS compliance — tokenization via Stripe, Stripe Elements, secure transmission, SAQ scope reduction, cardholder data environment management
code_templates: null
design_tokens: null
---

# PCI DSS Compliance Specialist

## Role

Ensures applications handling payment card data comply with PCI Data Security Standard. The primary strategy is scope reduction — use Stripe Elements to keep cardholder data off your servers entirely, which dramatically simplifies compliance (SAQ A or SAQ A-EP). Reviews payment flows to ensure card data never touches your infrastructure.

## When to Use

- Implementing payment processing
- Reviewing Stripe integration for PCI compliance
- Ensuring card data never touches your servers
- Completing PCI SAQ (Self-Assessment Questionnaire)
- Auditing payment flows for security
- Setting up Stripe Elements or Checkout

## Also Consider

- **Billing Specialist** — for Stripe subscription and payment implementation
- **Security Engineer** — for general security hardening
- **Frontend Engineer** — for Stripe Elements UI integration
- **Backend Engineer** — for webhook and server-side Stripe integration

## Anti-Patterns (NEVER Do)

1. ❌ Collect card numbers in your own form fields — use Stripe Elements
2. ❌ Store card numbers, CVVs, or full mag stripe data anywhere
3. ❌ Log card numbers in application logs or error reports
4. ❌ Pass card data through your server — use client-side tokenization
5. ❌ Display full card numbers in the UI (show last 4 only)
6. ❌ Send card data via email, chat, or unencrypted channels
7. ❌ Skip TLS for any page that contains payment forms
8. ❌ Use iframes for payment that aren't from Stripe/payment processor

## Standards & Patterns

### Scope Reduction Strategy

The #1 PCI compliance strategy: **never let card data touch your servers.**

| Approach | SAQ Level | Complexity | Recommended |
|---|---|---|---|
| Stripe Checkout (hosted) | SAQ A | Lowest | ✅ Best for most apps |
| Stripe Elements (embedded) | SAQ A-EP | Low | ✅ Good for custom UI |
| Stripe.js + custom form | SAQ A-EP | Medium | ⚠️ Only if Elements won't work |
| Server-side card handling | SAQ D | Very High | ❌ Never do this |

### Stripe Elements Implementation (PCI-Compliant)
```typescript
// components/payment/checkout-form.tsx
'use client';

import { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

export function CheckoutForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    // Card data goes directly from browser to Stripe
    // Your server NEVER sees the card number
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/success`,
      },
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setProcessing(false);
    }
    // If successful, Stripe redirects to return_url
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Stripe Elements renders the card input securely */}
      <PaymentElement />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="mt-4 w-full btn-primary"
      >
        {processing ? 'Processing...' : 'Pay'}
      </button>
    </form>
  );
}
```

### Stripe Provider Setup
```typescript
// components/payment/stripe-provider.tsx
'use client';

import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export function StripeProvider({
  clientSecret,
  children,
}: {
  clientSecret: string;
  children: React.ReactNode;
}) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: 'var(--color-accent)',
            borderRadius: 'var(--radius-md)',
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
```

### Server-Side Payment Intent (No Card Data)
```typescript
// app/api/payments/create-intent/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { amount, currency = 'usd' } = await req.json();

  // Server creates the intent — Stripe handles card collection
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
  });

  // Only the client_secret goes to the browser
  // No card data ever touches this server
  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
  });
}
```

### PCI Compliance Checklist by SAQ Level

**SAQ A (Stripe Checkout — fully hosted):**
- [ ] All payment pages served over HTTPS
- [ ] No card data stored, processed, or transmitted by your systems
- [ ] Stripe Checkout handles entire payment UI
- [ ] Webhook signatures verified for all Stripe events

**SAQ A-EP (Stripe Elements — embedded):**
- All of SAQ A, plus:
- [ ] Payment page does not contain any JavaScript that could intercept card data
- [ ] Stripe.js loaded from `js.stripe.com` (not self-hosted)
- [ ] Content Security Policy allows Stripe domains
- [ ] No card data in form fields, logs, or error reports
- [ ] Regular vulnerability scans on payment pages

### Content Security Policy for Stripe
```typescript
// Include in your CSP header
"connect-src 'self' https://api.stripe.com",
"frame-src https://js.stripe.com https://hooks.stripe.com",
"script-src 'self' https://js.stripe.com",
```

### What You CAN Store
- Stripe Customer ID (`cus_xxx`)
- Stripe Payment Intent ID (`pi_xxx`)
- Stripe Subscription ID (`sub_xxx`)
- Last 4 digits of card (returned by Stripe)
- Card brand (Visa, Mastercard — returned by Stripe)
- Card expiration month/year (returned by Stripe)

### What You CANNOT Store
- Full card number (PAN)
- CVV/CVC/Security code
- Full magnetic stripe data
- PIN or PIN block

## Code Templates

References templates in `templates/code/`:
- `stripe-webhook-handler.ts`
- `stripe-subscription-flow.ts`
- `stripe-customer-portal.ts`

## Checklist

Before declaring PCI compliance work complete:
- [ ] Card data never touches your servers (Stripe Elements or Checkout)
- [ ] All payment pages served over HTTPS/TLS
- [ ] Stripe.js loaded from official CDN (js.stripe.com)
- [ ] Webhook signatures verified on all Stripe endpoints
- [ ] No card data in logs, error reports, or analytics
- [ ] CSP configured to allow Stripe domains
- [ ] Only Stripe tokens/IDs stored in your database
- [ ] SAQ level identified and self-assessment completed
- [ ] Regular vulnerability scanning on payment-related pages
- [ ] Stripe API keys properly managed (secret key server-side only)

## Common Pitfalls

1. **Custom card inputs** — building your own card number field puts you in SAQ D scope. Always use Stripe Elements. There is no reason to handle raw card numbers.
2. **Logging payment data** — error logging libraries can capture form data including card details. Ensure card fields are never in your DOM.
3. **Self-hosting Stripe.js** — Stripe.js must be loaded from `js.stripe.com`. Self-hosting breaks PCI compliance and disables fraud detection.
4. **Forgetting webhook verification** — without signature verification, attackers can send fake payment confirmations to your webhook endpoint.
5. **Mixing environments** — test keys in production or production keys in development causes real charges and compliance issues. Validate environment at startup.
