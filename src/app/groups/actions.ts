"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createGroup,
  deleteGroup,
  demoteAdminToMember,
  leaveGroup,
  promoteMemberToAdmin,
  regenerateInviteToken,
  removeMember,
  renameGroup,
  sendGroupDiscordTestMessage,
  setGroupDiscordWebhook,
  setGroupQuorumThreshold,
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

export async function renameGroupAction(
  groupId: string,
  _prevState: GroupMemberActionState,
  formData: FormData,
): Promise<GroupMemberActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  const name = String(formData.get("name") ?? "");

  try {
    await renameGroup(groupId, userId, name);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}

/**
 * Leaves the group entirely. Any member can call this except the OWNER —
 * `leaveGroup` rejects that case with a `ValidationError` explaining they
 * need to delete the group instead. The viewer lands back on `/groups`
 * with one fewer card, same as `deleteGroupAction`.
 */
export async function leaveGroupAction(
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
    await leaveGroup(groupId, userId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}

/**
 * Permanently deletes the group. OWNER-only — `deleteGroup` 403s anyone
 * else via `getGroupForOwner`. The confirm dialog warning about the
 * cascade lives client-side, in `GroupDangerZone`.
 */
export async function deleteGroupAction(
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
    await deleteGroup(groupId, userId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return {};
}

export interface DiscordWebhookActionState {
  error?: string;
  success?: string;
}

/**
 * Saves or clears the group's Discord webhook. The URL only ever travels
 * client → server in this form post; it's never rendered back out, so a
 * member who isn't an admin (or an admin's browser history) never sees it.
 */
export async function setDiscordWebhookAction(
  groupId: string,
  _prevState: DiscordWebhookActionState,
  formData: FormData,
): Promise<DiscordWebhookActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  const intent = String(formData.get("intent") ?? "save");
  const webhookUrl = intent === "clear" ? null : String(formData.get("webhookUrl") ?? "");

  try {
    await setGroupDiscordWebhook(groupId, userId, webhookUrl);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return { success: webhookUrl ? "Webhook saved." : "Discord notifications turned off." };
}

export async function sendDiscordTestMessageAction(
  groupId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: DiscordWebhookActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<DiscordWebhookActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  try {
    await sendGroupDiscordTestMessage(groupId, userId);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  return { success: "Test message sent — check the channel." };
}

export async function setQuorumThresholdAction(
  groupId: string,
  _prevState: DiscordWebhookActionState,
  formData: FormData,
): Promise<DiscordWebhookActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in." };
  }

  const threshold = Number(formData.get("threshold"));

  try {
    await setGroupQuorumThreshold(groupId, userId, threshold);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  return { success: `You'll hear about it when ${threshold} or more are free together.` };
}
