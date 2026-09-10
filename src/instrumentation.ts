/**
 * Runs once when the Next.js server starts (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * This is where the in-process job scheduler is started — the app is
 * self-hosted as a single container, so there's no platform cron to hook
 * into; see src/lib/services/scheduler.ts.
 *
 * Enabled automatically in production. In `next dev` it stays off unless
 * SCHEDULER_ENABLED=true, so a dev server pointed at a database with a real
 * webhook doesn't post reminders to a real channel by accident.
 */
export async function register(): Promise<void> {
  // `register` is called for every runtime; the scheduler needs Node
  // (Prisma, timers) and must never be pulled into an Edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const enabled =
    process.env.SCHEDULER_ENABLED === "true" ||
    (process.env.NODE_ENV === "production" && process.env.SCHEDULER_ENABLED !== "false");
  if (!enabled) return;

  const { startScheduler } = await import("@/lib/services/scheduler");
  startScheduler();
}
