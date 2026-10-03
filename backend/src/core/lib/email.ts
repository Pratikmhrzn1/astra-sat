import { Resend } from 'resend';
import { settings } from '../config/env';

/**
 * Transactional email, sent through Resend.
 *
 * Without a Resend key, every message is printed to the server console instead
 * of being sent. Sign-in depends on the verification link, so a dev setup with
 * no key could otherwise never finish a signup.
 *
 * Sending happens after the response, with a few retries. Callers fire and
 * forget (`void mailX(...)`), and a failed send is only ever logged. It never
 * fails the request that triggered it.
 */

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const APP_URL = settings.http.appUrl;
const FROM = settings.email.from.includes('<') ? settings.email.from : `SAT Prep <${settings.email.from}>`;
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

const resend = settings.email.enabled ? new Resend(settings.email.apiKey) : null;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** "24 hours", "1 hour", "30 minutes". */
function ttlPhrase(ms: number): string {
  const hours = ms / 3_600_000;
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.round(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * The house template: dark or orange header band, white card, NIEC footer.
 * `bodyHtml` must already be escaped.
 */
function layout(opts: { heading: string; headerColor: string; bodyHtml: string; footerNote: string }): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:${opts.headerColor};padding:32px 40px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Mock SAT · NIEC</p>
            <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${opts.heading}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid #f0ede7;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
              ${opts.footerNote}<br>
              This email was sent by NIEC · mocktest.niec.edu.np
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const paragraph = (html: string) =>
  `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3a3a3a;">${html}</p>`;

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#E2562B;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:9999px;">${label}</a>`;

const linkFallback = (href: string) =>
  `<p style="margin:24px 0 0;font-size:12.5px;color:#999;line-height:1.6;">
              Or copy this link into your browser:<br>
              <span style="color:#666;word-break:break-all;">${href}</span>
            </p>`;

// ── Templates ────────────────────────────────────────────────────────────────

function verificationEmail(name: string, token: string): RenderedEmail {
  const link = `${APP_URL}/verify-email?token=${token}`;
  const ttl = ttlPhrase(settings.auth.emailVerificationTtlMs);
  return {
    subject: 'Verify your email address — SAT Prep',
    text:
      `Hi ${name},\n\nConfirm your email address to finish setting up your SAT Prep account:\n${link}\n\n` +
      `This link expires in ${ttl}. After you verify, an administrator still needs to approve your account before you can sign in.`,
    html: layout({
      heading: 'Confirm your email',
      headerColor: '#E2562B',
      bodyHtml:
        paragraph(`Hi ${escapeHtml(name)}, thanks for signing up. Confirm your email address to continue — the link expires in <strong>${ttl}</strong>.`) +
        button(link, 'Verify my email →') +
        linkFallback(link) +
        `<p style="margin:24px 0 0;font-size:13.5px;line-height:1.6;color:#666;">After you verify, an administrator will review your account. We'll email you as soon as it's approved.</p>`,
      footerNote: "If you didn't create a SAT Prep account, you can safely ignore this email.",
    }),
  };
}

function passwordResetEmail(name: string, token: string): RenderedEmail {
  const link = `${APP_URL}/reset-password?token=${token}`;
  const ttl = ttlPhrase(settings.auth.passwordResetTtlMs);
  return {
    subject: 'Reset your SAT Prep password',
    text:
      `Hi ${name},\n\nReset your SAT Prep password:\n${link}\n\n` +
      `This link expires in ${ttl}. If you didn't request this, you can ignore this email.`,
    html: layout({
      heading: 'Password reset',
      headerColor: '#0B0B0E',
      bodyHtml:
        paragraph(`Hi ${escapeHtml(name)}, we received a request to reset your password. Click the button below — the link expires in <strong>${ttl}</strong>.`) +
        button(link, 'Reset my password →') +
        linkFallback(link),
      footerNote: "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
    }),
  };
}

function accountApprovedEmail(name: string): RenderedEmail {
  const link = `${APP_URL}/login`;
  return {
    subject: 'Your SAT Prep account is approved',
    text: `Hi ${name},\n\nGood news — your SAT Prep account has been approved. You can sign in now:\n${link}`,
    html: layout({
      heading: "You're approved!",
      headerColor: '#E2562B',
      bodyHtml:
        paragraph(`Hi ${escapeHtml(name)}, good news — an administrator has approved your SAT Prep account. You can sign in and start practising now.`) +
        button(link, 'Sign in →'),
      footerNote: 'You are receiving this because you signed up for SAT Prep.',
    }),
  };
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function deliverOnce(to: string, email: RenderedEmail): Promise<void> {
  // The Resend SDK *resolves* with `{ error }` on an API rejection instead of
  // throwing, so an unverified domain or revoked key would otherwise fail silently.
  const { error } = await resend!.emails.send({ from: FROM, to, subject: email.subject, html: email.html, text: email.text });
  if (error) throw new Error(`Resend rejected the message: ${error.name} — ${error.message}`);
}

async function deliver(to: string, email: RenderedEmail): Promise<void> {
  if (!resend) {
    console.log(`\n[email:dev] to=${to}\n  subject: ${email.subject}\n  ${email.text.replace(/\n/g, '\n  ')}\n`);
    return;
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await deliverOnce(to, email);
      return;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]).unref?.());
    }
  }
}

/**
 * The public entry points. Each one resolves once the message is sent, or
 * rejects after the last retry. Callers `void` them, with a `.catch` that logs.
 */
export function mailEmailVerification(to: string, name: string, token: string): Promise<void> {
  return deliver(to, verificationEmail(name, token));
}

export function mailPasswordReset(to: string, name: string, token: string): Promise<void> {
  return deliver(to, passwordResetEmail(name, token));
}

export function mailAccountApproved(to: string, name: string): Promise<void> {
  return deliver(to, accountApprovedEmail(name));
}
