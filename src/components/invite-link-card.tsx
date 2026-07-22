"use client";

import { useEffect, useState } from "react";

export function InviteLinkCard({ inviteToken }: { inviteToken: string }) {
  const relativePath = `/groups/join/${inviteToken}`;
  const [link, setLink] = useState(relativePath);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // The origin is only knowable client-side, after mount — there's no way
    // to derive it during a server render (see react-hooks/set-state-in-effect's
    // own docs on external-system integration as a valid exception).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLink(`${window.location.origin}${relativePath}`);
  }, [relativePath]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (older browsers, insecure
      // context) — the input below is still selectable/copyable by hand.
    }
  }

  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Invite link
      </h3>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
          className="w-full truncate rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Anyone with this link can join — there&apos;s no public list of groups.
      </p>
    </div>
  );
}
