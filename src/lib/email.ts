import { Resend } from "resend";

let client: Resend | undefined;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Thin wrapper around the Resend client. Email is used for exactly one
 * thing: the password reset link, which has to reach one specific person
 * privately and must work when they're locked out. Everything group-wide
 * goes to Discord instead (src/lib/discord.ts). Callers build the
 * HTML/text bodies themselves; see `passwordResetEmail()` below.
 *
 * Email is optional deployment config, not a hard requirement — without
 * RESEND_API_KEY/EMAIL_FROM set, this skips sending and logs why, instead of
 * throwing, so forgot-password degrades to "works, just doesn't email a
 * link" rather than a 500. Setting both later needs no code change.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn(`Email not configured (RESEND_API_KEY/EMAIL_FROM) — skipped "${subject}" to ${to}.`);
    return;
  }

  client ??= new Resend(apiKey);
  const { error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}

/** Body for the forgot-password reset link email. */
export function passwordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = "Reset your Timezone Scheduler password";
  const text = [
    "We received a request to reset your Timezone Scheduler password.",
    "",
    `Choose a new password: ${resetUrl}`,
    "",
    "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
  ].join("\n");
  const html = `
    <p>We received a request to reset your Timezone Scheduler password.</p>
    <p><a href="${resetUrl}">Choose a new password</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `.trim();

  return { subject, html, text };
}
