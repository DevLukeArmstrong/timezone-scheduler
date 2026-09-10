import { randomBytes } from "crypto";
import { db, GroupRole, type Group } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { DiscordWebhookError, isDiscordWebhookUrl, sendDiscordMessage } from "@/lib/discord";

const NAME_MAX_LENGTH = 60;

export interface CreateGroupInput {
  ownerId: string;
  name: string;
}

function generateInviteToken(): string {
  // 24 random bytes -> 32 base64url chars: opaque and unguessable, and
  // deliberately unrelated to the group's id so knowing one never reveals
  // the other.
  return randomBytes(24).toString("base64url");
}

/** Creates a group and immediately makes its creator a member (the owner). */
export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const name = input.name.trim();
  if (!name) {
    throw new ValidationError("Group name is required.");
  }
  if (name.length > NAME_MAX_LENGTH) {
    throw new ValidationError(`Group name must be ${NAME_MAX_LENGTH} characters or fewer.`);
  }

  return db.group.create({
    data: {
      name,
      ownerId: input.ownerId,
      inviteToken: generateInviteToken(),
      memberships: {
        create: { userId: input.ownerId, role: GroupRole.OWNER },
      },
    },
  });
}

/**
 * The core authorization gate for group data: returns the group only if
 * `userId` is a member of it (owners get a membership row on creation, so
 * this covers them too), otherwise `null`. Every group page/action must
 * call this before reading or writing anything scoped to a group — never
 * trust a `groupId` from the URL/form alone.
 */
export async function getGroupForMember(
  groupId: string,
  userId: string,
): Promise<Group | null> {
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    include: { group: true },
  });
  return membership?.group ?? null;
}

/**
 * The authorization gate for group *management* actions — promoting,
 * demoting, removing a member, or regenerating the invite link. Mirrors
 * `getGroupForMember`'s shape (look up scoped to the caller, `null` if it
 * doesn't apply) but additionally requires the caller's role to be OWNER or
 * ADMIN. Every management service function below calls this first and
 * never trusts a role claim from the client — hiding a button in the UI is
 * not an authorization check.
 */
export async function getGroupForAdmin(groupId: string, userId: string): Promise<Group | null> {
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    include: { group: true },
  });
  if (!membership || membership.role === GroupRole.MEMBER) {
    return null;
  }
  return membership.group;
}

/** Looks up a group by its invite link token. Never expose this by id. */
export async function getGroupByInviteToken(inviteToken: string): Promise<Group | null> {
  return db.group.findUnique({ where: { inviteToken } });
}

/**
 * Joins `userId` to the group behind `inviteToken`. Idempotent — joining a
 * group you're already in is a no-op, not an error.
 */
export async function joinGroupByInviteToken(
  inviteToken: string,
  userId: string,
): Promise<Group> {
  const group = await getGroupByInviteToken(inviteToken);
  if (!group) {
    throw new NotFoundError("This invite link is invalid or has expired.");
  }

  await db.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId } },
    create: { groupId: group.id, userId },
    update: {},
  });

  return group;
}

/** All groups `userId` belongs to (owned or joined), newest first. */
export async function listGroupsForUser(userId: string): Promise<Group[]> {
  return db.group.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "desc" },
  });
}

export interface GroupMemberSummary {
  id: string;
  name: string | null;
  email: string;
  joinedAt: Date;
  role: GroupRole;
  /** Convenience flag, equivalent to `role === GroupRole.OWNER`. */
  isOwner: boolean;
}

/** Every member of a group, for the member list / per-member color legend. */
export async function listGroupMembers(groupId: string): Promise<GroupMemberSummary[]> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { ownerId: true },
  });
  if (!group) {
    throw new NotFoundError(`No group found with id "${groupId}".`);
  }

  const memberships = await db.groupMembership.findMany({
    where: { groupId },
    orderBy: { joinedAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return memberships.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    joinedAt: membership.joinedAt,
    role: membership.role,
    isOwner: membership.role === GroupRole.OWNER,
  }));
}

/**
 * Whether `userId` may manage `groupId`'s membership (OWNER or ADMIN).
 * Thin wrapper around `getGroupForAdmin` for call sites — pages, mostly —
 * that only need a boolean to decide what to render, not the group itself.
 */
export async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  return (await getGroupForAdmin(groupId, userId)) !== null;
}

/**
 * Promotes a MEMBER to ADMIN. Callable by the group's OWNER or an existing
 * ADMIN — enforced here via `getGroupForAdmin`, not left to the UI.
 * Idempotent: promoting an existing ADMIN (or the OWNER) is a no-op rather
 * than an error.
 */
export async function promoteMemberToAdmin(
  groupId: string,
  actingUserId: string,
  targetUserId: string,
): Promise<void> {
  const group = await getGroupForAdmin(groupId, actingUserId);
  if (!group) {
    throw new ForbiddenError("Only the group owner or an admin can manage members.");
  }

  const target = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!target) {
    throw new NotFoundError(`No member found with id "${targetUserId}" in this group.`);
  }
  if (target.role !== GroupRole.MEMBER) {
    return; // Already ADMIN or OWNER — nothing to do.
  }

  await db.groupMembership.update({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    data: { role: GroupRole.ADMIN },
  });
}

/**
 * Demotes an ADMIN back to MEMBER. Callable by the group's OWNER or an
 * existing ADMIN. The OWNER can never be demoted — that's a `ValidationError`,
 * not silently ignored, since it signals a caller bug (or tampering) rather
 * than a harmless race. Idempotent for a target that's already a MEMBER.
 */
export async function demoteAdminToMember(
  groupId: string,
  actingUserId: string,
  targetUserId: string,
): Promise<void> {
  const group = await getGroupForAdmin(groupId, actingUserId);
  if (!group) {
    throw new ForbiddenError("Only the group owner or an admin can manage members.");
  }

  const target = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!target) {
    throw new NotFoundError(`No member found with id "${targetUserId}" in this group.`);
  }
  if (target.role === GroupRole.OWNER) {
    throw new ValidationError("The group owner can't be demoted.");
  }
  if (target.role === GroupRole.MEMBER) {
    return; // Already a plain member — nothing to do.
  }

  await db.groupMembership.update({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    data: { role: GroupRole.MEMBER },
  });
}

/**
 * Removes a member from the group entirely. Callable by the group's OWNER
 * or an existing ADMIN. The OWNER can never be removed — a group always
 * keeps its creator; deleting a group is a separate, unbuilt operation.
 */
export async function removeMember(
  groupId: string,
  actingUserId: string,
  targetUserId: string,
): Promise<void> {
  const group = await getGroupForAdmin(groupId, actingUserId);
  if (!group) {
    throw new ForbiddenError("Only the group owner or an admin can manage members.");
  }

  const target = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!target) {
    throw new NotFoundError(`No member found with id "${targetUserId}" in this group.`);
  }
  if (target.role === GroupRole.OWNER) {
    throw new ValidationError("The group owner can't be removed.");
  }

  await db.groupMembership.delete({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
}

/**
 * Regenerates a group's invite token, immediately invalidating the old
 * link (anyone still holding it gets a 404 via `getGroupByInviteToken`).
 * Callable by the group's OWNER or an existing ADMIN.
 */
export async function regenerateInviteToken(groupId: string, actingUserId: string): Promise<Group> {
  const group = await getGroupForAdmin(groupId, actingUserId);
  if (!group) {
    throw new ForbiddenError("Only the group owner or an admin can manage members.");
  }

  return db.group.update({
    where: { id: groupId },
    data: { inviteToken: generateInviteToken() },
  });
}

/**
 * Sets (or, with `null`, clears) the Discord webhook this group's
 * notifications post to. Callable by the group's OWNER or an existing
 * ADMIN. Only the URL's shape is validated here — use
 * {@link sendGroupDiscordTestMessage} to prove it actually reaches a
 * channel. The stored value is never returned to the client; callers get
 * a boolean via `hasDiscordWebhook`.
 */
export async function setGroupDiscordWebhook(
  groupId: string,
  actingUserId: string,
  webhookUrl: string | null,
): Promise<void> {
  const group = await getGroupForAdmin(groupId, actingUserId);
  if (!group) {
    throw new ForbiddenError("Only the group owner or an admin can change notifications.");
  }

  const trimmed = webhookUrl?.trim() || null;
  if (trimmed && !isDiscordWebhookUrl(trimmed)) {
    throw new ValidationError(
      "That doesn't look like a Discord webhook URL — it should start with https://discord.com/api/webhooks/.",
    );
  }

  await db.group.update({
    where: { id: groupId },
    data: { discordWebhookUrl: trimmed },
  });
}

/**
 * Posts a "notifications are working" message to the group's channel so
 * an admin can confirm the webhook end-to-end. Throws `ValidationError`
 * with Discord's answer when it fails, which is the useful part.
 */
export async function sendGroupDiscordTestMessage(
  groupId: string,
  actingUserId: string,
): Promise<void> {
  const group = await getGroupForAdmin(groupId, actingUserId);
  if (!group) {
    throw new ForbiddenError("Only the group owner or an admin can change notifications.");
  }
  if (!group.discordWebhookUrl) {
    throw new ValidationError("Save a webhook URL first.");
  }

  try {
    await sendDiscordMessage(
      group.discordWebhookUrl,
      `✅ Timezone Scheduler is connected to **${group.name}**. Availability updates and reminders will show up here.`,
    );
  } catch (error) {
    if (error instanceof DiscordWebhookError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}
