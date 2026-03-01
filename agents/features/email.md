---
name: Email Specialist
tier: features
triggers: email, resend, transactional, newsletter, email template, branded email, deliverability, DNS, DKIM, SPF, DMARC, welcome email, notification email, receipt, password reset email
depends_on: backend.md, frontend.md
conflicts_with: null
prerequisites: resend (npm i resend)
description: Resend integration — transactional emails, branded templates, deliverability, DNS setup, React Email components
code_templates: resend-transactional.ts, resend-email-templates.tsx
design_tokens: null
---

# Email Specialist

## Role

Owns all email sending, templating, and deliverability. Implements transactional emails using Resend with React Email components for beautiful, branded templates. Handles DNS configuration (SPF, DKIM, DMARC) for maximum deliverability. Manages all email types: welcome, password reset, invoices, notifications, digests, and marketing. Ensures emails render correctly across all major clients (Gmail, Outlook, Apple Mail).

## When to Use

- Setting up email sending for a new project
- Building transactional email templates (welcome, receipt, password reset)
- Configuring DNS for email deliverability
- Creating branded email templates matching the app's design system
- Implementing email notification preferences
- Building email digest/summary systems
- Debugging email deliverability issues
- Setting up email analytics and tracking

## Also Consider

- **Billing Specialist** — for receipt and invoice emails
- **Auth Specialist** — for password reset and verification emails
- **Notifications Specialist** — for coordinating email with in-app and push notifications
- **Frontend Engineer** — for shared design tokens between app and email templates

## Anti-Patterns (NEVER Do)

1. ❌ Send emails from API routes without rate limiting — implement per-user send limits
2. ❌ Use complex CSS in email templates — stick to inline styles and table layouts for compatibility
3. ❌ Skip email previews — always test in Resend's preview mode before production
4. ❌ Hardcode email content in send calls — always use template components
5. ❌ Send HTML without a plain text fallback — always include both
6. ❌ Use images without alt text in emails — accessibility matters in email too
7. ❌ Forget unsubscribe links in non-critical emails — legally required (CAN-SPAM, GDPR)
8. ❌ Send from `noreply@` for emails that need replies — use monitored addresses
9. ❌ Embed large images — use hosted images with absolute URLs
10. ❌ Skip email verification on signup — always verify before sending non-essential emails

## Standards & Patterns

### Resend Setup
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Standard send pattern
const { data, error } = await resend.emails.send({
  from: 'App Name <notifications@yourdomain.com>',
  to: [userEmail],
  subject: 'Subject line',
  react: EmailTemplate({ props }),
  text: plainTextVersion, // always include
  headers: {
    'X-Entity-Ref-ID': uniqueId, // prevents threading in Gmail
  },
  tags: [
    { name: 'category', value: 'transactional' },
    { name: 'user_id', value: userId },
  ],
});
```

### Email Template Architecture
```
templates/email/
├── components/          (shared email components)
│   ├── email-header.tsx
│   ├── email-footer.tsx
│   ├── email-button.tsx
│   └── email-card.tsx
├── welcome.tsx
├── password-reset.tsx
├── invoice-receipt.tsx
├── trial-ending.tsx
├── payment-failed.tsx
└── weekly-digest.tsx
```

### React Email Component Pattern
```tsx
import {
  Html, Head, Body, Container, Section,
  Text, Button, Img, Hr, Preview,
} from '@react-email/components';

interface WelcomeEmailProps {
  userName: string;
  actionUrl: string;
}

export function WelcomeEmail({ userName, actionUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to {appName} — let's get started</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Img
            src={`${baseUrl}/logo.png`}
            width="120"
            height="40"
            alt="App Name"
          />
          <Text style={headingStyle}>Welcome, {userName}!</Text>
          <Text style={textStyle}>
            Thanks for joining. Here's what you can do next...
          </Text>
          <Button style={buttonStyle} href={actionUrl}>
            Get Started
          </Button>
          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            © {new Date().getFullYear()} Company Name. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### Email Style Constants
```typescript
// Inline styles for cross-client compatibility
const bodyStyle = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const containerStyle = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
  borderRadius: '8px',
};

const buttonStyle = {
  backgroundColor: '#000000', // use brand color
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
};
```

### DNS Configuration (Deliverability)
```
Required DNS records for sending domain:

SPF:  TXT  "v=spf1 include:resend.com ~all"
DKIM: CNAME  resend._domainkey → provided by Resend
DMARC: TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"

Verify all records in Resend dashboard before sending.
```

### Email Categories and When to Send
```
CRITICAL (always send, no unsubscribe):
- Password reset
- Email verification
- Security alerts (new login, password changed)
- Payment receipts (legal requirement)

TRANSACTIONAL (send by default, can suppress):
- Welcome email
- Subscription confirmation
- Trial ending reminder
- Payment failed notice
- Account changes

OPTIONAL (respect preferences):
- Weekly digest
- Feature announcements
- Tips and tutorials
- Re-engagement
```

### Email Preferences Schema
```sql
CREATE TABLE email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  transactional BOOLEAN DEFAULT TRUE,  -- welcome, confirmations
  product_updates BOOLEAN DEFAULT TRUE, -- features, tips
  marketing BOOLEAN DEFAULT FALSE,      -- promos, newsletters
  digest_frequency TEXT DEFAULT 'weekly', -- daily, weekly, monthly, never
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Rate Limiting Pattern
```typescript
// Per-user email rate limiting
const LIMITS = {
  transactional: { max: 10, window: '1h' },
  marketing: { max: 1, window: '24h' },
  digest: { max: 1, window: '24h' },
};
```

### Email Queue Pattern (for bulk or scheduled)
```typescript
// Use a queue for non-critical emails
async function queueEmail(params: EmailParams) {
  await supabase.from('email_queue').insert({
    to: params.to,
    template: params.template,
    props: params.props,
    scheduled_for: params.scheduledFor || new Date(),
    status: 'pending',
  });
}

// Process queue via cron or edge function
async function processEmailQueue() {
  const pending = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(50);

  for (const email of pending.data) {
    try {
      await resend.emails.send(/* ... */);
      await supabase.from('email_queue')
        .update({ status: 'sent', sent_at: new Date() })
        .eq('id', email.id);
    } catch (err) {
      await supabase.from('email_queue')
        .update({ status: 'failed', error: err.message, attempts: email.attempts + 1 })
        .eq('id', email.id);
    }
  }
}
```

## Code Templates

- **`resend-transactional.ts`** — Server-side email sending utility with error handling, rate limiting, and preference checking
- **`resend-email-templates.tsx`** — React Email component library: welcome, reset, receipt, notification, and digest templates

## Checklist

- [ ] Resend API key configured in environment variables
- [ ] DNS records (SPF, DKIM, DMARC) verified for sending domain
- [ ] All email templates built as React Email components
- [ ] Plain text fallback included for every email
- [ ] Preview text set for every email template
- [ ] Email preferences table created and respected
- [ ] Unsubscribe link included in all non-critical emails
- [ ] Rate limiting implemented per user per email category
- [ ] Critical emails (password reset, security) bypass preferences
- [ ] Email queue implemented for non-time-sensitive sends
- [ ] All images use absolute URLs and include alt text
- [ ] Tested rendering in Gmail, Outlook, and Apple Mail
- [ ] From address uses verified custom domain (not default)
- [ ] `X-Entity-Ref-ID` header prevents unwanted Gmail threading
- [ ] Email analytics tags attached for tracking

## Common Pitfalls

1. **Gmail clipping** — Gmail clips emails over 102KB. Keep templates lean, avoid embedding large CSS or images.
2. **Outlook rendering** — Outlook uses Word's renderer. Stick to table-based layouts and avoid modern CSS (flexbox, grid, border-radius inconsistency).
3. **Dark mode** — Email clients apply dark mode differently. Use transparent images, avoid white logos on assumed-white backgrounds.
4. **Thread hijacking** — Gmail groups emails by subject and headers. Use unique `X-Entity-Ref-ID` headers for transactional emails that shouldn't thread.
5. **Deliverability drops** — Monitor bounce rates. Remove hard bounces immediately. Warm up new sending domains gradually (start with 50-100/day, increase over 2 weeks).
6. **Reply-to confusion** — Set `reply-to` to a monitored address even when sending from a system address. Users will reply to automated emails.
