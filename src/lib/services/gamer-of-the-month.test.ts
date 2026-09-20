import { describe, expect, it } from "vitest";
import { describeImagePageLink } from "@/lib/services/gamer-of-the-month";

describe("describeImagePageLink", () => {
  it("catches the page links people paste instead of the image", () => {
    expect(describeImagePageLink(new URL("https://imgur.com/a/MGAphtK"))).toMatch(/i\.imgur\.com/);
    expect(describeImagePageLink(new URL("https://imgur.com/gallery/abc"))).toMatch(/Imgur page/);
    expect(
      describeImagePageLink(new URL("https://drive.google.com/file/d/1abc/view?usp=sharing")),
    ).toMatch(/Google Drive/);
    expect(describeImagePageLink(new URL("https://discord.com/channels/1/2/3"))).toMatch(/Discord/);
    expect(describeImagePageLink(new URL("https://github.com/user/repo/issues/1"))).toMatch(
      /GitHub page/,
    );
  });

  it("lets real image links through", () => {
    expect(describeImagePageLink(new URL("https://i.imgur.com/MGAphtK.jpg"))).toBeNull();
    expect(
      describeImagePageLink(new URL("https://cdn.discordapp.com/avatars/1/abc.png?size=256")),
    ).toBeNull();
    expect(
      describeImagePageLink(new URL("https://github.com/user-attachments/assets/abc-123")),
    ).toBeNull();
    expect(describeImagePageLink(new URL("https://example.com/no-extension"))).toBeNull();
  });
});
