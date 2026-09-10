import { timingSafeEqual } from "crypto";
import { sendWeeklyAvailabilityReminders } from "@/lib/services/reminders";

// Manual trigger for the weekly reminder. The scheduled run is the
// in-process ticker in src/lib/services/scheduler.ts (Friday 15:00
// Pacific/Auckland); this route exists so you can fire the job by hand —
// after deploying, or to see what a group would be told right now — without
// waiting for Friday. Idempotent: a group already reminded for the upcoming
// week gets nothing (see NotificationLog dedupe), so it's safe to call twice.
//
//   curl -fsS -X POST //     -H "Authorization: Bearer $CRON_SECRET" //     https://your-host/api/cron/weekly-reminder
//
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not configured — refusing to run the weekly reminder job.");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  const provided = request.headers.get("authorization") ?? "";
  if (!isAuthorized(provided, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await sendWeeklyAvailabilityReminders();
  return Response.json(summary);
}

/** Constant-time comparison so the shared secret can't be brute-forced via timing. */
function isAuthorized(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
