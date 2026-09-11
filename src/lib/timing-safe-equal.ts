import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison, so a shared secret (a bearer token, an
 * invite code) can't be brute-forced by measuring how fast a mismatch is
 * rejected. `Buffer.compare`/`===` on unequal-length inputs would return
 * early and leak length/prefix information through timing; this always
 * takes the same time. Shared by every "does this match a server-held
 * secret" check — cron auth and the registration invite code both use it.
 */
export function timingSafeEqualString(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
