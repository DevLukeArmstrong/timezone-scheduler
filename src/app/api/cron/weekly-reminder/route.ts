import { timingSafeEqual } from "crypto";
import { sendWeeklyAvailabilityReminders } from "@/lib/services/reminders";

// This app is self-hosted on Proxmox, not Vercel (see AGENTS.md/README) — so
// there's no platform cron. This route is meant to be triggered externally,
// e.g. a systemd timer or a cron entry on the Proxmox host:
//
//   # Fires at one fixed UTC instant chosen to land Thursday morning NZT
//   # (Wednesday evening in Vancouver) — see sendWeeklyAvailabilityReminders.
//   curl -fsS -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     https://your-host/api/cron/weekly-reminder
//
// Same pattern will be reused by later scheduled jobs (Sessions 10 and 11)
// under /api/cron/*.
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
