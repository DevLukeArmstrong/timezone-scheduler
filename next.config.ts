import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Traces only the files each route needs into .next/standalone, so the
  // Docker runtime image doesn't need node_modules or the source tree.
  output: "standalone",
  // Asks any nginx in front of the app not to buffer responses, which would
  // break streaming — the header Next.js recommends when self-hosting behind
  // a proxy (see node_modules/next/dist/docs/.../self-hosting.md). Kept even
  // though the current front door is a Cloudflare tunnel rather than nginx:
  // it's inert where nothing reads it, and correct again the moment a
  // reverse proxy is reintroduced.
  async headers() {
    return [
      {
        source: "/:path*{/}?",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};

export default nextConfig;
