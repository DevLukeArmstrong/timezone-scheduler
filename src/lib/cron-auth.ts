import { timingSafeEqual } from "crypto";

/**
 * Bearer-token gate for the manual-trigger routes under /api/cron/*.
 * Returns a ready-made error response when the request may not proceed,
 * `null` when it may. The scheduled runs don't come through HTTP at all
 * (src/lib/services/scheduler.ts); these routes exist to fire a job by
 * hand, so a missing CRON_SECRET simply means "hand-firing is off".
 */
export function authorizeCronRequest(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not configured — refusing to run a cron route by hand.");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  const provided = request.headers.get("authorization") ?? "";
  if (!isEqual(provided, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Constant-time comparison so the shared secret can't be brute-forced via timing. */
function isEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
