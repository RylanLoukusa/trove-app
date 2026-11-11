import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyErrorMessage } from "../utils/errorMessages";
import type { FolderShareScope } from "./folderSharing";

export type PublicLinkScope = FolderShareScope;

export type FolderPublicLink = {
  id: string;
  folderId: string;
  token: string;
  scope: PublicLinkScope;
  showOwnerName: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicFolderSummary = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  purpose?: string;
  parentFolderId?: string | null;
};

// A plain line reaches a public link as a bullet marked `plain`.
export type PublicFolderListItem = {
  id: string;
  kind: "check" | "bullet";
  text: string;
  checked?: boolean;
  indentLevel?: number;
  plain?: boolean;
  bold?: boolean;
};

// A list in a shared folder. Trove keeps lists only; anything else an older
// app left in the folder is dropped when the link is read.
export type PublicFolderItem = {
  id: string;
  folderId: string;
  title: string;
  type: string;
  listItems: PublicFolderListItem[];
  createdAt: string;
  updatedAt: string;
};

export type PublicFolderData = {
  folder: PublicFolderSummary;
  folders: PublicFolderSummary[];
  items: PublicFolderItem[];
  link: { scope: PublicLinkScope };
  ownerName: string | null;
};

type PublicLinkRow = {
  id: string;
  folder_id: string;
  token: string;
  scope: PublicLinkScope;
  show_owner_name: boolean;
  created_at: string;
  updated_at: string;
};

const mapLink = (row: PublicLinkRow): FolderPublicLink => ({
  id: row.id,
  folderId: row.folder_id,
  token: row.token,
  scope: row.scope,
  showOwnerName: row.show_owner_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return friendlyErrorMessage(error.message, fallback);
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return friendlyErrorMessage(message, fallback);
    }
  }

  return fallback;
};

const isMissingRpcError = (error: unknown, functionName: string): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; details?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const details = typeof candidate.details === "string" ? candidate.details : "";

  return (
    candidate.code === "PGRST202" ||
    [message, details].some((value) =>
      value.includes(functionName) &&
      (value.includes("schema cache") || value.includes("Could not find the function")),
    )
  );
};

export const buildPublicFolderLink = (token: string): string =>
  `https://trovecollections.app/shared/${encodeURIComponent(token)}`;

export const loadPublicLinkStatus = async (
  supabase: SupabaseClient,
  folderId: string,
): Promise<{ error?: string; link?: FolderPublicLink }> => {
  const { data, error } = await supabase
    .from("trove_folder_public_links")
    .select("id, folder_id, token, scope, show_owner_name, created_at, updated_at")
    .eq("folder_id", folderId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingRpcError(error, "trove_folder_public_links")) {
      return {};
    }
    return { error: errorMessage(error, "Unable to load this folder's shareable link.") };
  }

  if (!data) {
    return {};
  }

  return { link: mapLink(data as unknown as PublicLinkRow) };
};

export const createPublicLink = async (
  supabase: SupabaseClient,
  folderId: string,
  scope: PublicLinkScope,
  showOwnerName: boolean,
): Promise<{ error?: string; link?: FolderPublicLink }> => {
  const { data, error } = await supabase.rpc("trove_create_folder_public_link", {
    target_folder_id: folderId,
    target_scope: scope,
    target_show_owner_name: showOwnerName,
  });

  if (error) {
    return { error: errorMessage(error, "Unable to create a shareable link.") };
  }

  const row = (Array.isArray(data) ? data[0] : data) as PublicLinkRow | undefined;
  if (!row) {
    return { error: "Unable to create a shareable link." };
  }

  return { link: mapLink(row) };
};

export const revokePublicLink = async (
  supabase: SupabaseClient,
  linkId: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase.rpc("trove_revoke_folder_public_link", {
    target_link_id: linkId,
  });

  return error ? { error: errorMessage(error, "Unable to revoke this link.") } : {};
};

// The whole scope (root folder + every descendant folder/item the link covers) comes
// back in one call, so navigating between subfolders/items within an already-loaded
// link should read from here instead of re-hitting the network on every tap.
const publicFolderCache = new Map<string, PublicFolderData>();

export const fetchPublicFolder = async (
  supabase: SupabaseClient,
  token: string,
): Promise<{ data?: PublicFolderData; error?: string }> => {
  const cached = publicFolderCache.get(token);
  if (cached) {
    return { data: cached };
  }

  const { data, error } = await supabase.functions.invoke("get-public-folder", {
    body: { token },
  });

  if (error) {
    return { error: errorMessage(error, "This link is no longer available.") };
  }

  const response = data as (PublicFolderData & { error?: string }) | null;
  if (!response || response.error) {
    return { error: response?.error ?? "This link is no longer available." };
  }

  const lists: PublicFolderData = {
    ...response,
    items: (response.items ?? [])
      .filter((item) => item.type === "list")
      .map((item) => ({ ...item, listItems: item.listItems ?? [] })),
  };
  publicFolderCache.set(token, lists);
  return { data: lists };
};
