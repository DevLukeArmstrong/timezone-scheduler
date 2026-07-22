import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/services/users";
import { listAvailabilitySlots } from "@/lib/services/availability";
import { getWeekDays } from "@/lib/calendar";
import { AvailabilityForm } from "@/components/availability-form";
import { SlotList } from "@/components/slot-list";
import { WeekCalendar } from "@/components/week-calendar";
import { AppHeader } from "@/components/app-header";

export default async function DashboardPage() {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;

  if (!user) {
    redirect("/login");
  }

  const slots = await listAvailabilitySlots(user.id);
  const weekDays = getWeekDays(user.timezone);

  const weekLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: user.timezone,
  });

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav="dashboard" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
          <AvailabilityForm defaultTimeZone={user.timezone} />

          <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Your availability
            </h2>
            <SlotList slots={slots} timeZone={user.timezone} />
          </section>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Week of {weekLabel.format(weekDays[0])} – {weekLabel.format(weekDays[6])}
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Shown in {user.timezone.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          <WeekCalendar slots={slots} timeZone={user.timezone} weekDays={weekDays} />

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-600" />
              Empty slot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
              Your availability
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}
