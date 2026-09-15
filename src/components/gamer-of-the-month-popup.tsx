import { getGamerOfTheMonth } from "@/lib/services/gamer-of-the-month";
import { GamerOfTheMonthDialog } from "@/components/gamer-of-the-month-dialog";

interface GamerOfTheMonthPopupProps {
  viewer: {
    id: string;
    timezone: string;
    dismissedGamerOfTheMonthId: string | null;
  };
}

/**
 * Server half of the popup: fetches the live feature and decides whether
 * this viewer should see it. Drop it into any signed-in page — the pages
 * already have the `User` row, and the dismissal check is a field
 * comparison on it, so this costs one small query and nothing per-user.
 */
export async function GamerOfTheMonthPopup({ viewer }: GamerOfTheMonthPopupProps) {
  const feature = await getGamerOfTheMonth();
  if (!feature || feature.id === viewer.dismissedGamerOfTheMonthId) return null;

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: viewer.timezone,
  }).format(feature.createdAt);

  return (
    <GamerOfTheMonthDialog
      feature={{
        id: feature.id,
        title: feature.title,
        blurb: feature.blurb,
        imageUrl: feature.imageUrl,
        youtubeVideoId: feature.youtubeVideoId,
        memberName: feature.user.name ?? feature.user.email,
        monthLabel,
      }}
      isViewer={feature.user.id === viewer.id}
    />
  );
}
