"use client";

import type { ButtonHTMLAttributes } from "react";

interface ConfirmSubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shown in a native confirm dialog before the form is allowed to submit. */
  confirmMessage: string;
}

/**
 * A `type="submit"` button that gates submission behind `window.confirm`.
 * Meant to sit inside a server-rendered `<form action={...}>` — only this
 * button needs to be a Client Component, the form and its action stay on
 * the server. Without JS, the confirm never fires and the form submits
 * normally, so progressive enhancement still holds.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...buttonProps
}: ConfirmSubmitButtonProps) {
  return (
    <button
      {...buttonProps}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
