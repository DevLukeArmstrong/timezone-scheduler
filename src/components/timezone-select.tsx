import { listIanaTimeZones } from "@/lib/timezone";

interface TimeZoneSelectProps {
  name: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}

const SELECT_CLASSNAME =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function TimeZoneSelect({
  name,
  id,
  defaultValue,
  required,
  className,
}: TimeZoneSelectProps) {
  const timeZones = listIanaTimeZones();

  return (
    <select
      name={name}
      id={id ?? name}
      defaultValue={defaultValue}
      required={required}
      className={className ?? SELECT_CLASSNAME}
    >
      {!defaultValue && (
        <option value="" disabled>
          Select a time zone…
        </option>
      )}
      {timeZones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
