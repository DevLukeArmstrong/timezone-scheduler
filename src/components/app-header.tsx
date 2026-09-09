import Link from "next/link";
import { TimeZoneSelect } from "@/components/timezone-select";
import { AccountMenu } from "@/components/account-menu";
import { updateTimezoneAction } from "@/app/actions";

interface AppHeaderProps {
  user: {
    name: string | null;
    email: string;
    timezone: string;
  };
  /** `null` when the current page isn't one of the primary nav links (e.g. `/account`). */
  activeNav: "calendar" | "groups" | null;
}

const NAV_LINKS = [
  { href: "/", label: "Calendar", key: "calendar" as const },
  { href: "/groups", label: "Groups", key: "groups" as const },
];

export function AppHeader({ user, activeNav }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            TZ
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Timezone Scheduler
          </span>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  activeNav === link.key
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <form
            action={updateTimezoneAction}
            className="hidden items-center gap-2 sm:flex"
          >
            <TimeZoneSelect
              name="timezone"
              defaultValue={user.timezone}
              className="rounded-lg border border-dashed border-zinc-300 bg-transparent px-2 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            />
            <button
              type="submit"
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Save
            </button>
          </form>

          <AccountMenu user={user} />
        </div>
      </div>

      <nav className="flex items-center gap-1 border-t border-zinc-200 px-4 py-1.5 sm:hidden dark:border-zinc-800">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={`rounded-lg px-2.5 py-1 text-sm font-medium transition-colors ${
              activeNav === link.key
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
