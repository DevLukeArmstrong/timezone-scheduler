import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/services/users";
import { listFavoriteTimeZones } from "@/lib/services/favorite-timezones";
import { AppHeader } from "@/components/app-header";
import { AccountNameForm } from "@/components/account-name-form";
import { AccountPasswordForm } from "@/components/account-password-form";
import { AccountNotificationsForm } from "@/components/account-notifications-form";
import { AccountTimeZonesForm } from "@/components/account-timezones-form";
import { AccountDisplayTimeZoneForm } from "@/components/account-display-timezone-form";
import { AccountPeakHoursForm } from "@/components/account-peak-hours-form";

export default async function AccountPage() {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user) {
    redirect("/login");
  }

  const favoriteTimeZones = await listFavoriteTimeZones(user.id);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav={null} />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Account settings
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {user.email}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <AccountNameForm defaultName={user.name ?? ""} />
          <AccountDisplayTimeZoneForm defaultTimeZone={user.timezone} />
          <AccountPeakHoursForm
            defaultPeakStartHour={user.peakStartHour}
            defaultPeakEndHour={user.peakEndHour}
          />
          <AccountPasswordForm />
          <AccountNotificationsForm
            defaultNotifyReminder={user.notifyReminder}
            defaultNotifyOverlap={user.notifyOverlap}
            defaultNotifyNewAvailability={user.notifyNewAvailability}
          />
          <AccountTimeZonesForm defaultTimeZones={favoriteTimeZones} />
        </div>
      </div>
    </div>
  );
}
