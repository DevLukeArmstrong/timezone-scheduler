import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Traces only the files each route needs into .next/standalone, so the
  // Docker runtime image doesn't need node_modules or the source tree.
  output: "standalone",
  // Nginx Proxy Manager buffers responses by default, which breaks
  // streaming. Told not to, via the header Next.js recommends for
  // self-hosting behind nginx (see node_modules/next/dist/docs/.../self-hosting.md).
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
