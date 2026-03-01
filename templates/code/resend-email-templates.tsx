/**
 * Resend Email Templates (React Email)
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to emails/ directory. Use with React Email + Resend.
 * Requires: @react-email/components, resend packages
 *
 * These are React Email components that compile to cross-client HTML.
 * Preview with: npx react-email dev
 */

import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

// ─── Shared Styles ────────────────────────────────────────

const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://yourapp.com';

const styles = {
  body: {
    backgroundColor: '#f9fafb',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    margin: '0',
    padding: '0',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    margin: '40px auto',
    padding: '0',
    maxWidth: '560px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  content: {
    padding: '32px 40px',
  },
  heading: {
    color: '#111827',
    fontSize: '24px',
    fontWeight: '600' as const,
    lineHeight: '1.3',
    margin: '0 0 16px',
  },
  text: {
    color: '#4b5563',
    fontSize: '16px',
    lineHeight: '1.6',
    margin: '0 0 16px',
  },
  muted: {
    color: '#9ca3af',
    fontSize: '14px',
    lineHeight: '1.5',
    margin: '16px 0 0',
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: '6px',
    color: '#ffffff',
    display: 'inline-block' as const,
    fontSize: '14px',
    fontWeight: '600' as const,
    padding: '12px 24px',
    textDecoration: 'none',
  },
  footer: {
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #e5e7eb',
    padding: '24px 40px',
    textAlign: 'center' as const,
  },
  footerText: {
    color: '#9ca3af',
    fontSize: '12px',
    lineHeight: '1.5',
    margin: '0',
  },
  footerLink: {
    color: '#9ca3af',
    textDecoration: 'underline',
  },
};

// ─── Shared Layout ────────────────────────────────────────

function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ padding: '32px 40px 0' }}>
            <Img
              src={`${baseUrl}/logo.png`}
              alt="Logo"
              height={32}
              style={{ height: '32px', width: 'auto' }}
            />
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              © {new Date().getFullYear()} Your Company. All rights reserved.
            </Text>
            <Text style={styles.footerText}>
              <Link href={`${baseUrl}/unsubscribe`} style={styles.footerLink}>
                Unsubscribe
              </Link>
              {' · '}
              <Link href={`${baseUrl}/privacy`} style={styles.footerLink}>
                Privacy
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Welcome Email ────────────────────────────────────────

interface WelcomeEmailProps {
  name: string;
  dashboardUrl?: string;
}

export function WelcomeEmail({
  name = 'there',
  dashboardUrl = `${baseUrl}/dashboard`,
}: WelcomeEmailProps) {
  return (
    <EmailLayout preview={`Welcome aboard, ${name}!`}>
      <Heading style={styles.heading}>Welcome, {name}!</Heading>
      <Text style={styles.text}>
        Thanks for signing up. We&apos;re excited to have you on board.
      </Text>
      <Text style={styles.text}>Here are a few things to get started:</Text>
      <Text style={{ ...styles.text, paddingLeft: '16px' }}>
        • Complete your profile<br />
        • Explore the dashboard<br />
        • Invite your team
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={dashboardUrl} style={styles.button}>
          Get Started
        </Button>
      </Section>
    </EmailLayout>
  );
}

// ─── Password Reset Email ─────────────────────────────────

interface PasswordResetProps {
  resetUrl: string;
}

export function PasswordResetEmail({
  resetUrl = `${baseUrl}/reset`,
}: PasswordResetProps) {
  return (
    <EmailLayout preview="Reset your password">
      <Heading style={styles.heading}>Password Reset</Heading>
      <Text style={styles.text}>
        You requested a password reset. Click the button below to choose a new
        password.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={resetUrl} style={styles.button}>
          Reset Password
        </Button>
      </Section>
      <Text style={styles.muted}>
        This link expires in 1 hour. If you didn&apos;t request this, you can
        safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

// ─── Team Invite Email ────────────────────────────────────

interface InviteEmailProps {
  inviterName: string;
  teamName: string;
  inviteUrl: string;
}

export function InviteEmail({
  inviterName = 'Someone',
  teamName = 'a team',
  inviteUrl = `${baseUrl}/invite`,
}: InviteEmailProps) {
  return (
    <EmailLayout preview={`${inviterName} invited you to ${teamName}`}>
      <Heading style={styles.heading}>You&apos;re invited!</Heading>
      <Text style={styles.text}>
        <strong>{inviterName}</strong> has invited you to join{' '}
        <strong>{teamName}</strong>.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={inviteUrl} style={styles.button}>
          Accept Invitation
        </Button>
      </Section>
      <Text style={styles.muted}>This invitation expires in 7 days.</Text>
    </EmailLayout>
  );
}

// ─── Payment Receipt Email ────────────────────────────────

interface ReceiptEmailProps {
  amount: string;
  date: string;
  planName: string;
  invoiceUrl: string;
}

export function ReceiptEmail({
  amount = '$29.00',
  date = 'January 1, 2025',
  planName = 'Pro Plan',
  invoiceUrl = `${baseUrl}/invoices`,
}: ReceiptEmailProps) {
  return (
    <EmailLayout preview={`Payment receipt — ${amount}`}>
      <Heading style={styles.heading}>Payment Received</Heading>
      <Text style={styles.text}>Thank you for your payment.</Text>
      <Section
        style={{
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          padding: '20px 24px',
          margin: '16px 0',
        }}
      >
        <Row>
          <Column>
            <Text style={{ ...styles.text, margin: '0', fontWeight: '600' }}>
              {planName}
            </Text>
            <Text style={{ ...styles.muted, margin: '4px 0 0' }}>{date}</Text>
          </Column>
          <Column align="right">
            <Text
              style={{
                ...styles.text,
                margin: '0',
                fontWeight: '600',
                fontSize: '20px',
              }}
            >
              {amount}
            </Text>
          </Column>
        </Row>
      </Section>
      <Section style={{ margin: '24px 0' }}>
        <Button href={invoiceUrl} style={styles.button}>
          View Invoice
        </Button>
      </Section>
    </EmailLayout>
  );
}

// ─── Payment Failed Email ─────────────────────────────────

interface PaymentFailedProps {
  updateUrl: string;
}

export function PaymentFailedEmail({
  updateUrl = `${baseUrl}/billing`,
}: PaymentFailedProps) {
  return (
    <EmailLayout preview="Payment failed — action required">
      <Heading style={styles.heading}>Payment Failed</Heading>
      <Text style={styles.text}>
        We were unable to process your payment. Please update your payment
        method to avoid service interruption.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={updateUrl} style={styles.button}>
          Update Payment Method
        </Button>
      </Section>
      <Text style={styles.muted}>
        We&apos;ll retry the payment automatically in a few days.
      </Text>
    </EmailLayout>
  );
}

// ─── Usage with Resend ────────────────────────────────────
/*
import { Resend } from 'resend';
import { WelcomeEmail } from '@/emails/templates';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'App <noreply@yourdomain.com>',
  to: 'user@example.com',
  subject: 'Welcome aboard!',
  react: WelcomeEmail({ name: 'John' }),
});
*/
