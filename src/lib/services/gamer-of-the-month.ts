import { db, Prisma } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isSiteAdmin } from "@/lib/site-admin";
import { parseYouTubeVideoId } from "@/lib/youtube";

const TITLE_MAX_LENGTH = 80;
const BLURB_MAX_LENGTH = 2000;
const IMAGE_URL_MAX_LENGTH = 2048;

/** The current feature plus the featured member's display fields — what the popup renders. */
export interface GamerOfTheMonthFeature {
  id: string;
  title: string;
  blurb: string;
  imageUrl: string | null;
  youtubeVideoId: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string };
}

const FEATURE_SELECT = {
  id: true,
  title: true,
  blurb: true,
  imageUrl: true,
  youtubeVideoId: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.GamerOfTheMonthSelect;

/**
 * The live feature, or `null` when nothing is published. There is at most
 * one row (see `publishGamerOfTheMonth`), so "the newest" is "the only".
 */
export async function getGamerOfTheMonth(): Promise<GamerOfTheMonthFeature | null> {
  return db.gamerOfTheMonth.findFirst({
    orderBy: { createdAt: "desc" },
    select: FEATURE_SELECT,
  });
}

export interface GamerOfTheMonthInput {
  userId: string;
  title: string;
  blurb: string;
  /** Empty string or undefined clears the picture. */
  imageUrl?: string;
  /** Any YouTube URL form or a bare id (see src/lib/youtube.ts). Empty clears it. */
  youtube?: string;
}

/**
 * Trims and validates the admin form's fields into the exact column values.
 * Throws `ValidationError` with a message the form can show verbatim.
 */
async function normalizeInput(input: GamerOfTheMonthInput) {
  const title = input.title.trim();
  if (!title) {
    throw new ValidationError("A title is required.");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new ValidationError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer.`);
  }

  const blurb = input.blurb.trim();
  if (!blurb) {
    throw new ValidationError("A blurb is required.");
  }
  if (blurb.length > BLURB_MAX_LENGTH) {
    throw new ValidationError(`Blurb must be ${BLURB_MAX_LENGTH} characters or fewer.`);
  }

  const rawImageUrl = input.imageUrl?.trim() ?? "";
  let imageUrl: string | null = null;
  if (rawImageUrl) {
    // Only https: the app itself is served over https, so an http image
    // would be blocked as mixed content and show as broken anyway — better
    // to say so now than after publishing.
    let parsed: URL | null = null;
    try {
      parsed = new URL(rawImageUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== "https:") {
      throw new ValidationError("Image must be a full https:// URL.");
    }
    if (rawImageUrl.length > IMAGE_URL_MAX_LENGTH) {
      throw new ValidationError("Image URL is too long.");
    }
    imageUrl = rawImageUrl;
  }

  const rawYoutube = input.youtube?.trim() ?? "";
  let youtubeVideoId: string | null = null;
  if (rawYoutube) {
    youtubeVideoId = parseYouTubeVideoId(rawYoutube);
    if (!youtubeVideoId) {
      throw new ValidationError(
        "That doesn't look like a YouTube video link — paste the URL from the Share button.",
      );
    }
  }

  const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) {
    throw new NotFoundError("That member no longer exists.");
  }

  return { userId: user.id, title, blurb, imageUrl, youtubeVideoId };
}

function requireSiteAdmin(actingEmail: string): void {
  if (!isSiteAdmin(actingEmail)) {
    throw new ForbiddenError("Only a site admin can change the gamer of the month.");
  }
}

/**
 * Publishes a new feature, replacing whatever was live. Deleting the old
 * row (rather than editing it) is what re-shows the popup to everyone: the
 * new row has a new id, so nobody's `User.dismissedGamerOfTheMonthId`
 * matches it — and the FK's `SET NULL` clears the stale reference anyway.
 * Use `updateGamerOfTheMonth` instead to fix a typo without re-showing it.
 */
export async function publishGamerOfTheMonth(
  actingEmail: string,
  input: GamerOfTheMonthInput,
): Promise<GamerOfTheMonthFeature> {
  requireSiteAdmin(actingEmail);
  const data = await normalizeInput(input);

  const [, created] = await db.$transaction([
    db.gamerOfTheMonth.deleteMany({}),
    db.gamerOfTheMonth.create({ data, select: FEATURE_SELECT }),
  ]);
  return created;
}

/**
 * Edits the live feature in place. Its id doesn't change, so anyone who
 * already dismissed it stays dismissed — this is for fixing a typo or
 * swapping a dead image link, not for a new month.
 */
export async function updateGamerOfTheMonth(
  actingEmail: string,
  id: string,
  input: GamerOfTheMonthInput,
): Promise<GamerOfTheMonthFeature> {
  requireSiteAdmin(actingEmail);
  const data = await normalizeInput(input);

  try {
    return await db.gamerOfTheMonth.update({ where: { id }, data, select: FEATURE_SELECT });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new NotFoundError("There's no current feature to update — it may have been taken down.");
    }
    throw error;
  }
}

/** Removes the live feature (if any). Idempotent. */
export async function takeDownGamerOfTheMonth(actingEmail: string): Promise<void> {
  requireSiteAdmin(actingEmail);
  await db.gamerOfTheMonth.deleteMany({});
}

/**
 * Records that `userId` ticked "don't show this again" on `featureId`. If
 * that feature has since been replaced the write is simply dropped — the
 * user will see the new one, which is right, and there's nothing to tell
 * them about a popup they no longer see.
 */
export async function dismissGamerOfTheMonth(userId: string, featureId: string): Promise<void> {
  const feature = await db.gamerOfTheMonth.findUnique({
    where: { id: featureId },
    select: { id: true },
  });
  if (!feature) return;

  await db.user.update({
    where: { id: userId },
    data: { dismissedGamerOfTheMonthId: feature.id },
  });
}
