import type { SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { friendlyErrorMessage } from "../utils/errorMessages";

export type FolderShareRole = "viewer" | "editor";
export type FolderShareScope = "folder_only" | "folder_and_subfolders";
export type FolderShareInviteStatus = "pending" | "accepted" | "revoked";

export type FolderShareProfile = {
  id: string;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
};

export type FolderShare = {
  id: string;
  folderId: string;
  ownerId: string;
  sharedWithProfile?: FolderShareProfile;
  sharedWithUserId: string;
  role: FolderShareRole;
  scope: FolderShareScope;
  createdAt: string;
  updatedAt: string;
};

export type FolderAccessKind = "direct" | "inherited" | "owner";

export type FolderAccess = {
  id: string;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  kind: FolderAccessKind;
  role: FolderShareRole | "owner";
  scope: FolderShareScope | "all";
  shareId?: string;
  sourceFolderId?: string;
  sourceFolderName?: string;
  updatedAt?: string;
  userId: string;
};

export type SavedCollaborator = {
  id: string;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  lastSharedAt: string;
};

export type FolderShareInvite = {
  id: string;
  folderId: string;
  ownerId: string;
  email: string;
  role: FolderShareRole;
  scope: FolderShareScope;
  status: FolderShareInviteStatus;
  token: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  emailDeliveryId?: string;
  emailLastError?: string;
  emailSentAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ShareRow = {
  id: string;
  folder_id: string;
  owner_id: string;
  shared_with_user_id: string;
  role: FolderShareRole;
  scope: FolderShareScope;
  created_at: string;
  updated_at: string;
};

type AccessRow = {
  access_kind: FolderAccessKind;
  avatar_url: string | null;
  created_at: string | null;
  display_name: string | null;
  email: string | null;
  role: FolderShareRole | "owner";
  scope: FolderShareScope | "all";
  share_id: string | null;
  source_folder_id: string | null;
  source_folder_name: string | null;
  updated_at: string | null;
  user_id: string;
};

type InviteRow = {
  id: string;
  folder_id: string;
  owner_id: string;
  email: string;
  role: FolderShareRole;
  scope: FolderShareScope;
  status: FolderShareInviteStatus;
  token: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  email_delivery_id: string | null;
  email_last_error: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShareEmailFunctionResponse = {
  emailError?: string;
  emailSent?: boolean;
  error?: string;
  inviteId?: string | null;
  result?: "invite" | "share";
  share_id?: string | null;
  shareId?: string | null;
};

type ProfileRow = {
  id: string;
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
};

type SavedCollaboratorRow = {
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
  last_shared_at: string;
  user_id: string;
};

const PENDING_INVITE_TOKEN_KEY = "trove:pendingFolderInviteToken";

export const buildFolderInviteLink = (token: string): string =>
  `https://trovecollections.app/share-invite/${encodeURIComponent(token)}`;

const mapShare = (row: ShareRow): FolderShare => ({
  id: row.id,
  folderId: row.folder_id,
  ownerId: row.owner_id,
  sharedWithUserId: row.shared_with_user_id,
  role: row.role,
  scope: row.scope,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAccess = (row: AccessRow): FolderAccess => ({
  id: row.share_id ?? `owner:${row.user_id}`,
  avatarUrl: row.avatar_url ?? undefined,
  displayName: row.display_name ?? undefined,
  email: row.email ?? undefined,
  kind: row.access_kind,
  role: row.role,
  scope: row.scope,
  shareId: row.share_id ?? undefined,
  sourceFolderId: row.source_folder_id ?? undefined,
  sourceFolderName: row.source_folder_name ?? undefined,
  updatedAt: row.updated_at ?? undefined,
  userId: row.user_id,
});

const mapProfile = (row: ProfileRow): FolderShareProfile => ({
  id: row.id,
  avatarUrl: row.avatar_url ?? undefined,
  displayName: row.display_name ?? undefined,
  email: row.email ?? undefined,
});

const mapSavedCollaborator = (row: SavedCollaboratorRow): SavedCollaborator => ({
  id: row.user_id,
  avatarUrl: row.avatar_url ?? undefined,
  displayName: row.display_name ?? undefined,
  email: row.email ?? undefined,
  lastSharedAt: row.last_shared_at,
});

const mapInvite = (row: InviteRow): FolderShareInvite => ({
  id: row.id,
  folderId: row.folder_id,
  ownerId: row.owner_id,
  email: row.email,
  role: row.role,
  scope: row.scope,
  status: row.status,
  token: row.token,
  acceptedByUserId: row.accepted_by_user_id ?? undefined,
  acceptedAt: row.accepted_at ?? undefined,
  emailDeliveryId: row.email_delivery_id ?? undefined,
  emailLastError: row.email_last_error ?? undefined,
  emailSentAt: row.email_sent_at ?? undefined,
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

export const loadFolderSharing = async (
  supabase: SupabaseClient,
  folderId: string,
): Promise<{
  access: FolderAccess[];
  error?: string;
  invites: FolderShareInvite[];
  shares: FolderShare[];
}> => {
  const [accessResult, sharesResult, invitesResult] = await Promise.all([
    supabase.rpc("trove_list_folder_access", {
      target_folder_id: folderId,
    }),
    supabase
      .from("trove_folder_shares")
      .select(
        "id, folder_id, owner_id, shared_with_user_id, role, scope, created_at, updated_at",
      )
      .eq("folder_id", folderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("trove_folder_share_invites")
      .select(
        "id, folder_id, owner_id, email, role, scope, status, token, accepted_by_user_id, accepted_at, email_delivery_id, email_last_error, email_sent_at, created_at, updated_at",
      )
      .eq("folder_id", folderId)
      .order("created_at", { ascending: false }),
  ]);

  if (sharesResult.error) {
    return {
      access: [],
      error: errorMessage(sharesResult.error, "Unable to load folder shares."),
      invites: [],
      shares: [],
    };
  }

  if (invitesResult.error) {
    return {
      access: [],
      error: errorMessage(invitesResult.error, "Unable to load folder invites."),
      invites: [],
      shares: [],
    };
  }

  const shares = ((sharesResult.data ?? []) as unknown as ShareRow[]).map(mapShare);
  const sharedUserIds = Array.from(new Set(shares.map((share) => share.sharedWithUserId)));
  let profilesById = new Map<string, FolderShareProfile>();

  if (sharedUserIds.length > 0) {
    const profilesResult = await supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url")
      .in("id", sharedUserIds);

    if (!profilesResult.error) {
      profilesById = new Map(
        ((profilesResult.data ?? []) as unknown as ProfileRow[]).map((row) => {
          const profile = mapProfile(row);
          return [profile.id, profile];
        }),
      );
    }
  }

  if (accessResult.error && !isMissingRpcError(accessResult.error, "trove_list_folder_access")) {
    return {
      access: [],
      error: errorMessage(accessResult.error, "Unable to load folder access."),
      invites: [],
      shares: [],
    };
  }

  const access = accessResult.error
    ? shares.map((share) => ({
        id: share.id,
        kind: "direct" as const,
        role: share.role,
        scope: share.scope,
        shareId: share.id,
        userId: share.sharedWithUserId,
        avatarUrl: profilesById.get(share.sharedWithUserId)?.avatarUrl,
        displayName: profilesById.get(share.sharedWithUserId)?.displayName,
        email: profilesById.get(share.sharedWithUserId)?.email,
        updatedAt: share.updatedAt,
      }))
    : ((accessResult.data ?? []) as unknown as AccessRow[]).map(mapAccess);

  return {
    access,
    invites: ((invitesResult.data ?? []) as unknown as InviteRow[]).map(mapInvite),
    shares: shares.map((share) => ({
      ...share,
      sharedWithProfile: profilesById.get(share.sharedWithUserId),
    })),
  };
};

export const shareFolderByEmail = async (
  supabase: SupabaseClient,
  input: {
    email: string;
    folderId: string;
    role: FolderShareRole;
    scope: FolderShareScope;
  },
): Promise<{ emailError?: string; emailSent?: boolean; error?: string; result?: "invite" | "share" }> => {
  const { data, error } = await supabase.functions.invoke("send-folder-share-invite", {
    body: {
      email: input.email,
      folderId: input.folderId,
      role: input.role,
      scope: input.scope,
    },
  });

  if (error) {
    return { error: errorMessage(error, "Unable to share this folder.") };
  }

  const response = data as ShareEmailFunctionResponse | null;
  if (response?.error) {
    return { error: response.error };
  }

  return {
    emailError: response?.emailError,
    emailSent: response?.emailSent ?? false,
    result: response?.result ?? (response?.share_id || response?.shareId ? "share" : "invite"),
  };
};

export const loadSavedCollaborators = async (
  supabase: SupabaseClient,
): Promise<{ collaborators: SavedCollaborator[]; error?: string }> => {
  const { data, error } = await supabase.rpc("trove_list_saved_collaborators");

  if (error) {
    if (isMissingRpcError(error, "trove_list_saved_collaborators")) {
      return { collaborators: [] };
    }

    return {
      collaborators: [],
      error: errorMessage(error, "Unable to load saved collaborators."),
    };
  }

  return {
    collaborators: ((data ?? []) as unknown as SavedCollaboratorRow[]).map(mapSavedCollaborator),
  };
};

export const shareFolderWithCollaborator = async (
  supabase: SupabaseClient,
  input: {
    collaborator: SavedCollaborator;
    folderId: string;
    role: FolderShareRole;
    scope: FolderShareScope;
  },
): Promise<{ emailError?: string; emailSent?: boolean; error?: string; result?: "invite" | "share" }> => {
  const { error } = await supabase.rpc("trove_share_folder_with_user", {
    target_folder_id: input.folderId,
    target_user_id: input.collaborator.id,
    share_role: input.role,
    share_scope: input.scope,
  });

  return error ? { error: errorMessage(error, "Unable to share with this collaborator.") } : { result: "share" };
};

export const updateFolderShare = async (
  supabase: SupabaseClient,
  shareId: string,
  updates: { role?: FolderShareRole; scope?: FolderShareScope },
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("trove_folder_shares")
    .update(updates)
    .eq("id", shareId);

  return error ? { error: errorMessage(error, "Unable to update access.") } : {};
};

export const removeFolderShare = async (
  supabase: SupabaseClient,
  shareId: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("trove_folder_shares")
    .delete()
    .eq("id", shareId);

  return error ? { error: errorMessage(error, "Unable to remove access.") } : {};
};

export const revokeFolderInvite = async (
  supabase: SupabaseClient,
  inviteId: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("trove_folder_share_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);

  return error ? { error: errorMessage(error, "Unable to revoke invite.") } : {};
};

export const acceptFolderInvite = async (
  supabase: SupabaseClient,
  token: string,
): Promise<{ error?: string; shareId?: string }> => {
  const { data, error } = await supabase.rpc("trove_accept_folder_invite", {
    invite_token: token,
  });

  if (error) {
    return { error: errorMessage(error, "Unable to accept this invite.") };
  }

  return { shareId: typeof data === "string" ? data : undefined };
};

export const rememberPendingFolderInviteToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
  } catch (error) {
    console.warn("Failed to remember pending folder invite", error);
  }
};

export const readPendingFolderInviteToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  } catch (error) {
    console.warn("Failed to read pending folder invite", error);
    return null;
  }
};

export const clearPendingFolderInviteToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch (error) {
    console.warn("Failed to clear pending folder invite", error);
  }
};
