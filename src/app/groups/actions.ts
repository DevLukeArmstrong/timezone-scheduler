"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createGroup,
  demoteAdminToMember,
  promoteMemberToAdmin,
  regenerateInviteToken,
  removeMember,
} from "@/lib/services/groups";
import { ServiceError } from "@/lib/errors";

export interface CreateGroupActionState {
  error?: string;
}

export async function createGroupAction(
  _prevState: CreateGroupActionState,
  formData: FormData,
): Promise<CreateGroupActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in to create a group." };
  }

  const name = String(formData.get("name") ?? "");

  try {
    await createGroup({ ownerId: userId, name });
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  redirect("/groups");
}

/**
 * Shared result shape for every member-management action below. All four
 * are meant to be partially applied with `.bind(null, groupId, targetUserId)`
 * (or just `groupId` for `regenerateInviteTokenAction`) and driven by
 * `useActionState`, so their real per-row state lives in the client
 * component that binds them — this only ever carries an error, if any.
 */
export interface GroupMemberActionState {
  error?: string;
}

/**
 * Every action below re-derives the acting user from the session and lets
 * the service layer (`getGroupForAdmin`) be the actual authority on
 * whether they're allowed to do this — the id sent from the client is only
 * ever "which member", never "am I an admin". See
 * node_modules/next/dist/docs/.../guides/server-actions.md's security
 * section: framework protections aren't a substitute for this check.
 */
export async function promoteMemberAction(
  groupId: string,
  targetUserId: string,
  // Required by useActionState's (state, formData) shape, but this action
  // takes no form fields — everything it needs is already bound above.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: GroupMemberActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<GroupMemberActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  try {
    await promoteMemberToAdmin(groupId, userId, targetUserId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}

export async function demoteMemberAction(
  groupId: string,
  targetUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: GroupMemberActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<GroupMemberActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  try {
    await demoteAdminToMember(groupId, userId, targetUserId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}

export async function removeMemberAction(
  groupId: string,
  targetUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: GroupMemberActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<GroupMemberActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  try {
    await removeMember(groupId, userId, targetUserId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}

export async function regenerateInviteTokenAction(
  groupId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: GroupMemberActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<GroupMemberActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  try {
    await regenerateInviteToken(groupId, userId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}
