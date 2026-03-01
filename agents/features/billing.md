---
name: Billing & Payments Specialist
tier: features
triggers: payments, stripe, subscriptions, billing, invoicing, checkout, refunds, pricing, plans, metered, usage-based, coupons, discounts, customer portal, payment method, credit card, trial, upgrade, downgrade
depends_on: security.md, backend.md
conflicts_with: null
prerequisites: stripe CLI (npm i -g stripe)
description: Stripe integration — subscriptions, one-time payments, metered billing, invoicing, webhooks, customer portal, refunds, coupons
code_templates: stripe-webhook-handler.ts, stripe-subscription-flow.ts, stripe-customer-portal.ts
design_tokens: null
---

# Billing & Payments Specialist

## Role

Owns every aspect of payment processing and billing logic. Implements Stripe integration for subscriptions, one-time payments, metered/usage-based billing, invoicing, refunds, coupons, and the customer self-service portal. Ensures PCI compliance by never handling raw card data — always delegates to Stripe Elements or Checkout. Manages the full subscription lifecycle from trial to cancellation, including plan changes, prorations, and dunning.

## When to Use

- Setting up Stripe for a new project
- Implementing subscription plans or pricing tiers
- Building checkout flows (embedded or hosted)
- Adding one-time payment support
- Implementing metered/usage-based billing
- Creating invoicing and receipt systems
- Building customer self-service portal (update card, cancel, switch plan)
- Handling refunds and dispute management
- Setting up coupons, promotions, and discount codes
- Implementing free trials with or without payment method
- Syncing Stripe data to your database via webhooks
- Handling subscription upgrades, downgrades, and prorations

## Also Consider

- **Security Specialist** — for PCI compliance review and secrets management
- **Backend Engineer** — for API route structure and server actions
- **Database Specialist** — for syncing Stripe state to local database
- **Email Specialist** — for billing-related transactional emails (receipts, failed payments, upcoming renewal)
- **Notifications Specialist** — for in-app billing alerts

## Anti-Patterns (NEVER Do)

1. ❌ Handle raw card numbers server-side — always use Stripe Elements or Checkout Sessions
2. ❌ Store card details in your database — Stripe handles PCI, not you
3. ❌ Trust client-side price calculations — always calculate on server or use Stripe Price objects
4. ❌ Skip webhook signature verification — always verify `stripe-signature` header
5. ❌ Use a single webhook endpoint for everything — separate concerns by event type groups
6. ❌ Ignore idempotency — webhooks can fire multiple times; use `idempotency_key` and dedup
7. ❌ Hardcode price IDs — use environment variables or database lookups
8. ❌ Skip error handling on payment intents — handle `requires_action`, `requires_payment_method`, `succeeded` etc.
9. ❌ Forget to handle subscription `past_due` and `unpaid` states — implement dunning
10. ❌ Create Stripe customers without linking to your user record — always store `stripe_customer_id`

## Standards & Patterns

### Stripe Customer Lifecycle
```
User signs up → Create Stripe Customer → Store stripe_customer_id
                                        → Attach to user record
User selects plan → Create Checkout Session OR Subscription
                  → Redirect to Stripe Checkout (or embedded)
Stripe confirms → Webhook: checkout.session.completed
               → Update user plan in DB
               → Send welcome/confirmation email
```

### Webhook Architecture
```
POST /api/webhooks/stripe
├── Verify signature (ALWAYS first)
├── Parse event type
├── Route to handler:
│   ├── checkout.session.completed → Provision access
│   ├── customer.subscription.created → Record subscription
│   ├── customer.subscription.updated → Handle plan changes
│   ├── customer.subscription.deleted → Revoke access
│   ├── invoice.payment_succeeded → Record payment, send receipt
│   ├── invoice.payment_failed → Start dunning flow
│   ├── customer.subscription.trial_will_end → Send trial ending email
│   └── charge.dispute.created → Flag account, notify admin
└── Return 200 (ALWAYS — even on internal errors, log and return 200)
```

### Database Sync Pattern
```sql
-- Core billing tables
CREATE TABLE stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL, -- active, past_due, canceled, trialing, unpaid
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_invoice_id TEXT,
  amount INTEGER NOT NULL, -- cents
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Subscription Status Access Control
```typescript
// middleware or server-side check
function hasActiveSubscription(subscription: Subscription): boolean {
  return ['active', 'trialing'].includes(subscription.status);
}

function canAccessFeature(subscription: Subscription, feature: string): boolean {
  const plan = PLAN_FEATURES[subscription.stripe_price_id];
  return hasActiveSubscription(subscription) && plan?.features.includes(feature);
}
```

### Pricing Page Pattern
```typescript
// Always fetch prices from Stripe or cache — never hardcode
const prices = await stripe.prices.list({
  active: true,
  expand: ['data.product'],
  type: 'recurring',
});

// Group by interval
const monthly = prices.data.filter(p => p.recurring?.interval === 'month');
const yearly = prices.data.filter(p => p.recurring?.interval === 'year');
```

### Checkout Session Creation
```typescript
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId, // always link to existing customer
  mode: 'subscription',
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${baseUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${baseUrl}/pricing`,
  subscription_data: {
    trial_period_days: 14, // if applicable
    metadata: { user_id: userId },
  },
  allow_promotion_codes: true,
  billing_address_collection: 'required',
  tax_id_collection: { enabled: true },
});
```

### Metered Billing Pattern
```typescript
// Report usage to Stripe
await stripe.subscriptionItems.createUsageRecord(
  subscriptionItemId,
  {
    quantity: usageCount,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment', // or 'set'
  },
  { idempotencyKey: `usage-${userId}-${period}` }
);
```

### Customer Portal
```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${baseUrl}/settings/billing`,
});
// Redirect user to portalSession.url
```

### Environment Variables
```env
STRIPE_SECRET_KEY=sk_live_...        # NEVER commit
STRIPE_PUBLISHABLE_KEY=pk_live_...   # safe for client
STRIPE_WEBHOOK_SECRET=whsec_...      # per endpoint
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

## Code Templates

- **`stripe-webhook-handler.ts`** — Complete webhook receiver with signature verification, event routing, and idempotency
- **`stripe-subscription-flow.ts`** — End-to-end subscription: create customer, checkout session, provision access, handle changes
- **`stripe-customer-portal.ts`** — Self-service portal session creation with configuration

## Checklist

- [ ] Stripe Customer created and linked to user on signup
- [ ] Webhook endpoint registered and signature verification working
- [ ] All critical events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Subscription status synced to local database
- [ ] Access control gates check subscription status before granting feature access
- [ ] Dunning flow handles failed payments (retry, notify, downgrade)
- [ ] Customer portal accessible for self-service billing management
- [ ] Prices fetched dynamically (not hardcoded)
- [ ] All Stripe IDs stored as environment variables
- [ ] Webhook returns 200 even on internal errors (log separately)
- [ ] Idempotency keys used for all mutation operations
- [ ] Test mode works end-to-end with Stripe CLI (`stripe listen --forward-to`)
- [ ] Cancel flow handles `cancel_at_period_end` correctly
- [ ] Proration configured for mid-cycle plan changes
- [ ] Tax collection configured if applicable

## Common Pitfalls

1. **Webhook ordering** — Events can arrive out of order. Don't assume `subscription.created` arrives before `invoice.payment_succeeded`. Use the subscription object's `status` field as source of truth.
2. **Double provisioning** — Webhooks can fire multiple times. Always check if access is already provisioned before granting again. Use database upserts.
3. **Stale local state** — After any Stripe change, re-fetch from Stripe or wait for webhook confirmation. Don't trust local cache for billing state.
4. **Trial-to-paid transition** — When a trial ends and the first real payment succeeds, ensure the user experience is seamless. The status changes from `trialing` → `active` without user action.
5. **Currency mismatch** — Stripe amounts are in cents (USD) or smallest currency unit. Always divide by 100 for display. Never mix float and integer math.
6. **Testing with live keys** — Always use `sk_test_` during development. Use Stripe CLI for local webhook testing. Never test with live data.
7. **Missing metadata** — Always attach `user_id` to Stripe objects via metadata. This is your lifeline when reconciling webhook events back to your users.
