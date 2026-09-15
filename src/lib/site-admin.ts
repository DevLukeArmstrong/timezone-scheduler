/**
 * The app's only site-wide privilege: who may curate the "gamer of the
 * month" popup. There is no admin table or role column — the set of admins
 * is `ADMIN_EMAILS` (comma-separated) in the environment, the same way
 * `REGISTRATION_INVITE_CODE` gates signups. That's deliberate: this is one
 * person curating one popup, and an env var needs no migration, no UI to
 * grant/revoke, and can't be escalated to from inside the app. Group
 * OWNER/ADMIN roles (src/lib/services/groups.ts) are unrelated to this.
 *
 * Unset (or empty) means nobody is an admin — the admin page 404s for
 * everyone and the menu link never renders.
 */
export function isSiteAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
