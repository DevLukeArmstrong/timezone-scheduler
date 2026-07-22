"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { listIanaTimeZonesPinned } from "@/lib/timezone";

interface TimeZoneSelectProps {
  name: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}

const INPUT_CLASSNAME =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

/** How many filtered matches to render at once — plenty for a filtered list, cheap to paint unfiltered. */
const MAX_VISIBLE_OPTIONS = 50;

function toLabel(timeZone: string): string {
  return timeZone.replace(/_/g, " ");
}

/**
 * A typeable, accessible combobox for picking an IANA time zone: type to
 * filter, arrow keys to navigate, Enter/click to select. Renders a visible
 * filter `<input>` plus a hidden `<input name={name}>` that carries the
 * actual selected zone, so it drops into any `<form>` (including
 * Server Actions) exactly like the `<select>` it replaces.
 */
export function TimeZoneSelect({
  name,
  id,
  defaultValue,
  required,
  className,
}: TimeZoneSelectProps) {
  const allTimeZones = useMemo(() => listIanaTimeZonesPinned(), []);

  const [selected, setSelected] = useState(defaultValue ?? "");
  const [query, setQuery] = useState(defaultValue ? toLabel(defaultValue) : "");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const generatedId = useId();
  const inputId = id ?? name;
  const listboxId = `${generatedId}-listbox`;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allTimeZones;
    return allTimeZones.filter((tz) => toLabel(tz).toLowerCase().includes(needle));
  }, [allTimeZones, query]);
  const visible = filtered.slice(0, MAX_VISIBLE_OPTIONS);

  function commit(timeZone: string) {
    setSelected(timeZone);
    setQuery(toLabel(timeZone));
    setOpen(false);
  }

  function revertQuery() {
    setQuery(selected ? toLabel(selected) : "");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((index) => Math.min(index + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (open && visible[highlightedIndex]) {
        event.preventDefault();
        commit(visible[highlightedIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        revertQuery();
      }
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const activeOptionId =
    open && visible[highlightedIndex] ? `${listboxId}-option-${highlightedIndex}` : undefined;

  return (
    <div className="relative">
      {/* Carries the real submitted value — the visible input above is just
          a filter/display field, so a half-typed search string can never be
          submitted as the time zone. */}
      <input type="hidden" name={name} value={selected} />

      <input
        type="text"
        role="combobox"
        id={inputId}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        required={required && !selected}
        placeholder="Search time zones…"
        value={query}
        className={className ?? INPUT_CLASSNAME}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setOpen(false);
          revertQuery();
        }}
      />

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Time zones"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {visible.length === 0 && (
            <li className="px-3 py-2 text-zinc-400 dark:text-zinc-500">No matching time zones</li>
          )}
          {visible.map((tz, index) => (
            <li
              key={tz}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={tz === selected}
              className={`cursor-pointer px-3 py-1.5 ${
                index === highlightedIndex
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100"
                  : "text-zinc-700 dark:text-zinc-200"
              }`}
              onMouseEnter={() => setHighlightedIndex(index)}
              // `onMouseDown` + `preventDefault` (rather than `onClick`) stops
              // the input from ever blurring on click, so there's no race
              // with the blur handler reverting the query.
              onMouseDown={(event) => {
                event.preventDefault();
                commit(tz);
              }}
            >
              {toLabel(tz)}
            </li>
          ))}
          {filtered.length > visible.length && (
            <li className="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500">
              Keep typing to narrow down {filtered.length - visible.length} more…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
