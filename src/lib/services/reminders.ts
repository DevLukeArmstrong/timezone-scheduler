import { db, NotificationType } from "@/lib/db";
import { sendEmail, weeklyAvailabilityReminderEmail } from "@/lib/email";
import { userHasAvailabilityInWindow } from "@/lib/services/availability";
import {
  addLocalDays,
  formatLocalDateParts,
  getLocalDateParts,
  getLocalWeekdayIndex,
  localDateAndMinutesToUtc,
} from "@/lib/timezone";

export interface WeeklyReminderSummary {
  usersChecked: number;
  emailsSent: number;
  alreadyHadAvailability: number;
  alreadySent: number;
}

/**
 * For every user with `notifyReminder` on, checks whether they have any
 * availability — one-off or recurring — for the upcoming Mon–Sun week (in
 * their own time zone) and emails a reminder if not. Dedupes on
 * `reminder:<userId>:<isoWeekStart>` via {@link NotificationLog} so running
 * this twice (e.g. an overlapping cron trigger) never double-sends.
 *
 * This is invoked once, at a single fixed UTC instant, by the
 * `/api/cron/weekly-reminder` route — not once per user time zone. Each
 * user's "upcoming week" is still computed in their own zone below; only the
 * *trigger* is global.
 */
export async function sendWeeklyAvailabilityReminders(
  now: Date = new Date(),
): Promise<WeeklyReminderSummary> {
  const users = await db.user.findMany({
    where: { notifyReminder: true },
    select: { id: true, email: true, name: true, timezone: true },
  });

  const summary: WeeklyReminderSummary = {
    usersChecked: users.length,
    emailsSent: 0,
    alreadyHadAvailability: 0,
    alreadySent: 0,
  };

  for (const user of users) {
    const today = getLocalDateParts(now, user.timezone);
    const weekdayIndex = getLocalWeekdayIndex(today, user.timezone);
    const thisWeekMonday = addLocalDays(today, -weekdayIndex, user.timezone);
    const nextMonday = addLocalDays(thisWeekMonday, 7, user.timezone);
    const weekAfterNext = addLocalDays(nextMonday, 7, user.timezone);

    const isoWeekStart = formatLocalDateParts(nextMonday);
    const dedupeKey = `reminder:${user.id}:${isoWeekStart}`;

    const existing = await db.notificationLog.findUnique({ where: { dedupeKey } });
    if (existing) {
      summary.alreadySent++;
      continue;
    }

    const windowStart = localDateAndMinutesToUtc(nextMonday, 0, user.timezone);
    const windowEnd = localDateAndMinutesToUtc(weekAfterNext, 0, user.timezone);

    const hasAvailability = await userHasAvailabilityInWindow(
      user.id,
      windowStart,
      windowEnd,
    );
    if (hasAvailability) {
      summary.alreadyHadAvailability++;
      continue;
    }

    const { subject, html, text } = weeklyAvailabilityReminderEmail(
      user.name,
      isoWeekStart,
    );
    await sendEmail({ to: user.email, subject, html, text });

    await db.notificationLog.create({
      data: { type: NotificationType.REMINDER, userId: user.id, dedupeKey },
    });
    summary.emailsSent++;
  }

  return summary;
}
