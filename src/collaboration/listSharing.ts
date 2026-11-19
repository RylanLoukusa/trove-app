import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyErrorMessage } from "../utils/errorMessages";

// Sharing one list on its own, with people by email. Someone with a Trove
// account gets the list right away; anyone else gets it when they sign up
// with that email.

export type ListShareRole = "viewer" | "editor";

export type ListAccess = {
  // "owner" is the list's owner; "share" someone it's shared with; "invite"
  // an email that has no account yet (only the owner sees these).
  kind: "owner" | "share" | "invite";
  id: string;
  userId?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role: ListShareRole | "owner";
};

type AccessRow = {
  access_kind: ListAccess["kind"];
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: ListAccess["role"];
};

const errorMessage = (error: unknown, fallback: string): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : undefined;
  return friendlyErrorMessage(message, fallback);
};

export const accessName = (access: Pick<ListAccess, "displayName" | "email">): string =>
  access.displayName?.trim() || access.email || "Someone";

export const loadListAccess = async (
  supabase: SupabaseClient,
  listId: string,
): Promise<{ access: ListAccess[]; error?: string }> => {
  const { data, error } = await supabase.rpc("trove_list_access", { target_item_id: listId });
  if (error) return { access: [], error: errorMessage(error, "Could not load who has this list.") };
  return {
    access: ((data ?? []) as AccessRow[]).map((row) => ({
      kind: row.access_kind,
      id: row.id,
      userId: row.user_id ?? undefined,
      email: row.email ?? undefined,
      displayName: row.display_name ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      role: row.role,
    })),
  };
};

export const shareList = async (
  supabase: SupabaseClient,
  input: { listId: string; role: ListShareRole } & ({ email: string } | { userId: string }),
): Promise<{ result?: "share" | "invite"; error?: string }> => {
  const { data, error } = await supabase.rpc("trove_share_list", {
    target_item_id: input.listId,
    target_email: "email" in input ? input.email.trim() : null,
    target_user_id: "userId" in input ? input.userId : null,
    share_role: input.role,
  });
  if (error) return { error: errorMessage(error, "Could not share this list.") };
  return { result: data === "invite" ? "invite" : "share" };
};

export const changeListAccess = async (
  supabase: SupabaseClient,
  access: Pick<ListAccess, "kind" | "id">,
  role: ListShareRole,
): Promise<{ error?: string }> => {
  const table = access.kind === "invite" ? "trove_list_share_invites" : "trove_list_shares";
  const { error } = await supabase.from(table).update({ role }).eq("id", access.id);
  return error ? { error: errorMessage(error, "Could not change their access.") } : {};
};

// Takes someone off the list (or withdraws an invite). The person it's
// shared with can do this to themselves, to leave it.
export const removeListAccess = async (
  supabase: SupabaseClient,
  access: Pick<ListAccess, "kind" | "id">,
): Promise<{ error?: string }> => {
  const { error } =
    access.kind === "invite"
      ? await supabase.from("trove_list_share_invites").update({ status: "revoked" }).eq("id", access.id)
      : await supabase.from("trove_list_shares").delete().eq("id", access.id);
  return error ? { error: errorMessage(error, "Could not remove their access.") } : {};
};

// Leaves a list someone shared with this person.
export const leaveSharedList = async (
  supabase: SupabaseClient,
  listId: string,
  userId: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("trove_list_shares")
    .delete()
    .eq("item_id", listId)
    .eq("shared_with_user_id", userId);
  return error ? { error: errorMessage(error, "Could not leave this list.") } : {};
};

// The message sent along to someone who doesn't have Trove yet.
export const listInviteMessage = (listTitle: string): string =>
  `I shared my list "${listTitle}" with you on Trove. Get the app at https://trovecollections.app and sign up with this email to see it.`;
