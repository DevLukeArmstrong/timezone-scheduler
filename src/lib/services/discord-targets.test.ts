import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  collectGroupDiscordTargets,
  deliverToGroupDiscordTargets,
  type GroupWithDiscordTargets,
} from "@/lib/services/discord-targets";
import * as discord from "@/lib/discord";
import { DiscordWebhookError } from "@/lib/discord";

const CHANNEL = "https://discord.com/api/webhooks/1/channel";
const ALICE_HOOK = "https://discord.com/api/webhooks/2/alice";
const BOB_HOOK = "https://discord.com/api/webhooks/3/bob";

function group(overrides: Partial<GroupWithDiscordTargets> = {}): GroupWithDiscordTargets {
  return {
    discordWebhookUrl: CHANNEL,
    memberships: [
      { userId: "alice", discordWebhookUrl: ALICE_HOOK },
      { userId: "bob", discordWebhookUrl: BOB_HOOK },
      { userId: "carol", discordWebhookUrl: null },
    ],
    ...overrides,
  };
}

describe("collectGroupDiscordTargets", () => {
  it("puts the group channel first, then each member's own server", () => {
    expect(collectGroupDiscordTargets(group())).toEqual([
      { webhookUrl: CHANNEL, memberId: null },
      { webhookUrl: ALICE_HOOK, memberId: "alice" },
      { webhookUrl: BOB_HOOK, memberId: "bob" },
    ]);
  });

  it("ignores members who haven't connected one", () => {
    const targets = collectGroupDiscordTargets(group());
    expect(targets.map((t) => t.memberId)).not.toContain("carol");
  });

  // The regression this feature introduces: before it, "no group webhook"
  // meant "nothing to do", and a job that still checked only the group's
  // own column would silently drop a member who wired up their own server.
  it("still has targets when the group itself has no channel", () => {
    expect(collectGroupDiscordTargets(group({ discordWebhookUrl: null }))).toEqual([
      { webhookUrl: ALICE_HOOK, memberId: "alice" },
      { webhookUrl: BOB_HOOK, memberId: "bob" },
    ]);
  });

  it("has nothing to do when neither the group nor any member has one", () => {
    expect(
      collectGroupDiscordTargets({
        discordWebhookUrl: null,
        memberships: [{ userId: "carol", discordWebhookUrl: null }],
      }),
    ).toEqual([]);
  });

  it("excludes the actor's own server but never the group channel", () => {
    const targets = collectGroupDiscordTargets(group(), { excludeMemberId: "alice" });
    expect(targets).toEqual([
      { webhookUrl: CHANNEL, memberId: null },
      { webhookUrl: BOB_HOOK, memberId: "bob" },
    ]);
  });

  it("applies the preference filter to members only, not the channel", () => {
    const targets = collectGroupDiscordTargets(group(), {
      memberFilter: (userId) => userId === "bob",
    });
    expect(targets).toEqual([
      { webhookUrl: CHANNEL, memberId: null },
      { webhookUrl: BOB_HOOK, memberId: "bob" },
    ]);
  });

  it("still posts to the channel when every member has opted out", () => {
    const targets = collectGroupDiscordTargets(group(), { memberFilter: () => false });
    expect(targets).toEqual([{ webhookUrl: CHANNEL, memberId: null }]);
  });

  it("combines exclusion and filtering", () => {
    const targets = collectGroupDiscordTargets(group({ discordWebhookUrl: null }), {
      excludeMemberId: "bob",
      memberFilter: () => true,
    });
    expect(targets).toEqual([{ webhookUrl: ALICE_HOOK, memberId: "alice" }]);
  });
});

describe("deliverToGroupDiscordTargets", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the same content to every target", async () => {
    const send = vi.spyOn(discord, "sendDiscordMessage").mockResolvedValue();

    const result = await deliverToGroupDiscordTargets(
      collectGroupDiscordTargets(group()),
      "hello",
      "test",
    );

    expect(result).toEqual({ sent: 3, failed: 0 });
    expect(send.mock.calls.map(([url]) => url)).toEqual([CHANNEL, ALICE_HOOK, BOB_HOOK]);
    expect(send.mock.calls.every(([, content]) => content === "hello")).toBe(true);
  });

  // The isolation guarantee. A single try/catch around the loop would let
  // one member's revoked webhook cost everyone else their post.
  it("keeps going when one target fails, and counts both outcomes", async () => {
    const send = vi
      .spyOn(discord, "sendDiscordMessage")
      .mockImplementation(async (url: string) => {
        if (url === ALICE_HOOK) throw new DiscordWebhookError("gone", 404);
      });

    const result = await deliverToGroupDiscordTargets(
      collectGroupDiscordTargets(group()),
      "hello",
      "test",
    );

    expect(result).toEqual({ sent: 2, failed: 1 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([url]) => url)).toContain(BOB_HOOK);
  });

  it("reports a total failure as zero sent, so callers can retry", async () => {
    vi.spyOn(discord, "sendDiscordMessage").mockRejectedValue(
      new DiscordWebhookError("Couldn't reach Discord: getaddrinfo EAI_AGAIN discord.com", 0),
    );

    const result = await deliverToGroupDiscordTargets(
      collectGroupDiscordTargets(group()),
      "hello",
      "test",
    );

    expect(result).toEqual({ sent: 0, failed: 3 });
  });

  it("does nothing, successfully, with no targets", async () => {
    const send = vi.spyOn(discord, "sendDiscordMessage").mockResolvedValue();
    expect(await deliverToGroupDiscordTargets([], "hello", "test")).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
