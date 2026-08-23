import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? 'noreply@mocktest.niec.edu.np';
const BASE_URL = process.env.PUBLIC_BASE_URL ?? 'https://mocktest.niec.edu.np/sat';

export async function sendWelcomeEmail(to: string, name: string, password: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  await resend.emails.send({
    from: `SAT Prep <${FROM}>`,
    to,
    subject: 'Welcome to SAT Prep — your account details',
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:#E2562B;padding:32px 40px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.75);">Mock SAT · NIEC</p>
            <h1 style="margin:8px 0 0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Welcome, ${name}!</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3a3a3a;">
              Your SAT Prep account is ready. Use the details below to sign in and start practising.
            </p>
            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;border:1px solid #e8e4dd;border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;">Your login details</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#888;padding-bottom:8px;padding-right:16px;">Email</td>
                      <td style="font-size:13px;font-weight:600;color:#0B0B0E;padding-bottom:8px;">${to}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#888;padding-right:16px;">Password</td>
                      <td style="font-size:13px;font-weight:600;color:#0B0B0E;">${password}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:13.5px;line-height:1.6;color:#666;">
              Keep these credentials safe. You can change your password anytime from your profile settings.
            </p>
            <a href="https://mocktest.niec.edu.np/sat" style="display:inline-block;background:#E2562B;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:9999px;">Go to SAT Prep →</a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid #f0ede7;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
              This email was sent by NIEC · mocktest.niec.edu.np<br>
              If you did not create this account, please ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

  await resend.emails.send({
    from: `SAT Prep <${FROM}>`,
    to,
    subject: 'Reset your SAT Prep password',
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#0B0B0E;padding:32px 40px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.45);">Mock SAT · NIEC</p>
            <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Password reset</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3a3a3a;">
              Hi ${name}, we received a request to reset your password. Click the button below — the link expires in <strong>1 hour</strong>.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#E2562B;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:9999px;">Reset my password →</a>
            <p style="margin:24px 0 0;font-size:12.5px;color:#999;line-height:1.6;">
              Or copy this link into your browser:<br>
              <span style="color:#666;word-break:break-all;">${resetUrl}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid #f0ede7;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
              If you didn't request a password reset, you can safely ignore this email — your password will not change.<br>
              This email was sent by NIEC · mocktest.niec.edu.np
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
