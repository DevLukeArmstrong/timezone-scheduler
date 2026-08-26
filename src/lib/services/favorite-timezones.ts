import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { isValidTimeZone } from "@/lib/timezone";

/** Generous but bounded — this is a short list for a live conversion preview, not a directory. */
export const MAX_FAVORITE_TIME_ZONES = 8;

export async function listFavoriteTimeZones(userId: string): Promise<string[]> {
  const rows = await db.favoriteTimeZone.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { timeZone: true },
  });
  return rows.map((row) => row.timeZone);
}

/**
 * Replaces a user's whole favorite-time-zone list, in the given order.
 * Validates each zone, drops duplicates (keeping the first occurrence), and
 * rejects lists longer than {@link MAX_FAVORITE_TIME_ZONES}. Deleting and
 * recreating in one transaction is simpler than diffing against the existing
 * rows, and this list is short enough that it's cheap either way.
 */
export async function setFavoriteTimeZones(
  userId: string,
  timeZones: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of timeZones) {
    const timeZone = raw.trim();
    if (!timeZone || seen.has(timeZone)) continue;
    if (!isValidTimeZone(timeZone)) {
      throw new ValidationError(`"${timeZone}" is not a recognized IANA time zone identifier.`);
    }
    seen.add(timeZone);
    deduped.push(timeZone);
  }

  if (deduped.length > MAX_FAVORITE_TIME_ZONES) {
    throw new ValidationError(
      `You can save at most ${MAX_FAVORITE_TIME_ZONES} favorite time zones.`,
    );
  }

  await db.$transaction([
    db.favoriteTimeZone.deleteMany({ where: { userId } }),
    db.favoriteTimeZone.createMany({
      data: deduped.map((timeZone, index) => ({ userId, timeZone, position: index })),
    }),
  ]);

  return deduped;
}
