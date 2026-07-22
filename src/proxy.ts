// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (same
// runtime behavior, see node_modules/next/dist/docs/.../file-conventions/proxy.md).
// Auth.js's `auth` wrapper is invoked with the same (request, event) shape a
// proxy file expects, so re-exporting it under the `proxy` name is enough —
// it runs the `authorized` callback from auth.config.ts and redirects to
// /login (or away from /login, /register) as needed.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/groups", "/groups/:path*", "/login", "/register"],
};
