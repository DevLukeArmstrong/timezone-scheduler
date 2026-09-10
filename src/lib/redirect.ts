import { headers } from "next/headers";

const DEFAULT_REDIRECT = "/";

/**
 * Validates a user-supplied redirect target (a `callbackUrl` form field or
 * search param) so it can only ever point somewhere inside this app.
 *
 * Two shapes are accepted:
 *  - A relative path (`/groups/join/abc123`) — the common case when a page
 *    passes its own `callbackUrl` search param straight through.
 *  - An absolute same-origin URL (`http://localhost:3000/groups/join/abc123`)
 *    — what Auth.js's own `authorized` callback puts in `callbackUrl` when
 *    it redirects an unauthenticated visitor to the sign-in page, since it
 *    reflects back the full request URL, not just its path.
 *
 * Anything else — a different host, a protocol-relative URL (`//evil.com`),
 * or a malformed value — is untrusted and replaced with `fallback`.
 */
export async function sanitizeRedirectTarget(
  value: unknown,
  fallback: string = DEFAULT_REDIRECT,
): Promise<string> {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const url = new URL(value);
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    if (host && url.host === host) {
      return `${url.pathname}${url.search}${url.hash}` || fallback;
    }
  } catch {
    // Not a valid absolute URL either — fall through to the fallback below.
  }

  return fallback;
}

/**
 * The current request's origin (protocol + host), for building absolute
 * URLs — e.g. a password-reset link embedded in an email, which is opened
 * outside any page context so a relative path won't work.
 */
export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
