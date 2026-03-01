/**
 * Resend Transactional Email
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to lib/email/resend.ts
 * Requires: resend package, RESEND_API_KEY env var
 *
 * Provides typed email sending with retry logic, template management,
 * and common transactional email patterns.
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// ─── Types ────────────────────────────────────────────────

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;          // Plain text fallback (recommended)
  from?: string;          // Defaults to configured sender
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ─── Configuration ────────────────────────────────────────

const DEFAULT_FROM = process.env.EMAIL_FROM || 'App <noreply@yourdomain.com>';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ─── Send Email (with retry) ─────────────────────────────

export async function sendEmail(options: EmailOptions): Promise<SendResult> {
  const { to, subject, html, text, from = DEFAULT_FROM, replyTo, tags } = options;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || stripHtml(html),
        reply_to: replyTo,
        tags,
      });

      if (error) {
        console.error(`[email] Attempt ${attempt} failed:`, error);
        if (attempt === MAX_RETRIES) {
          return { success: false, error: error.message };
        }
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      return { success: true, id: data?.id };
    } catch (err) {
      console.error(`[email] Attempt ${attempt} exception:`, err);
      if (attempt === MAX_RETRIES) {
        return { success: false, error: String(err) };
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

// ─── Common Transactional Emails ─────────────────────────

export async function sendWelcomeEmail(to: string, name: string) {
  return sendEmail({
    to,
    subject: 'Welcome aboard!',
    html: emailLayout(`
      <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Welcome, ${escapeHtml(name)}!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Thanks for signing up. We're excited to have you on board.
      </p>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Here are a few things to get started:
      </p>
      <ul style="color: #555; font-size: 16px; line-height: 1.8;">
        <li>Complete your profile</li>
        <li>Explore the dashboard</li>
        <li>Invite your team</li>
      </ul>
      ${emailButton('Get Started', `${process.env.NEXT_PUBLIC_URL}/dashboard`)}
    `),
    tags: [{ name: 'type', value: 'welcome' }],
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: 'Reset your password',
    html: emailLayout(`
      <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Password Reset</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        You requested a password reset. Click the button below to choose a new password.
      </p>
      ${emailButton('Reset Password', resetUrl)}
      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 24px;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
    `),
    tags: [{ name: 'type', value: 'password_reset' }],
  });
}

export async function sendInviteEmail(to: string, inviterName: string, inviteUrl: string) {
  return sendEmail({
    to,
    subject: `${inviterName} invited you to join`,
    html: emailLayout(`
      <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">You've been invited!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        ${escapeHtml(inviterName)} has invited you to join their team.
      </p>
      ${emailButton('Accept Invitation', inviteUrl)}
      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 24px;">
        This invitation expires in 7 days.
      </p>
    `),
    tags: [{ name: 'type', value: 'invite' }],
  });
}

export async function sendPaymentReceiptEmail(
  to: string,
  amount: string,
  invoiceUrl: string
) {
  return sendEmail({
    to,
    subject: `Payment receipt — ${amount}`,
    html: emailLayout(`
      <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Payment Received</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        We received your payment of <strong>${escapeHtml(amount)}</strong>. Thank you!
      </p>
      ${emailButton('View Invoice', invoiceUrl)}
    `),
    tags: [{ name: 'type', value: 'receipt' }],
  });
}

export async function sendPaymentFailedEmail(to: string, updateUrl: string) {
  return sendEmail({
    to,
    subject: 'Payment failed — action required',
    html: emailLayout(`
      <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Payment Failed</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        We were unable to process your payment. Please update your payment method to avoid service interruption.
      </p>
      ${emailButton('Update Payment Method', updateUrl)}
      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 24px;">
        We'll retry the payment automatically in a few days.
      </p>
    `),
    tags: [{ name: 'type', value: 'payment_failed' }],
  });
}

// ─── Email Layout & Helpers ──────────────────────────────

function emailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 0;">
              <img src="${process.env.NEXT_PUBLIC_URL}/logo.png" alt="Logo" height="32" style="height: 32px; width: auto;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 24px 40px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
                © ${new Date().getFullYear()} Your Company. All rights reserved.<br/>
                <a href="${process.env.NEXT_PUBLIC_URL}/unsubscribe" style="color: #9ca3af;">Unsubscribe</a> · 
                <a href="${process.env.NEXT_PUBLIC_URL}/privacy" style="color: #9ca3af;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function emailButton(text: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background-color: #111; border-radius: 6px; padding: 12px 24px;">
          <a href="${url}" style="color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
