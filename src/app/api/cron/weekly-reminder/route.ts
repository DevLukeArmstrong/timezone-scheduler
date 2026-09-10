import { authorizeCronRequest } from "@/lib/cron-auth";
import { sendWeeklyAvailabilityReminders } from "@/lib/services/reminders";

// Manual trigger for the weekly reminder. The scheduled run is the
// in-process ticker in src/lib/services/scheduler.ts (Friday 15:00
// Pacific/Auckland); this route exists so you can fire the job by hand —
// after deploying, or to see what a group would be told right now — without
// waiting for Friday. Idempotent: a group already reminded for the upcoming
// week gets nothing (see NotificationLog dedupe), so it's safe to call twice.
//
//   curl -fsS -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     https://your-host/api/cron/weekly-reminder
//
export async function POST(request: Request): Promise<Response> {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const summary = await sendWeeklyAvailabilityReminders();
  return Response.json(summary);
}
