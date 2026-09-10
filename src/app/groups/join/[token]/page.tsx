import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { joinGroupByInviteToken } from "@/lib/services/groups";
import { NotFoundError } from "@/lib/errors";

export default async function JoinGroupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // `proxy.ts`'s `authorized` callback treats every /groups/:path* route —
  // this one included — as requiring a session, so an unauthenticated
  // visitor is already redirected to `/login?callbackUrl=/groups/join/<token>`
  // before this ever runs. Signing in or registering there sends them
  // straight back here afterward. This check is a defensive fallback, not
  // the primary gate — Server Components must never assume the proxy alone
  // enforced auth (see node_modules/next/dist/docs/.../guides/authentication.md).
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/groups/join/${token}`)}`);
  }

  let group;
  try {
    group = await joinGroupByInviteToken(token, userId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  // Land them straight on the calendar, filtered to the group they just
  // joined, so the invite link's payoff is immediate.
  redirect(`/?groups=${group.id}`);
}
