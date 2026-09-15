import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById, listUsers } from "@/lib/services/users";
import { getGamerOfTheMonth } from "@/lib/services/gamer-of-the-month";
import { isSiteAdmin } from "@/lib/site-admin";
import { AppHeader } from "@/components/app-header";
import { GamerOfTheMonthAdminForm } from "@/components/gamer-of-the-month-admin-form";
import { GamerOfTheMonthCard } from "@/components/gamer-of-the-month-card";

export default async function GamerOfTheMonthAdminPage() {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user) {
    redirect("/login?stale=1");
  }

  // 404 rather than 403: a non-admin has no reason to learn this page exists.
  if (!isSiteAdmin(user.email)) {
    notFound();
  }

  const [current, members] = await Promise.all([getGamerOfTheMonth(), listUsers()]);

  const monthLabel = current
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: user.timezone,
      }).format(current.createdAt)
    : null;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav={null} />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Gamer of the month
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Everyone sees this as a popup on their next visit. They can tick
            &ldquo;don&apos;t show this again this month&rdquo; — publishing a new
            month brings it back for them; saving changes doesn&apos;t.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <GamerOfTheMonthAdminForm
            members={members}
            current={
              current
                ? {
                    id: current.id,
                    userId: current.user.id,
                    title: current.title,
                    blurb: current.blurb,
                    imageUrl: current.imageUrl,
                    youtubeVideoId: current.youtubeVideoId,
                  }
                : null
            }
          />

          <section className="w-full max-w-lg space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {current ? "Live now — what members see" : "Nothing published"}
            </h2>
            {current && monthLabel ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <GamerOfTheMonthCard
                  feature={{
                    id: current.id,
                    title: current.title,
                    blurb: current.blurb,
                    imageUrl: current.imageUrl,
                    youtubeVideoId: current.youtubeVideoId,
                    memberName: current.user.name ?? current.user.email,
                    monthLabel,
                  }}
                  isViewer={false}
                />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-400 dark:border-zinc-700">
                Fill in the form and publish — the popup appears here once it&apos;s live.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
