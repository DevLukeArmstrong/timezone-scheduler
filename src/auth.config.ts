import type { NextAuthConfig } from "next-auth";

/**
 * The provider-free half of the Auth.js config. Kept separate from `auth.ts`
 * so that `proxy.ts` (which runs on every matched request) never has to pull
 * in the Credentials provider's bcrypt/Prisma dependencies just to run the
 * `authorized` check below.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    // No database adapter is configured, so sessions live entirely in a
    // signed/encrypted JWT cookie — no per-request database round trip.
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isOnDashboard = pathname.startsWith("/dashboard");
      // Covers /groups, /groups/[groupId], AND /groups/join/[token] — the
      // invite-link route deliberately gets no special-case here. Returning
      // `false` makes Auth.js redirect to `/login` with a `callbackUrl`
      // pointing right back at the invite link, so signing in or
      // registering bounces the visitor straight back to complete the join.
      const isOnGroups = pathname.startsWith("/groups");
      const isOnAuthPage = pathname === "/login" || pathname === "/register";

      if (isOnDashboard || isOnGroups) {
        return isLoggedIn;
      }
      if (isOnAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
