import { randomBytes } from "crypto";
import { db, type Group } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

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
        create: { userId: input.ownerId },
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
    isOwner: membership.user.id === group.ownerId,
  }));
}
