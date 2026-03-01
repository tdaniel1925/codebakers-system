---
name: GDPR Compliance Specialist
tier: compliance
triggers: GDPR, privacy, consent, data deletion, right to erasure, data portability, cookies, cookie banner, DPA, data processing, cross-border, EU, European, personal data, data subject
depends_on: security.md, database.md, auth.md
conflicts_with: null
prerequisites: null
description: GDPR compliance — consent management, right to erasure, data portability, cookie consent, DPA requirements, cross-border data transfer, privacy by design
code_templates: null
design_tokens: null
---

# GDPR Compliance Specialist

## Role

Ensures applications comply with the EU General Data Protection Regulation. Implements consent management, data subject rights (access, erasure, portability), cookie consent, data processing agreements, and privacy-by-design principles. Applies to any app that serves EU users or processes EU personal data.

## When to Use

- Building any application that serves EU users
- Implementing cookie consent banners
- Building data deletion/erasure flows
- Implementing data export/portability
- Setting up consent management
- Reviewing data processing for GDPR compliance
- Handling cross-border data transfers
- Creating privacy policies and data processing records

## Also Consider

- **Security Engineer** — for encryption and data protection measures
- **Database Engineer** — for implementing soft delete and data anonymization
- **Auth Specialist** — for consent-linked account management
- **Backend Engineer** — for data subject request API endpoints

## Anti-Patterns (NEVER Do)

1. ❌ Pre-checked consent checkboxes — consent must be affirmative action
2. ❌ Bundle consent for unrelated purposes — separate consent per purpose
3. ❌ Make service conditional on unnecessary data consent
4. ❌ Collect data without a documented lawful basis
5. ❌ Ignore data deletion requests or make them unreasonably difficult
6. ❌ Transfer data outside EU/EEA without adequate safeguards
7. ❌ Use dark patterns to discourage privacy choices
8. ❌ Retain data beyond the stated purpose without new consent
9. ❌ Track users before they consent to non-essential cookies
10. ❌ Fail to notify authorities of breaches within 72 hours

## Standards & Patterns

### Lawful Bases for Processing

Every piece of personal data needs a documented lawful basis:

| Basis | When to Use | Example |
|---|---|---|
| **Consent** | User explicitly agrees | Marketing emails, analytics cookies |
| **Contract** | Necessary to fulfill a contract | Processing an order, managing a subscription |
| **Legal obligation** | Required by law | Tax records, financial reporting |
| **Legitimate interest** | Business need balanced against user rights | Fraud prevention, security logging |
| **Vital interest** | Protect someone's life | Emergency health situations |
| **Public task** | Official authority function | Government services |

### Consent Management Schema
```sql
CREATE TABLE public.user_consents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,            -- 'marketing_email', 'analytics', 'third_party_sharing'
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  ip_address INET,
  consent_text TEXT NOT NULL,       -- Exact text shown to user at time of consent
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_consents_user ON user_consents(user_id, purpose);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
```

### Cookie Consent Implementation
```typescript
// Three categories of cookies:
// 1. Strictly Necessary — no consent needed (auth, security, cart)
// 2. Functional — consent required (preferences, language)
// 3. Analytics/Marketing — consent required (GA, tracking pixels)

interface CookieConsent {
  necessary: true;           // Always true, cannot be toggled
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  consentedAt: string;
  version: number;
}

// Only load tracking scripts AFTER consent is granted
function initAnalytics(consent: CookieConsent) {
  if (consent.analytics) {
    // Load GA, Mixpanel, etc.
  }
  if (consent.marketing) {
    // Load Meta Pixel, Google Ads, etc.
  }
}
```

### Right to Erasure (Data Deletion)
```typescript
// lib/actions/gdpr-actions.ts
'use server';

export async function requestDataDeletion(userId: string): Promise<ActionResult<void>> {
  const supabase = await createClient();

  // 1. Verify requesting user matches
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id !== userId) return { success: false, error: 'Unauthorized' };

  // 2. Create deletion request (processed within 30 days)
  await supabase.from('data_deletion_requests').insert({
    user_id: userId,
    status: 'pending',
    requested_at: new Date().toISOString(),
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // 3. Send confirmation email
  await sendEmail({
    to: user.email!,
    subject: 'Data Deletion Request Received',
    html: 'Your request has been received and will be processed within 30 days.',
  });

  return { success: true, data: undefined };
}

// Actual deletion process (run by admin or cron)
export async function processDataDeletion(requestId: string) {
  // 1. Delete or anonymize user data across all tables
  // 2. Remove from third-party services
  // 3. Retain only data required by legal obligation
  // 4. Mark request as completed
  // 5. Send confirmation to user
  // 6. Log the deletion in audit trail (without PII)
}
```

### Right to Data Portability
```typescript
// Export user data in machine-readable format (JSON)
export async function exportUserData(userId: string): Promise<ActionResult<object>> {
  const supabase = await createClient();

  const [profile, orders, consents, activities] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('orders').select('*').eq('user_id', userId),
    supabase.from('user_consents').select('*').eq('user_id', userId),
    supabase.from('user_activities').select('*').eq('user_id', userId),
  ]);

  return {
    success: true,
    data: {
      exported_at: new Date().toISOString(),
      format_version: '1.0',
      profile: profile.data,
      orders: orders.data,
      consents: consents.data,
      activities: activities.data,
    },
  };
}
```

### Privacy by Design Principles
1. **Data minimization** — only collect what you need for the stated purpose
2. **Purpose limitation** — only use data for the purpose it was collected
3. **Storage limitation** — define retention periods, auto-delete when expired
4. **Pseudonymization** — use UUIDs, not names, as primary identifiers
5. **Default privacy** — most restrictive settings by default (opt-in, not opt-out)
6. **Transparency** — clear privacy policy, accessible consent management

### Data Retention Policy
```sql
-- Automated cleanup of expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Delete unverified accounts after 30 days
  DELETE FROM auth.users WHERE email_confirmed_at IS NULL
    AND created_at < now() - INTERVAL '30 days';

  -- Anonymize completed orders older than 7 years (legal retention)
  UPDATE orders SET
    customer_name = 'ANONYMIZED',
    customer_email = 'anonymized@deleted.local',
    shipping_address = NULL
  WHERE status = 'completed'
    AND created_at < now() - INTERVAL '7 years';

  -- Delete analytics data older than 2 years
  DELETE FROM user_activities WHERE created_at < now() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;
```

### Breach Notification
- **72-hour rule:** Notify supervisory authority within 72 hours of becoming aware
- **User notification:** If high risk to individuals, notify them "without undue delay"
- **Documentation:** Record all breaches, even those not reported
- **Assessment:** Document the nature of breach, categories of data, approximate number affected

## Code Templates

No pre-built templates. GDPR compliance is implemented through patterns applied across the application.

## Checklist

Before declaring GDPR compliance work complete:
- [ ] Lawful basis documented for each data processing activity
- [ ] Cookie consent banner implemented with proper categories
- [ ] No tracking scripts loaded before consent
- [ ] Consent records stored with timestamp, version, and exact text
- [ ] Data deletion request flow works end-to-end
- [ ] Data export/portability returns machine-readable format
- [ ] Data retention periods defined and automated cleanup in place
- [ ] Privacy policy accessible and accurate
- [ ] Consent is freely given, specific, informed, and unambiguous
- [ ] Users can withdraw consent as easily as they gave it
- [ ] Breach notification procedure documented (72-hour timeline)
- [ ] Cross-border transfer safeguards in place (if applicable)

## Common Pitfalls

1. **Cookie consent theater** — a banner that loads tracking scripts before the user clicks "Accept" is not compliant. Scripts must wait for affirmative consent.
2. **Deletion isn't deletion** — soft delete is not GDPR erasure. When a user requests deletion, the data must actually be removed or fully anonymized.
3. **Forgot third-party services** — deleting data from your database but leaving it in Mailchimp, analytics, and CRM is incomplete erasure.
4. **Consent bundling** — "I agree to the terms AND marketing emails" is not granular enough. Each purpose needs separate consent.
5. **No retention policy** — "we keep everything forever" is a GDPR violation. Define and enforce retention periods.
