import { Prisma } from "@/lib/db";
import { sendDiscordMessage } from "@/lib/discord";

/**
 * One place a group's Discord posts go. A group has at most one shared
 * channel (`Group.discordWebhookUrl`) plus one per member who has wired up
 * their own server (`GroupMembership.discordWebhookUrl`).
 *
 * Every notification path — new availability, quorum alerts, the weekly
 * reminder — fans out over these, so "who hears about this group" is
 * defined once here rather than three times in three slightly different
 * ways.
 */
export interface GroupDiscordTarget {
  webhookUrl: string;
  /** null for the group's shared channel, else the member whose server it is. */
  memberId: string | null;
}

/**
 * Prisma filter for "this group has somewhere to post". Every job that used
 * to test `discordWebhookUrl: { not: null }` needs this instead: a group
 * whose admin never connected a channel is still live if one member wired
 * up their own server.
 */
export const GROUP_HAS_DISCORD_TARGET = {
  OR: [
    { discordWebhookUrl: { not: null } },
    { memberships: { some: { discordWebhookUrl: { not: null } } } },
  ],
} satisfies Prisma.GroupWhereInput;

/** What {@link collectGroupDiscordTargets} needs loaded off a group. */
export interface GroupWithDiscordTargets {
  discordWebhookUrl: string | null;
  memberships: Array<{ userId: string; discordWebhookUrl: string | null }>;
}

/**
 * The group's channel first, then each member's own server.
 *
 * `excludeMemberId` drops one member's personal target — used for
 * "<name> is free on Friday", where echoing your own action back into your
 * own server is just noise. It never affects the shared channel, which is
 * how the group hears about it.
 */
export function collectGroupDiscordTargets(
  group: GroupWithDiscordTargets,
  options: { excludeMemberId?: string; memberFilter?: (userId: string) => boolean } = {},
): GroupDiscordTarget[] {
  const targets: GroupDiscordTarget[] = [];

  if (group.discordWebhookUrl) {
    targets.push({ webhookUrl: group.discordWebhookUrl, memberId: null });
  }

  for (const membership of group.memberships) {
    if (!membership.discordWebhookUrl) continue;
    if (membership.userId === options.excludeMemberId) continue;
    if (options.memberFilter && !options.memberFilter(membership.userId)) continue;
    targets.push({ webhookUrl: membership.discordWebhookUrl, memberId: membership.userId });
  }

  return targets;
}

export interface DeliveryResult {
  sent: number;
  failed: number;
}

/**
 * Posts `content` to every target, each isolated from the others: one
 * member's revoked webhook must never cost the rest of the group its post,
 * which a single try/catch around the whole loop would do.
 *
 * Returns counts rather than throwing — callers decide what a partial
 * failure means for their own bookkeeping.
 */
export async function deliverToGroupDiscordTargets(
  targets: GroupDiscordTarget[],
  content: string,
  context: string,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0 };

  for (const target of targets) {
    try {
      await sendDiscordMessage(target.webhookUrl, content);
      result.sent++;
    } catch (error) {
      const whose = target.memberId ? `member ${target.memberId}` : "group channel";
      console.error(`${context}: Discord post failed for ${whose}:`, error);
      result.failed++;
    }
  }

  return result;
}
