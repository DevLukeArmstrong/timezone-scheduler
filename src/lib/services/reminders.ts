import { db, NotificationType } from "@/lib/db";
import { escapeDiscordMarkdown, sendDiscordMessage } from "@/lib/discord";
import { userHasAvailabilityInWindow } from "@/lib/services/availability";
import {
  addLocalDays,
  formatLocalDateParts,
  getLocalDateParts,
  getLocalWeekdayIndex,
  localDateAndMinutesToUtc,
  type LocalDateParts,
} from "@/lib/timezone";

/**
 * The zone the reminder schedule is expressed in. "Friday afternoon" here
 * is Thursday evening in Vancouver, which is the intended ordering: the
 * NZ side of the group sees it first, everyone has the weekend to fill in.
 */
export const REMINDER_TIME_ZONE = "Pacific/Auckland";

export interface WeeklyReminderSummary {
  groupsChecked: number;
  postsSent: number;
  everyoneHadAvailability: number;
  alreadySent: number;
  /** Groups whose webhook rejected the post; retried on the next tick. */
  failed: number;
}

/**
 * Posts one "add your availability for next week" reminder per group
 * with a Discord webhook, naming the members who have nothing in that
 * group for the upcoming Mon–Sun week. Members with `notifyReminder` off
 * are counted ("and 1 other") but not named.
 *
 * Dedupes on `reminder:<groupId>:<isoWeekStart>` via {@link NotificationLog}
 * so the scheduler's 60-second tick can call this freely all Friday
 * afternoon and only the first call posts. A group where everyone has
 * already added time gets no post at all — silence is the good outcome.
 *
 * "Next week" is the Monday after the current one in
 * {@link REMINDER_TIME_ZONE}; each member's own zone is then used to turn
 * that calendar week into the UTC window their availability is checked
 * against, so a Vancouver member's Monday starts at *their* midnight.
 */
export async function sendWeeklyAvailabilityReminders(
  now: Date = new Date(),
): Promise<WeeklyReminderSummary> {
  const nextMonday = upcomingWeekStart(now, REMINDER_TIME_ZONE);
  const isoWeekStart = formatLocalDateParts(nextMonday);

  const groups = await db.group.findMany({
    where: { discordWebhookUrl: { not: null } },
    select: {
      id: true,
      name: true,
      discordWebhookUrl: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: {
          user: {
            select: { id: true, name: true, email: true, timezone: true, notifyReminder: true },
          },
        },
      },
    },
  });

  const summary: WeeklyReminderSummary = {
    groupsChecked: groups.length,
    postsSent: 0,
    everyoneHadAvailability: 0,
    alreadySent: 0,
    failed: 0,
  };

  for (const group of groups) {
    const dedupeKey = `reminder:${group.id}:${isoWeekStart}`;
    const existing = await db.notificationLog.findUnique({ where: { dedupeKey } });
    if (existing) {
      summary.alreadySent++;
      continue;
    }

    const named: string[] = [];
    let unnamed = 0;
    for (const { user } of group.memberships) {
      const windowStart = localDateAndMinutesToUtc(nextMonday, 0, user.timezone);
      const windowEnd = localDateAndMinutesToUtc(
        addLocalDays(nextMonday, 7, user.timezone),
        0,
        user.timezone,
      );
      const has = await userHasAvailabilityInWindow(user.id, windowStart, windowEnd, group.id);
      if (has) continue;
      if (user.notifyReminder) {
        named.push(escapeDiscordMarkdown(user.name?.trim() || user.email));
      } else {
        unnamed++;
      }
    }

    if (named.length === 0 && unnamed === 0) {
      summary.everyoneHadAvailability++;
      continue;
    }

    const content = weeklyReminderMessage(group.name, nextMonday, named, unnamed);
    try {
      await sendDiscordMessage(group.discordWebhookUrl!, content);
    } catch (error) {
      console.error(`Weekly reminder post failed for group ${group.id}:`, error);
      summary.failed++;
      continue;
    }

    await db.notificationLog.create({
      data: { type: NotificationType.REMINDER, groupId: group.id, dedupeKey },
    });
    summary.postsSent++;
  }

  return summary;
}

/** The Monday after the current local week, as a calendar date in `timeZone`. */
export function upcomingWeekStart(now: Date, timeZone: string): LocalDateParts {
  const today = getLocalDateParts(now, timeZone);
  const weekdayIndex = getLocalWeekdayIndex(today, timeZone);
  const thisWeekMonday = addLocalDays(today, -weekdayIndex, timeZone);
  return addLocalDays(thisWeekMonday, 7, timeZone);
}

/** The message body — exported for tests and for eyeballing the copy. */
export function weeklyReminderMessage(
  groupName: string,
  weekStart: LocalDateParts,
  named: string[],
  unnamed: number,
): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const weekLabel = `week of ${formatLocalDateParts(weekStart)}`;
  const lines = [
    `⏰ **Time to add your availability for next week** (${weekLabel}) · *${escapeDiscordMarkdown(groupName)}*`,
  ];

  const parts = named.map((name) => `**${name}**`);
  if (unnamed > 0) parts.push(`${unnamed} other${unnamed === 1 ? "" : "s"}`);
  lines.push(`Still missing: ${joinNames(parts)}`);
  lines.push(`<${appUrl}>`);

  return lines.join("\n");
}

function joinNames(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
