import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ValidationError } from "@/lib/errors";
import { MIN_PASSWORD_LENGTH } from "@/lib/services/users";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function generateToken(): string {
  // 32 random bytes -> 43 base64url chars: unguessable, and only ever
  // compared by its hash (see hashToken), never stored raw.
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a password reset token for the user with `email`, if one exists.
 * Always resolves successfully either way — callers must show the same
 * generic "if that email exists, we've sent a link" message regardless of
 * the result, so this can't be used to probe which emails are registered.
 * Returns the raw token (for the emailed link) only when a matching user
 * was found; `null` otherwise, meaning "send nothing."
 */
export async function createPasswordResetToken(
  email: string,
): Promise<{ userId: string; token: string } | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!user) return null;

  const token = generateToken();
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return { userId: user.id, token };
}

/**
 * Whether `token` currently names an unused, unexpired reset request. Used
 * by the `/reset-password/[token]` page to decide upfront whether to show
 * the new-password form or an "invalid/expired link" message — purely a UX
 * check. `resetPasswordWithToken` re-validates independently before it ever
 * touches the password, since validity can change between page load and
 * submit.
 */
export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  return !!record && !record.usedAt && record.expiresAt.getTime() > Date.now();
}

/**
 * Redeems a reset token: verifies it's unused and unexpired, sets the new
 * password, and marks the token used, in one transaction. Throws
 * `ValidationError` — with a deliberately generic message — for an
 * invalid/expired/already-used token, or for a too-short new password.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<void> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("This password reset link is invalid or has expired.");
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
}
