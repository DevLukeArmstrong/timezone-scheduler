/**
 * YouTube video ids are exactly 11 characters from this alphabet. Anything
 * we embed goes into an iframe `src`, so the id is validated strictly
 * rather than passed through — a pasted URL never reaches the page as-is.
 */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * Pulls the video id out of whatever an admin is likely to paste — the
 * share-button `youtu.be/<id>`, a `watch?v=<id>` link (with any extra
 * params like `&t=42`), a `/shorts/<id>`, `/live/<id>` or `/embed/<id>`
 * path, or the bare 11-character id itself. Returns `null` for anything
 * that isn't recognisably a YouTube video, including other YouTube pages
 * (channels, playlists) and any non-YouTube host.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    // A pasted "youtube.com/watch?v=…" without a scheme is still obviously a
    // YouTube link to a human, so give it one before parsing.
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch") {
      candidate = url.searchParams.get("v");
    } else if (
      segments.length === 2 &&
      (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live" || segments[0] === "v")
    ) {
      candidate = segments[1];
    }
  }

  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * The privacy-enhanced embed host: no viewing cookies are set until the
 * viewer actually plays the clip, which matters on a page that opens the
 * embed unprompted in a popup.
 */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

/** Where the "Watch on YouTube" link goes, and what the admin page shows as a preview. */
export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
