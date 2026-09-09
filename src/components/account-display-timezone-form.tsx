import { TimeZoneSelect } from "@/components/timezone-select";
import { updateTimezoneAction } from "@/app/actions";

interface AccountDisplayTimeZoneFormProps {
  defaultTimeZone: string;
}

/**
 * Sets the zone every date and time in the app is displayed in.
 *
 * This duplicates the control in the app header on purpose: that one is
 * `hidden sm:flex`, so on a phone there was previously no way to change your
 * display time zone at all — in an app whose entire point is time zones.
 * Account settings is also where someone would look for it first.
 */
export function AccountDisplayTimeZoneForm({
  defaultTimeZone,
}: AccountDisplayTimeZoneFormProps) {
  return (
    <form
      action={updateTimezoneAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Display time zone
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Every time on your calendar is shown in this zone. It doesn&apos;t
          change what you&apos;ve already saved — availability is stored as an
          exact instant and converted for whoever is looking at it.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="account-timezone"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Time zone
        </label>
        <TimeZoneSelect
          id="account-timezone"
          name="timezone"
          defaultValue={defaultTimeZone}
          required
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Save time zone
      </button>
    </form>
  );
}
