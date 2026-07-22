import { db, Prisma, type User } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isValidTimeZone } from "@/lib/timezone";
import { hashPassword, verifyPassword } from "@/lib/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Everything about a `User` that's safe to hand back to callers/UI — never `passwordHash`. */
export type PublicUser = Omit<User, "passwordHash">;

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} satisfies { [K in keyof PublicUser]: true };

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string | null;
  /** IANA time zone identifier, e.g. "America/Los_Angeles". Defaults to "UTC". */
  timezone?: string;
}

/**
 * Creates a user, hashing their password and validating their email and IANA
 * timezone identifier. Throws `ValidationError` for malformed input and
 * `ConflictError` if the email is already registered.
 */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError(`"${input.email}" is not a valid email address.`);
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    );
  }

  const timezone = input.timezone?.trim() || "UTC";
  if (!isValidTimeZone(timezone)) {
    throw new ValidationError(
      `"${timezone}" is not a recognized IANA time zone identifier.`,
    );
  }

  const name = input.name?.trim() || null;
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.user.create({
      data: { email, name, timezone, passwordHash },
      select: PUBLIC_USER_SELECT,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError(`A user with email "${email}" already exists.`);
    }
    throw error;
  }
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  return db.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
}

export async function getUserByEmail(email: string): Promise<PublicUser | null> {
  return db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: PUBLIC_USER_SELECT,
  });
}

export async function updateUserTimezone(
  userId: string,
  timezone: string,
): Promise<PublicUser> {
  const trimmed = timezone.trim();
  if (!isValidTimeZone(trimmed)) {
    throw new ValidationError(
      `"${timezone}" is not a recognized IANA time zone identifier.`,
    );
  }
  try {
    return await db.user.update({
      where: { id: userId },
      data: { timezone: trimmed },
      select: PUBLIC_USER_SELECT,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new NotFoundError(`No user found with id "${userId}".`);
    }
    throw error;
  }
}

/**
 * Verifies an email/password pair for the Credentials provider. Returns the
 * public user shape on success, or `null` on any failure — unknown email or
 * wrong password are indistinguishable on purpose, so a failed login never
 * reveals whether an account exists.
 */
export async function verifyUserCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const record = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { ...PUBLIC_USER_SELECT, passwordHash: true },
  });
  if (!record) return null;

  const { passwordHash, ...user } = record;
  const isValid = await verifyPassword(password, passwordHash);
  return isValid ? user : null;
}
