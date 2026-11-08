/**
 * Discord incoming-webhook client. Group-wide notifications (someone added
 * availability, the weekly reminder, quorum alerts) all post to a channel
 * through one of these; email (src/lib/email.ts) is reserved for password
 * reset, the one message that has to reach a specific person privately.
 *
 * A webhook URL is a bearer credential: anyone holding it can post to that
 * channel. It lives on `Group.discordWebhookUrl`, is only ever read
 * server-side, and is never serialized to the client.
 */

const REQUEST_TIMEOUT_MS = 5_000;

/** Discord caps a webhook message's `content` at 2000 characters. */
export const DISCORD_MAX_CONTENT_LENGTH = 2000;

/**
 * Whether `value` looks like a Discord incoming-webhook URL. Checked on
 * save so a typo (or someone pasting an unrelated URL) fails loudly in the
 * form instead of silently never posting. Only the shape is checked — the
 * "Send test message" button is how you find out it actually works.
 */
export function isDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  if (host !== "discord.com" && host !== "discordapp.com" && host !== "ptb.discord.com" && host !== "canary.discord.com") {
    return false;
  }
  // /api/webhooks/<id>/<token>, optionally with a version segment (/api/v10/...).
  return /^\/api\/(v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname);
}

export class DiscordWebhookError extends Error {
  constructor(
    message: string,
    /** HTTP status Discord answered with, or 0 for a network/timeout failure. */
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscordWebhookError";
  }
}

/**
 * Turns a thrown `fetch` rejection into something a group admin can act on.
 *
 * Node reports every connection-level failure as the same opaque "fetch
 * failed" and hangs the real reason off `error.cause`, so reading only
 * `.message` loses the one piece of information worth having. The
 * difference is "Couldn't reach Discord: fetch failed", which tells you
 * nothing, versus "...: getaddrinfo EAI_AGAIN discord.com", which names a
 * resolver problem outright.
 *
 * A timeout from {@link REQUEST_TIMEOUT_MS} arrives as a cause-less
 * DOMException, so it falls through to its own message.
 */
export function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause;
  if (!(cause instanceof Error)) return error.message;

  // Node's cause message usually already names the code ("getaddrinfo
  // EAI_AGAIN discord.com"), so only prepend it when it doesn't.
  const code = (cause as { code?: unknown }).code;
  if (typeof code === "string" && !cause.message.includes(code)) {
    return `${code}: ${cause.message}`;
  }
  return cause.message;
}

/**
 * Posts one plain-Markdown message to a webhook. Throws
 * {@link DiscordWebhookError} on any failure — callers decide whether that
 * matters: the "test message" form surfaces it, background jobs log and
 * move on (a Discord outage must never fail someone's availability save).
 *
 * `allowed_mentions` is pinned to nothing, so message text can safely
 * contain user-supplied names and no post can ever @everyone a channel.
 */
export async function sendDiscordMessage(webhookUrl: string, content: string): Promise<void> {
  if (content.length > DISCORD_MAX_CONTENT_LENGTH) {
    content = `${content.slice(0, DISCORD_MAX_CONTENT_LENGTH - 1)}…`;
  }

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = describeFetchFailure(error);
    // Logged as well as thrown: every caller but the test-message form
    // swallows this deliberately, so a broken resolver or blocked egress
    // otherwise presents as "the bot stopped posting" with nothing in the
    // logs to explain it. Never log webhookUrl — it's a bearer credential.
    console.error(`[discord] webhook POST failed: ${reason}`);
    throw new DiscordWebhookError(`Couldn't reach Discord: ${reason}`, 0);
  }

  if (!response.ok) {
    // 404/401 mean the webhook was deleted or the token is wrong — the
    // group admin needs to paste a fresh one. 429 is rate limiting (30
    // posts/minute per webhook), which the volumes here never approach.
    console.error(`[discord] webhook POST rejected: HTTP ${response.status}`);
    throw new DiscordWebhookError(
      `Discord rejected the message (HTTP ${response.status}).`,
      response.status,
    );
  }
}

/**
 * Discord renders `<t:unix:style>` in each *viewer's* own time zone, which
 * sidesteps "whose Friday?" entirely for a group spread across NZ and
 * Canada — every member reads the same post in their local time.
 *
 *   f  "9 September 2026 19:00"     F  "Wednesday, 9 September 2026 19:00"
 *   t  "19:00"                      R  "in 3 days"
 */
export function discordTimestamp(instant: Date, style: "f" | "F" | "t" | "R" = "f"): string {
  return `<t:${Math.floor(instant.getTime() / 1000)}:${style}>`;
}

/**
 * "<start> – <end time>" when both fall on the same day for most viewers,
 * else two full timestamps. Discord doesn't expose the viewer's zone, so
 * "same day" is judged by duration: anything under 24h shows a bare end
 * time (the start's date is right there next to it).
 */
export function discordTimeRange(start: Date, end: Date): string {
  const sameDay = end.getTime() - start.getTime() < 24 * 60 * 60 * 1000;
  return `${discordTimestamp(start, "F")} – ${discordTimestamp(end, sameDay ? "t" : "F")}`;
}

/** Escapes Markdown control characters in user-supplied text (names). */
export function escapeDiscordMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>#-])/g, "\\$1");
}
