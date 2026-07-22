"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createGroup } from "@/lib/services/groups";
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

  let group;
  try {
    group = await createGroup({ ownerId: userId, name });
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/groups");
  redirect(`/groups/${group.id}`);
}
