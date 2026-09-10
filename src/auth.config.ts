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
      // The calendar is the app's root route — there is no public landing
      // page, so `/` is gated exactly like /groups and /account.
      const isOnCalendar = pathname === "/";
      // Covers /groups AND /groups/join/[token] — the invite-link route
      // deliberately gets no special-case here. Returning `false` makes
      // Auth.js redirect to `/login` with a `callbackUrl` pointing right
      // back at the invite link, so signing in or registering bounces the
      // visitor straight back to complete the join.
      const isOnGroups = pathname.startsWith("/groups");
      const isOnAccount = pathname.startsWith("/account");
      const isOnAuthPage =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/forgot-password" ||
        pathname.startsWith("/reset-password");

      if (isOnCalendar || isOnGroups || isOnAccount) {
        return isLoggedIn;
      }
      if (isOnAuthPage && isLoggedIn) {
        // A cookie can be cryptographically valid and still name a user that
        // no longer exists — the row was deleted, or the database was swapped
        // (dev fixtures re-seeded, a restore from backup). This check can't
        // see that: it runs in the proxy, which has no database access, so
        // `isLoggedIn` only means "the JWT verified".
        //
        // The pages *can* see it, and redirect here when the lookup misses.
        // Without this guard the two disagree forever: the page bounces to
        // /login because there's no user, and this bounces straight back
        // because the cookie says there is — an infinite redirect the visitor
        // cannot escape, since they can't reach the form that would replace
        // the bad cookie. `stale` is that signal, so the form renders.
        if (request.nextUrl.searchParams.has("stale")) return true;
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
