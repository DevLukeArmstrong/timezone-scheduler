import { evaluateDirtyGroupQuorums } from "@/lib/services/quorum";
import {
  REMINDER_TIME_ZONE,
  sendWeeklyAvailabilityReminders,
} from "@/lib/services/reminders";
import {
  getLocalDateParts,
  getLocalMinutesSinceMidnight,
  getLocalWeekdayIndex,
} from "@/lib/timezone";

/**
 * In-process job scheduler. The app runs as a single Node process
 * (`output: "standalone"` in next.config.ts, one `app` container), so a
 * `setInterval` started from `src/instrumentation.ts` is all the cron
 * infrastructure it needs — no scheduler container, no shared secret, and
 * schedules are expressed in a real time zone so NZ daylight saving is
 * handled by the date library instead of a hand-adjusted UTC hour.
 *
 * Every job is idempotent (deduped through `NotificationLog`), which is
 * what makes a dumb once-a-minute tick safe: the tick asks "is anything
 * due?", and a job that already ran answers "no" itself.
 *
 * The `/api/cron/*` routes still exist for triggering a job by hand.
 */

const TICK_MS = 60_000;

/** Friday (Mon = 0) at or after 15:00 in {@link REMINDER_TIME_ZONE}. */
const REMINDER_WEEKDAY = 4;
const REMINDER_START_MINUTE = 15 * 60;

/**
 * Whether `now` falls inside the weekly reminder's send window: Friday
 * afternoon NZ time. The window is the whole afternoon/evening rather than
 * one minute so a tick that lands late (restart, slow DB) still sends;
 * the dedupe key stops it sending twice.
 */
export function isWeeklyReminderDue(now: Date): boolean {
  const today = getLocalDateParts(now, REMINDER_TIME_ZONE);
  if (getLocalWeekdayIndex(today, REMINDER_TIME_ZONE) !== REMINDER_WEEKDAY) return false;
  return getLocalMinutesSinceMidnight(now, REMINDER_TIME_ZONE) >= REMINDER_START_MINUTE;
}

/** One tick: run whichever jobs are due. Exported for tests and manual triggers. */
export async function runScheduledJobs(now: Date = new Date()): Promise<void> {
  // Quorum first: it's the job people are waiting on after adding a slot,
  // and it's usually a no-op (no dirty groups). Each job is isolated so a
  // failure in one never blocks the other.
  try {
    const quorum = await evaluateDirtyGroupQuorums(now);
    if (quorum.postsSent > 0 || quorum.failed > 0) {
      console.log("Quorum alerts:", quorum);
    }
  } catch (error) {
    console.error("Quorum evaluation failed:", error);
  }

  if (isWeeklyReminderDue(now)) {
    const summary = await sendWeeklyAvailabilityReminders(now);
    if (summary.postsSent > 0 || summary.failed > 0) {
      console.log("Weekly reminder:", summary);
    }
  }
}

const globalForScheduler = globalThis as unknown as {
  schedulerTimer: ReturnType<typeof setInterval> | undefined;
};

/**
 * Starts the tick loop. Idempotent across dev-server module reloads (the
 * timer handle is kept on `globalThis`), and never overlaps itself — a
 * tick that's still running when the next one fires is left alone.
 */
export function startScheduler(): void {
  if (globalForScheduler.schedulerTimer) return;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledJobs();
    } catch (error) {
      console.error("Scheduled job failed:", error);
    } finally {
      running = false;
    }
  };

  globalForScheduler.schedulerTimer = setInterval(tick, TICK_MS);
  // Don't keep the process alive just for the timer — lets `next start`
  // exit cleanly on SIGTERM instead of waiting out the interval.
  globalForScheduler.schedulerTimer.unref?.();
  console.log(
    `Scheduler started (tick every ${TICK_MS / 1000}s; quorum alerts after a 2-minute debounce; reminders on Friday 15:00 ${REMINDER_TIME_ZONE}).`,
  );
}
