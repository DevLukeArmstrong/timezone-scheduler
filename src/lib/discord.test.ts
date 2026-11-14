import { describe, expect, it } from "vitest";
import {
  describeFetchFailure,
  discordTimeRange,
  discordTimestamp,
  escapeDiscordMarkdown,
  isDiscordWebhookUrl,
} from "@/lib/discord";

describe("isDiscordWebhookUrl", () => {
  it("accepts the URL Discord's 'Copy Webhook URL' button produces", () => {
    expect(
      isDiscordWebhookUrl(
        "https://discord.com/api/webhooks/1234567890123456789/AbC-dEf_GhI123456789",
      ),
    ).toBe(true);
    expect(isDiscordWebhookUrl("https://discordapp.com/api/webhooks/1/token")).toBe(true);
    expect(isDiscordWebhookUrl("https://discord.com/api/v10/webhooks/1/token")).toBe(true);
  });

  it("rejects anything that isn't a Discord webhook", () => {
    expect(isDiscordWebhookUrl("")).toBe(false);
    expect(isDiscordWebhookUrl("not a url")).toBe(false);
    expect(isDiscordWebhookUrl("http://discord.com/api/webhooks/1/token")).toBe(false);
    expect(isDiscordWebhookUrl("https://example.com/api/webhooks/1/token")).toBe(false);
    expect(isDiscordWebhookUrl("https://discord.com/channels/1/2")).toBe(false);
    expect(isDiscordWebhookUrl("https://evil.com/?u=discord.com/api/webhooks/1/t")).toBe(false);
  });
});

describe("discordTimestamp", () => {
  it("emits Discord's <t:unix:style> markup", () => {
    const instant = new Date("2026-09-11T07:00:00Z");
    expect(discordTimestamp(instant)).toBe("<t:1789110000:f>");
    expect(discordTimestamp(instant, "t")).toBe("<t:1789110000:t>");
  });

  it("shows only the end time for windows shorter than a day", () => {
    const start = new Date("2026-09-11T07:00:00Z");
    const end = new Date("2026-09-11T10:00:00Z");
    expect(discordTimeRange(start, end)).toBe("<t:1789110000:F> – <t:1789120800:t>");
  });

  it("shows both dates for a window spanning a day or more", () => {
    const start = new Date("2026-09-11T07:00:00Z");
    const end = new Date("2026-09-12T08:00:00Z");
    expect(discordTimeRange(start, end)).toBe("<t:1789110000:F> – <t:1789200000:F>");
  });
});

describe("escapeDiscordMarkdown", () => {
  it("neutralises formatting characters in user-supplied names", () => {
    expect(escapeDiscordMarkdown("**bold** _it_ ~x~ `c` |s| > q")).toBe(
      "\\*\\*bold\\*\\* \\_it\\_ \\~x\\~ \\`c\\` \\|s\\| \\> q",
    );
    expect(escapeDiscordMarkdown("Luke")).toBe("Luke");
  });
});

describe("describeFetchFailure", () => {
  /** How Node reports a connection-level failure: opaque outer, real `cause`. */
  function fetchFailure(cause: Error): Error {
    return new Error("fetch failed", { cause });
  }

  it("unwraps the cause instead of reporting 'fetch failed'", () => {
    // The real failure behind a container with no resolver configured.
    const dnsError = Object.assign(new Error("getaddrinfo EAI_AGAIN discord.com"), {
      code: "EAI_AGAIN",
    });
    expect(describeFetchFailure(fetchFailure(dnsError))).toBe(
      "getaddrinfo EAI_AGAIN discord.com",
    );
  });

  it("prepends the code when the cause's message doesn't already name it", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), {
      code: "SOME_OTHER_CODE",
    });
    expect(describeFetchFailure(fetchFailure(refused))).toBe(
      "SOME_OTHER_CODE: connect ECONNREFUSED 10.0.0.1:443",
    );
  });

  it("falls through to the error's own message when there is no cause", () => {
    // What AbortSignal.timeout throws — a cause-less DOMException.
    expect(describeFetchFailure(new Error("The operation was aborted due to timeout"))).toBe(
      "The operation was aborted due to timeout",
    );
  });

  it("survives a non-Error cause, and a non-Error throw", () => {
    expect(describeFetchFailure(new Error("fetch failed", { cause: "nope" }))).toBe(
      "fetch failed",
    );
    expect(describeFetchFailure("not an error at all")).toBe("not an error at all");
  });
});
