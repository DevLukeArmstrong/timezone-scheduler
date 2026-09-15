import { describe, expect, it } from "vitest";
import { parseYouTubeVideoId, youTubeEmbedUrl } from "@/lib/youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeVideoId", () => {
  it("accepts every URL shape the share/address bar produces", () => {
    expect(parseYouTubeVideoId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://youtu.be/${ID}?t=42`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PLx`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`  ${ID}  `)).toBe(ID);
  });

  it("rejects things that aren't a single YouTube video", () => {
    expect(parseYouTubeVideoId("")).toBeNull();
    expect(parseYouTubeVideoId("not a url")).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/playlist?list=PLx")).toBeNull();
    expect(parseYouTubeVideoId("https://vimeo.com/123456")).toBeNull();
    expect(parseYouTubeVideoId(`https://evil.com/watch?v=${ID}`)).toBeNull();
    // Right shape of URL, wrong shape of id — never let it reach an iframe src.
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(parseYouTubeVideoId("https://youtu.be/tooshort")).toBeNull();
  });
});

describe("youTubeEmbedUrl", () => {
  it("uses the privacy-enhanced host", () => {
    expect(youTubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
  });
});
