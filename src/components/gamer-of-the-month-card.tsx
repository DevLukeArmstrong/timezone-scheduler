import { youTubeEmbedUrl, youTubeWatchUrl } from "@/lib/youtube";

export interface GamerOfTheMonthCardFeature {
  id: string;
  title: string;
  blurb: string;
  imageUrl: string | null;
  youtubeVideoId: string | null;
  memberName: string;
  /** e.g. "September 2026" — the month it was published, in the viewer's zone. */
  monthLabel: string;
}

interface GamerOfTheMonthCardProps {
  feature: GamerOfTheMonthCardFeature;
  /** True when the viewer is the featured member — the copy changes a little. */
  isViewer: boolean;
  /** Rendered below the blurb/clip, inside the padded area — the dialog puts its checkbox and Close button here. */
  footer?: React.ReactNode;
}

/**
 * The feature itself — picture, eyebrow, title, blurb, clip — with no
 * chrome. `GamerOfTheMonthDialog` wraps it in a modal for members; the
 * admin page renders it bare as a preview, so what the curator sees while
 * editing is exactly what the popup will show.
 */
export function GamerOfTheMonthCard({ feature, isViewer, footer }: GamerOfTheMonthCardProps) {
  const titleId = `gotm-title-${feature.id}`;
  const blurbId = `gotm-blurb-${feature.id}`;

  return (
    <article aria-labelledby={titleId} aria-describedby={blurbId}>
      {feature.imageUrl && (
        // A plain <img> on purpose: the URL is admin-pasted and can point
        // anywhere, and `next/image` would need a wildcard remotePattern
        // that turns the optimizer into an open proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={feature.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="max-h-56 w-full shrink-0 bg-zinc-100 object-cover sm:max-h-72 dark:bg-zinc-800"
        />
      )}

      <div className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <span aria-hidden="true">🏆</span>
            Gamer of the month · {feature.monthLabel}
          </p>
          <h2 id={titleId} className="text-xl font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            {feature.title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isViewer ? "That's you, " : "Featuring "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {feature.memberName}
            </span>
            {isViewer ? "!" : ""}
          </p>
        </div>

        <p
          id={blurbId}
          className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
        >
          {feature.blurb}
        </p>

        {feature.youtubeVideoId && (
          <div className="space-y-1.5">
            <iframe
              src={youTubeEmbedUrl(feature.youtubeVideoId)}
              title={`${feature.memberName}'s clip`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full rounded-lg border-0 bg-black"
            />
            <a
              href={youTubeWatchUrl(feature.youtubeVideoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              Watch on YouTube
            </a>
          </div>
        )}

        {footer}
      </div>
    </article>
  );
}
