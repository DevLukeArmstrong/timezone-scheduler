import { Resend } from "resend";

let client: Resend | undefined;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Thin wrapper around the Resend client — all outbound email (notifications,
 * password reset) goes through this one function. Callers build the
 * HTML/text bodies themselves; see the `*Email()` functions below for the
 * plain-string templates, one per email type. No templating engine — just
 * functions that return strings, per AGENTS.md's "don't build more than the
 * task needs."
 *
 * Email is optional deployment config, not a hard requirement — without
 * RESEND_API_KEY/EMAIL_FROM set, this skips sending and logs why, instead of
 * throwing, so flows like forgot-password degrade to "works, just doesn't
 * email a link" rather than a 500. Setting both later needs no code change.
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

/**
 * Body for the weekly "you have no availability yet" reminder. `isoWeekStart`
 * is the upcoming week's Monday as `yyyy-MM-dd`, for display only — the
 * caller has already decided the user has nothing scheduled.
 */
export function weeklyAvailabilityReminderEmail(
  name: string | null,
  isoWeekStart: string,
): { subject: string; html: string; text: string } {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const calendarUrl = `${appUrl}/calendar`;
  const greeting = name ? `Hi ${name},` : "Hi,";
  const subject = "You have no availability set for next week";
  const text = [
    greeting,
    "",
    `You haven't added any availability for the upcoming week (starting ${isoWeekStart}) yet.`,
    "",
    `Add your availability: ${calendarUrl}`,
  ].join("\n");
  const html = `
    <p>${greeting}</p>
    <p>You haven't added any availability for the upcoming week (starting ${isoWeekStart}) yet.</p>
    <p><a href="${calendarUrl}">Add your availability</a></p>
  `.trim();

  return { subject, html, text };
}
