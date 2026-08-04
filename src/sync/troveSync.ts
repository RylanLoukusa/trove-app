import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessRole, Folder, SavedItem, ShareScope, TagGroup, TagOption, TroveData } from "../types/models";
import {
  baselineFromTroveData,
  loadSyncBaseline,
  saveSyncBaseline,
  SyncConflictField,
  SyncConflictSummary,
} from "./syncBaseline";
import { canEditFolderContentRecord, canManageFolderRecord } from "../utils/access";
import { friendlyErrorMessage } from "../utils/errorMessages";
import {
  normalizeItemType,
  normalizeSavedItem,
  normalizeTroveData,
} from "../utils/itemTypes";

const remoteUpdatedAtKey = (userId: string) =>
  `trove:remoteUpdatedAt:${userId}`;

type PullTroveResult =
  | { kind: "applied"; data: TroveData; remoteUpdatedAt: string }
  | { kind: "noop_up_to_date"; remoteUpdatedAt: string }
  | { kind: "noop_invalid" }
  | { kind: "error" }
  | { kind: "no_row" };

type TroveRealtimeSubscription = {
  unsubscribe: () => void;
};

type PushTroveResult = {
  conflict?: SyncConflictSummary;
  error?: string;
  ok: boolean;
  updatedAt?: string;
};

type PushTroveOptions = {
  skipConflictCheck?: boolean;
};

type SyncStateRow = {
  updated_at: string;
  normalized_initialized?: boolean;
};

type LegacyRemoteRow = {
  payload: unknown;
  updated_at: string;
};

type FolderRow = {
  id: string;
  owner_id: string;
  parent_folder_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  purpose: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  owner_id: string;
  created_by: string | null;
  folder_id: string | null;
  title: string;
  description: string | null;
  type: SavedItem["type"];
  url: string | null;
  source_url: string | null;
  source_platform: string | null;
  shared_text: string | null;
  media_uri: string | null;
  thumbnail_uri: string | null;
  media: unknown;
  media_items: unknown;
  attachments: unknown;
  list_items: unknown;
  rich_text: string | null;
  connections: unknown;
  tags: unknown; // holds tag-option ids, not free text (column name kept for continuity)
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type TagGroupRow = {
  id: string;
  owner_id: string;
  name: string;
  selection_mode: TagGroup["selectionMode"];
  allow_inline_create: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type TagOptionRow = {
  id: string;
  group_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ShareRow = {
  folder_id: string;
  shared_with_user_id: string;
  role: Exclude<AccessRole, "owner">;
  scope: ShareScope;
  updated_at: string;
};

const isTrovePayload = (payload: unknown): payload is TroveData => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<TroveData>;
  return Array.isArray(candidate.folders) && Array.isArray(candidate.items);
};

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return fallback;
};

const isSyncConflictError = (error: unknown): boolean =>
  errorMessage(error, "").toLowerCase().includes("sync conflict");

const folderSyncErrorMessage = (error: unknown): string => {
  const message = errorMessage(error, "Unable to sync this folder before sharing.");
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("row-level security") &&
    lowerMessage.includes("trove_folders")
  ) {
    return "This folder could not be synced as yours. Refresh your data, then try sharing it again.";
  }

  return friendlyErrorMessage(message);
};

const readStoredRemoteUpdatedAt = async (
  userId: string,
): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(remoteUpdatedAtKey(userId));
  } catch (error) {
    console.warn("Failed to read stored remote timestamp", error);
    return null;
  }
};

const writeStoredRemoteUpdatedAt = async (
  userId: string,
  updatedAt: string,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(remoteUpdatedAtKey(userId), updatedAt);
  } catch (error) {
    console.warn("Failed to persist remote timestamp", error);
  }
};

const clearStoredRemoteUpdatedAt = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(remoteUpdatedAtKey(userId));
  } catch (error) {
    console.warn("Failed to clear remote timestamp", error);
  }
};

const optional = <T>(value: T | undefined): T | null =>
  value === undefined ? null : value;

const optionalArray = <T>(value: T[] | undefined): T[] | null =>
  Array.isArray(value) ? value : null;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const objectValue = <T>(value: unknown): T | undefined =>
  value && typeof value === "object" ? (value as T) : undefined;

const hasTroveData = (data: TroveData): boolean =>
  data.folders.length > 0 || data.items.length > 0 || data.tagGroups.length > 0 || data.tagOptions.length > 0;

const latestTimestamp = (timestamps: Array<string | null | undefined>) => {
  const validTimestamps = timestamps.filter(
    (timestamp): timestamp is string => typeof timestamp === "string",
  );

  if (validTimestamps.length === 0) {
    return null;
  }

  return validTimestamps.sort()[validTimestamps.length - 1] ?? null;
};

const sortFoldersParentFirst = (folders: Folder[]): Folder[] => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  const sorted: Folder[] = [];

  const visit = (folder: Folder) => {
    if (visited.has(folder.id)) {
      return;
    }

    if (folder.parentFolderId) {
      const parent = byId.get(folder.parentFolderId);
      if (parent) {
        visit(parent);
      }
    }

    visited.add(folder.id);
    sorted.push(folder);
  };

  folders.forEach(visit);
  return sorted;
};

const collectFolderBranchForSharing = (
  troveData: TroveData,
  userId: string,
  folderId: string,
): { error?: string; folders?: Folder[]; ok: boolean } => {
  const normalizedData = normalizeTroveData(troveData);
  const foldersById = new Map(normalizedData.folders.map((folder) => [folder.id, folder]));
  const branch: Folder[] = [];
  const visited = new Set<string>();
  let current = foldersById.get(folderId);

  if (!current) {
    return { ok: false, error: "Folder not found." };
  }

  while (current) {
    if (visited.has(current.id)) {
      return {
        ok: false,
        error: "This folder has a parent loop. Move it before sharing.",
      };
    }

    visited.add(current.id);

    if ((current.ownerId ?? userId) !== userId || !canManageFolderRecord(current)) {
      return { ok: false, error: "Only the folder owner can share this folder." };
    }

    branch.unshift(current);

    if (!current.parentFolderId) {
      break;
    }

    current = foldersById.get(current.parentFolderId);

    if (!current) {
      return {
        ok: false,
        error: "This folder's parent is missing locally. Refresh and try sharing again.",
      };
    }
  }

  return { ok: true, folders: branch };
};

const folderScopeContains = (
  rootFolderId: string,
  targetFolderId: string,
  foldersById: Map<string, FolderRow>,
): boolean => {
  const seen = new Set<string>();
  let current = foldersById.get(targetFolderId);

  while (current && !seen.has(current.id)) {
    if (current.id === rootFolderId) return true;
    seen.add(current.id);
    current = current.parent_folder_id ? foldersById.get(current.parent_folder_id) : undefined;
  }

  return false;
};

const shareRoleRank: Record<ShareRow["role"], number> = {
  viewer: 1,
  editor: 2,
};

const findShareForFolder = (
  folderId: string,
  foldersById: Map<string, FolderRow>,
  shares: ShareRow[],
): ShareRow | undefined =>
  shares
    .filter(
      (share) =>
        share.folder_id === folderId ||
        (share.scope === "folder_and_subfolders" && folderScopeContains(share.folder_id, folderId, foldersById)),
    )
    .sort((a, b) => shareRoleRank[b.role] - shareRoleRank[a.role])[0];

const folderRowToFolder = (row: FolderRow, userId: string, share?: ShareRow): Folder => ({
  id: row.id,
  name: row.name,
  parentFolderId: row.parent_folder_id,
  icon: row.icon ?? undefined,
  color: row.color ?? undefined,
  purpose: row.purpose ?? undefined,
  ownerId: row.owner_id,
  accessRole: row.owner_id === userId ? "owner" : share?.role ?? "viewer",
  sharedRootFolderId: row.owner_id === userId ? undefined : share?.folder_id,
  sharedScope: row.owner_id === userId ? undefined : share?.scope,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const itemRowToSavedItem = (
  row: ItemRow,
  userId: string,
  folderAccessById: Map<string, AccessRole>,
): SavedItem =>
  normalizeSavedItem({
    id: row.id,
    folderId: row.folder_id ?? "",
    title: row.title,
    description: row.description ?? undefined,
    type: normalizeItemType(row.type),
    url: row.url ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sourcePlatform: row.source_platform ?? undefined,
    sharedText: row.shared_text ?? undefined,
    mediaUri: row.media_uri ?? undefined,
    thumbnailUri: row.thumbnail_uri ?? undefined,
    media: objectValue<SavedItem["media"]>(row.media),
    mediaItems: Array.isArray(row.media_items)
      ? (row.media_items as SavedItem["mediaItems"])
      : undefined,
    attachments: Array.isArray(row.attachments)
      ? (row.attachments as SavedItem["attachments"])
      : undefined,
    listItems: Array.isArray(row.list_items)
      ? (row.list_items as SavedItem["listItems"])
      : undefined,
    richText: row.rich_text ?? undefined,
    connections: Array.isArray(row.connections)
      ? (row.connections as SavedItem["connections"])
      : undefined,
    tagOptionIds: stringArray(row.tags),
    ownerId: row.owner_id,
    createdBy: row.created_by ?? undefined,
    accessRole: row.owner_id === userId ? "owner" : row.folder_id ? folderAccessById.get(row.folder_id) ?? "viewer" : "viewer",
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const folderToRow = (folder: Folder, userId: string): FolderRow => ({
  id: folder.id,
  owner_id: userId,
  parent_folder_id: folder.parentFolderId || null,
  name: folder.name,
  icon: optional(folder.icon),
  color: optional(folder.color),
  purpose: optional(folder.purpose),
  created_at: folder.createdAt,
  updated_at: folder.updatedAt,
});

const savedItemToRow = (
  item: SavedItem,
  userId: string,
  foldersById: Map<string, Folder>,
): ItemRow => {
  const normalizedItem = normalizeSavedItem(item);
  const folderOwnerId = normalizedItem.folderId
    ? foldersById.get(normalizedItem.folderId)?.ownerId
    : undefined;
  const ownerId = folderOwnerId ?? normalizedItem.ownerId ?? userId;

  return {
    id: normalizedItem.id,
    owner_id: ownerId,
    created_by: normalizedItem.createdBy ?? userId,
    folder_id: normalizedItem.folderId || null,
    title: normalizedItem.title,
    description: optional(normalizedItem.description),
    type: normalizeItemType(normalizedItem.type),
    url: optional(normalizedItem.url),
    source_url: optional(normalizedItem.sourceUrl),
    source_platform: optional(normalizedItem.sourcePlatform),
    shared_text: optional(normalizedItem.sharedText),
    media_uri: optional(normalizedItem.mediaUri),
    thumbnail_uri: optional(normalizedItem.thumbnailUri),
    media: optional(normalizedItem.media),
    media_items: optionalArray(normalizedItem.mediaItems),
    attachments: optionalArray(normalizedItem.attachments),
    list_items: optionalArray(normalizedItem.listItems),
    rich_text: optional(normalizedItem.richText),
    connections: optionalArray(normalizedItem.connections),
    tags: normalizedItem.tagOptionIds ?? [],
    notes: optional(normalizedItem.notes),
    created_at: normalizedItem.createdAt,
    updated_at: normalizedItem.updatedAt,
  };
};

const tagGroupRowToTagGroup = (row: TagGroupRow): TagGroup => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  selectionMode: row.selection_mode,
  allowInlineCreate: row.allow_inline_create,
  isSystem: row.is_system,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tagGroupToRow = (tagGroup: TagGroup, userId: string): TagGroupRow => ({
  id: tagGroup.id,
  owner_id: tagGroup.ownerId || userId,
  name: tagGroup.name,
  selection_mode: tagGroup.selectionMode,
  allow_inline_create: tagGroup.allowInlineCreate,
  is_system: tagGroup.isSystem,
  sort_order: tagGroup.sortOrder,
  created_at: tagGroup.createdAt,
  updated_at: tagGroup.updatedAt,
});

const tagOptionRowToTagOption = (row: TagOptionRow): TagOption => ({
  id: row.id,
  groupId: row.group_id,
  name: row.name,
  color: row.color ?? undefined,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tagOptionToRow = (tagOption: TagOption): TagOptionRow => ({
  id: tagOption.id,
  group_id: tagOption.groupId,
  name: tagOption.name,
  color: optional(tagOption.color),
  sort_order: tagOption.sortOrder,
  created_at: tagOption.createdAt,
  updated_at: tagOption.updatedAt,
});

const upsertFolderRowForCurrentUser = async (
  supabase: SupabaseClient,
  folderRow: FolderRow,
  expectedUpdatedAt?: string,
): Promise<void> => {
  const { error } = await supabase.rpc("trove_upsert_folder_for_current_user", {
    target_color: folderRow.color,
    target_created_at: folderRow.created_at,
    target_expected_updated_at: expectedUpdatedAt ?? null,
    target_folder_id: folderRow.id,
    target_icon: folderRow.icon,
    target_name: folderRow.name,
    target_parent_folder_id: folderRow.parent_folder_id,
    target_purpose: folderRow.purpose,
    target_updated_at: folderRow.updated_at,
  });

  if (error) {
    throw error;
  }
};

const upsertItemRowForCurrentUser = async (
  supabase: SupabaseClient,
  itemRow: ItemRow,
  expectedUpdatedAt?: string,
): Promise<void> => {
  const { error } = await supabase.rpc("trove_upsert_item_for_current_user", {
    target_attachments: itemRow.attachments,
    target_connections: itemRow.connections,
    target_created_at: itemRow.created_at,
    target_description: itemRow.description,
    target_expected_updated_at: expectedUpdatedAt ?? null,
    target_folder_id: itemRow.folder_id,
    target_item_id: itemRow.id,
    target_list_items: itemRow.list_items,
    target_media: itemRow.media,
    target_media_items: itemRow.media_items,
    target_media_uri: itemRow.media_uri,
    target_notes: itemRow.notes,
    // status/priority are no longer modeled client-side; the columns still require
    // a valid value so we send inert placeholders that satisfy the check constraints.
    target_priority: "medium",
    target_rich_text: itemRow.rich_text,
    target_shared_text: itemRow.shared_text,
    target_source_platform: itemRow.source_platform,
    target_source_url: itemRow.source_url,
    target_status: "waiting",
    target_tags: itemRow.tags,
    target_thumbnail_uri: itemRow.thumbnail_uri,
    target_title: itemRow.title,
    target_type: itemRow.type,
    target_updated_at: itemRow.updated_at,
    target_url: itemRow.url,
  });

  if (error) {
    throw error;
  }
};

const upsertTagGroupRowForCurrentUser = async (
  supabase: SupabaseClient,
  tagGroupRow: TagGroupRow,
  expectedUpdatedAt?: string,
): Promise<void> => {
  const { error } = await supabase.rpc("trove_upsert_tag_group_for_current_user", {
    target_allow_inline_create: tagGroupRow.allow_inline_create,
    target_created_at: tagGroupRow.created_at,
    target_expected_updated_at: expectedUpdatedAt ?? null,
    target_group_id: tagGroupRow.id,
    target_is_system: tagGroupRow.is_system,
    target_name: tagGroupRow.name,
    target_selection_mode: tagGroupRow.selection_mode,
    target_sort_order: tagGroupRow.sort_order,
    target_updated_at: tagGroupRow.updated_at,
  });

  if (error) {
    throw error;
  }
};

const upsertTagOptionRowForCurrentUser = async (
  supabase: SupabaseClient,
  tagOptionRow: TagOptionRow,
  expectedUpdatedAt?: string,
): Promise<void> => {
  const { error } = await supabase.rpc("trove_upsert_tag_option_for_current_user", {
    target_color: tagOptionRow.color,
    target_created_at: tagOptionRow.created_at,
    target_expected_updated_at: expectedUpdatedAt ?? null,
    target_group_id: tagOptionRow.group_id,
    target_name: tagOptionRow.name,
    target_option_id: tagOptionRow.id,
    target_sort_order: tagOptionRow.sort_order,
    target_updated_at: tagOptionRow.updated_at,
  });

  if (error) {
    throw error;
  }
};

const deleteOwnedRowsMissing = async (
  supabase: SupabaseClient,
  table: "trove_folders" | "trove_items" | "trove_tag_groups" | "trove_tag_options",
  ids: string[],
  knownUpdatedAt: Record<string, string>,
  skipConflictCheck: boolean,
): Promise<void> => {
  const rpcByTable: Record<typeof table, { name: string; idParam: string }> = {
    trove_folders: { name: "trove_delete_missing_folders_for_current_user", idParam: "local_folder_ids" },
    trove_items: { name: "trove_delete_missing_items_for_current_user", idParam: "local_item_ids" },
    trove_tag_groups: { name: "trove_delete_missing_tag_groups_for_current_user", idParam: "local_group_ids" },
    trove_tag_options: { name: "trove_delete_missing_tag_options_for_current_user", idParam: "local_option_ids" },
  };
  const rpc = rpcByTable[table];

  const { error } = await supabase.rpc(rpc.name, {
    known_updated_at: knownUpdatedAt,
    skip_conflict_check: skipConflictCheck,
    [rpc.idParam]: ids,
  });

  if (error) {
    throw error;
  }
};

const deleteTroveItemForUser = async (
  supabase: SupabaseClient,
  itemId: string,
  expectedUpdatedAt?: string,
  skipConflictCheck = false,
): Promise<PushTroveResult> => {
  const { error } = await supabase.rpc("trove_delete_item_for_current_user", {
    skip_conflict_check: skipConflictCheck,
    target_expected_updated_at: expectedUpdatedAt ?? null,
    target_item_id: itemId,
  });

  if (!error) {
    return { ok: true };
  }

  if (isSyncConflictError(error)) {
    return {
      ok: false,
      error: "This item changed somewhere else. Refresh before deleting it.",
    };
  }

  return { ok: false, error: friendlyErrorMessage(errorMessage(error, "Unable to delete this item.")) };
};

const fetchLegacyTroveDataForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { kind: "data"; data: TroveData; updatedAt: string }
  | { kind: "no_row" }
  | { kind: "invalid" }
  | { kind: "error" }
> => {
  const { data, error } = await supabase
    .from("trove_data")
    .select("payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to pull legacy remote Trove data", error);
    return { kind: "error" };
  }

  if (!data) {
    return { kind: "no_row" };
  }

  const row = data as LegacyRemoteRow;
  if (!isTrovePayload(row.payload)) {
    console.warn("Remote Trove payload is invalid");
    return { kind: "invalid" };
  }

  return {
    kind: "data",
    data: normalizeTroveData(row.payload),
    updatedAt: row.updated_at,
  };
};

const fetchNormalizedTroveDataForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | {
      kind: "data";
      data: TroveData;
      latestRowUpdatedAt: string | null;
      syncState: SyncStateRow | null;
    }
  | { kind: "error" }
> => {
  const [syncStateResult, foldersResult, itemsResult, sharesResult, tagGroupsResult, tagOptionsResult] = await Promise.all([
    supabase
      .from("trove_sync_state")
      .select("updated_at, normalized_initialized")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("trove_folders")
      .select(
        "id, owner_id, parent_folder_id, name, icon, color, purpose, created_at, updated_at",
      ),
    supabase
      .from("trove_items")
      .select(
        [
          "id",
          "owner_id",
          "created_by",
          "folder_id",
          "title",
          "description",
          "type",
          "url",
          "source_url",
          "source_platform",
          "shared_text",
          "media_uri",
          "thumbnail_uri",
          "media",
          "media_items",
          "attachments",
          "list_items",
          "rich_text",
          "connections",
          "tags",
          "notes",
          "created_at",
          "updated_at",
        ].join(", "),
      ),
    supabase
      .from("trove_folder_shares")
      .select("folder_id, shared_with_user_id, role, scope, updated_at")
      .eq("shared_with_user_id", userId),
    supabase
      .from("trove_tag_groups")
      .select("id, owner_id, name, selection_mode, allow_inline_create, is_system, sort_order, created_at, updated_at"),
    supabase
      .from("trove_tag_options")
      .select("id, group_id, name, color, sort_order, created_at, updated_at"),
  ]);

  if (syncStateResult.error) {
    console.warn("Failed to pull Trove sync state", syncStateResult.error);
    return { kind: "error" };
  }

  if (foldersResult.error) {
    console.warn("Failed to pull remote Trove folders", foldersResult.error);
    return { kind: "error" };
  }

  if (itemsResult.error) {
    console.warn("Failed to pull remote Trove items", itemsResult.error);
    return { kind: "error" };
  }

  if (sharesResult.error) {
    console.warn("Failed to pull remote Trove shares", sharesResult.error);
    return { kind: "error" };
  }

  if (tagGroupsResult.error) {
    console.warn("Failed to pull remote Trove tag groups", tagGroupsResult.error);
    return { kind: "error" };
  }

  if (tagOptionsResult.error) {
    console.warn("Failed to pull remote Trove tag options", tagOptionsResult.error);
    return { kind: "error" };
  }

  const folderRows = (foldersResult.data ?? []) as unknown as FolderRow[];
  const shares = (sharesResult.data ?? []) as unknown as ShareRow[];
  const folderRowsById = new Map(folderRows.map((folder) => [folder.id, folder]));
  const folders = folderRows.map((folder) =>
    folderRowToFolder(folder, userId, findShareForFolder(folder.id, folderRowsById, shares)),
  );
  const folderAccessById = new Map(
    folders.map((folder) => [folder.id, (folder.accessRole ?? "owner") as AccessRole]),
  );
  const items = ((itemsResult.data ?? []) as unknown as ItemRow[]).map((item) =>
    itemRowToSavedItem(item, userId, folderAccessById),
  );
  const tagGroups = ((tagGroupsResult.data ?? []) as unknown as TagGroupRow[]).map(tagGroupRowToTagGroup);
  const tagOptions = ((tagOptionsResult.data ?? []) as unknown as TagOptionRow[]).map(tagOptionRowToTagOption);

  const latestRowUpdatedAt = latestTimestamp([
    ...folders.map((folder) => folder.updatedAt),
    ...items.map((item) => item.updatedAt),
    ...shares.map((share) => share.updated_at),
    ...tagGroups.map((tagGroup) => tagGroup.updatedAt),
    ...tagOptions.map((tagOption) => tagOption.updatedAt),
  ]);

  return {
    kind: "data",
    data: { folders, items, tagGroups, tagOptions },
    latestRowUpdatedAt,
    syncState: (syncStateResult.data as SyncStateRow | null) ?? null,
  };
};

const upsertSyncState = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<string> => {
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("trove_sync_state")
    .upsert(
      {
        user_id: userId,
        normalized_initialized: true,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    )
    .select("updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return ((data as SyncStateRow | null)?.updated_at as string | undefined) ?? updatedAt;
};

const remoteChangedSinceBaseline = (
  remoteUpdatedAt: string,
  baselineUpdatedAt?: string,
): boolean =>
  typeof baselineUpdatedAt === "string" && remoteUpdatedAt > baselineUpdatedAt;

const conflictValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "Empty";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "Empty";
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (typeof entry === "object" && entry !== null && "text" in entry) {
          const text = (entry as { text?: unknown }).text;
          return typeof text === "string" ? text : JSON.stringify(entry);
        }
        return JSON.stringify(entry);
      })
      .join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const changedFields = <T extends Record<string, unknown>>(
  local: T,
  remote: T,
  fieldNames: Array<keyof T>,
): SyncConflictField[] =>
  fieldNames
    .filter((fieldName) => JSON.stringify(local[fieldName]) !== JSON.stringify(remote[fieldName]))
    .map((fieldName) => ({
      field: String(fieldName),
      localRawValue: local[fieldName],
      localValue: conflictValue(local[fieldName]),
      remoteRawValue: remote[fieldName],
      remoteValue: conflictValue(remote[fieldName]),
    }));

const folderConflictFields = (local: Folder, remote: Folder): SyncConflictField[] =>
  changedFields(local as unknown as Record<string, unknown>, remote as unknown as Record<string, unknown>, [
    "name",
    "parentFolderId",
    "icon",
    "color",
    "purpose",
  ]);

const itemConflictFields = (local: SavedItem, remote: SavedItem): SyncConflictField[] =>
  changedFields(local as unknown as Record<string, unknown>, remote as unknown as Record<string, unknown>, [
    "title",
    "description",
    "folderId",
    "type",
    "url",
    "sourceUrl",
    "sourcePlatform",
    "sharedText",
    "media",
    "mediaItems",
    "attachments",
    "listItems",
    "richText",
    "connections",
    "tagOptionIds",
    "notes",
  ]);

const tagGroupConflictFields = (local: TagGroup, remote: TagGroup): SyncConflictField[] =>
  changedFields(local as unknown as Record<string, unknown>, remote as unknown as Record<string, unknown>, [
    "name",
    "selectionMode",
    "allowInlineCreate",
    "isSystem",
    "sortOrder",
  ]);

const tagOptionConflictFields = (local: TagOption, remote: TagOption): SyncConflictField[] =>
  changedFields(local as unknown as Record<string, unknown>, remote as unknown as Record<string, unknown>, [
    "name",
    "color",
    "groupId",
    "sortOrder",
  ]);

const firstSyncConflict = async (
  supabase: SupabaseClient,
  userId: string,
  troveData: TroveData,
): Promise<SyncConflictSummary | null> => {
  const baseline = await loadSyncBaseline(userId);
  const hasBaseline =
    Object.keys(baseline.folders).length > 0 ||
    Object.keys(baseline.items).length > 0 ||
    Object.keys(baseline.tagGroups).length > 0 ||
    Object.keys(baseline.tagOptions).length > 0;

  if (!hasBaseline) {
    const remoteResult = await fetchNormalizedTroveDataForUser(supabase, userId);
    if (remoteResult.kind === "error") {
      throw new Error("Unable to check the latest synced data before saving.");
    }

    const remoteFolder = remoteResult.data.folders.find((folder) => (folder.ownerId ?? userId) === userId);
    if (remoteFolder) {
      return {
        entityId: remoteFolder.id,
        entityKind: "folders",
        reason: "remote_changed",
        remoteLabel: remoteFolder.name,
        remoteUpdatedAt: remoteFolder.updatedAt,
      };
    }

    const remoteItem = remoteResult.data.items.find((item) => (item.ownerId ?? userId) === userId);
    if (remoteItem) {
      return {
        entityId: remoteItem.id,
        entityKind: "items",
        reason: "remote_changed",
        remoteLabel: remoteItem.title,
        remoteUpdatedAt: remoteItem.updatedAt,
      };
    }

    // Tag options always belong to a group, so group ownership already covers option
    // ownership here — no separate remote-option check needed for the no-baseline case.
    const remoteTagGroup = remoteResult.data.tagGroups.find((tagGroup) => (tagGroup.ownerId ?? userId) === userId);
    if (remoteTagGroup) {
      return {
        entityId: remoteTagGroup.id,
        entityKind: "tagGroups",
        reason: "remote_changed",
        remoteLabel: remoteTagGroup.name,
        remoteUpdatedAt: remoteTagGroup.updatedAt,
      };
    }

    return null;
  }

  const normalizedData = normalizeTroveData(troveData);
  const localOwnedFolders = normalizedData.folders.filter((folder) =>
    (folder.ownerId ?? userId) === userId && canManageFolderRecord(folder),
  );
  const localFoldersById = new Map(localOwnedFolders.map((folder) => [folder.id, folder]));
  const localItemsById = new Map(normalizedData.items.map((item) => [item.id, item]));
  const localOwnedTagGroups = normalizedData.tagGroups.filter((tagGroup) => (tagGroup.ownerId ?? userId) === userId);
  const localTagGroupsById = new Map(localOwnedTagGroups.map((tagGroup) => [tagGroup.id, tagGroup]));
  const localTagOptionsById = new Map(normalizedData.tagOptions.map((tagOption) => [tagOption.id, tagOption]));

  const remoteResult = await fetchNormalizedTroveDataForUser(supabase, userId);
  if (remoteResult.kind === "error") {
    throw new Error("Unable to check the latest synced data before saving.");
  }

  const remoteFolders = remoteResult.data.folders.filter((folder) =>
    (folder.ownerId ?? userId) === userId && canManageFolderRecord(folder),
  );
  const remoteFolderIds = new Set(remoteFolders.map((folder) => folder.id));
  for (const remoteFolder of remoteFolders) {
    const localFolder = localFoldersById.get(remoteFolder.id);
    const baselineUpdatedAt = baseline.folders[remoteFolder.id];

    if (localFolder) {
      if (
        localFolder.updatedAt !== remoteFolder.updatedAt &&
        remoteChangedSinceBaseline(remoteFolder.updatedAt, baselineUpdatedAt)
      ) {
        return {
          entityId: remoteFolder.id,
          entityKind: "folders",
          fields: folderConflictFields(localFolder, remoteFolder),
          localLabel: localFolder.name,
          localUpdatedAt: localFolder.updatedAt,
          reason: "remote_changed",
          remoteLabel: remoteFolder.name,
          remoteUpdatedAt: remoteFolder.updatedAt,
        };
      }
    } else if (
      baselineUpdatedAt === undefined ||
      remoteChangedSinceBaseline(remoteFolder.updatedAt, baselineUpdatedAt)
    ) {
      return {
        entityId: remoteFolder.id,
        entityKind: "folders",
        reason: "remote_changed",
        remoteLabel: remoteFolder.name,
        remoteUpdatedAt: remoteFolder.updatedAt,
      };
    }
  }

  for (const localFolder of localFoldersById.values()) {
    if (baseline.folders[localFolder.id] && !remoteFolderIds.has(localFolder.id)) {
      return {
        entityId: localFolder.id,
        entityKind: "folders",
        localLabel: localFolder.name,
        localUpdatedAt: localFolder.updatedAt,
        reason: "remote_deleted",
        remoteUpdatedAt: baseline.folders[localFolder.id],
      };
    }
  }

  const remoteItemsById = new Map(remoteResult.data.items.map((item) => [item.id, item]));

  for (const remoteItem of remoteItemsById.values()) {
    const localItem = localItemsById.get(remoteItem.id);
    const baselineUpdatedAt = baseline.items[remoteItem.id];

    if (localItem) {
      if (
        localItem.updatedAt !== remoteItem.updatedAt &&
        remoteChangedSinceBaseline(remoteItem.updatedAt, baselineUpdatedAt)
      ) {
        return {
          entityId: remoteItem.id,
          entityKind: "items",
          fields: itemConflictFields(localItem, remoteItem),
          localLabel: localItem.title,
          localUpdatedAt: localItem.updatedAt,
          reason: "remote_changed",
          remoteLabel: remoteItem.title,
          remoteUpdatedAt: remoteItem.updatedAt,
        };
      }
    } else if (
      baselineUpdatedAt === undefined ||
      remoteChangedSinceBaseline(remoteItem.updatedAt, baselineUpdatedAt)
    ) {
      return {
        entityId: remoteItem.id,
        entityKind: "items",
        reason: "remote_changed",
        remoteLabel: remoteItem.title,
        remoteUpdatedAt: remoteItem.updatedAt,
      };
    }
  }

  for (const localItem of localItemsById.values()) {
    if (baseline.items[localItem.id] && !remoteItemsById.has(localItem.id)) {
      return {
        entityId: localItem.id,
        entityKind: "items",
        localLabel: localItem.title,
        localUpdatedAt: localItem.updatedAt,
        reason: "remote_deleted",
        remoteUpdatedAt: baseline.items[localItem.id],
      };
    }
  }

  const remoteTagGroups = remoteResult.data.tagGroups.filter((tagGroup) => (tagGroup.ownerId ?? userId) === userId);
  const remoteTagGroupIds = new Set(remoteTagGroups.map((tagGroup) => tagGroup.id));
  for (const remoteTagGroup of remoteTagGroups) {
    const localTagGroup = localTagGroupsById.get(remoteTagGroup.id);
    const baselineUpdatedAt = baseline.tagGroups[remoteTagGroup.id];

    if (localTagGroup) {
      if (
        localTagGroup.updatedAt !== remoteTagGroup.updatedAt &&
        remoteChangedSinceBaseline(remoteTagGroup.updatedAt, baselineUpdatedAt)
      ) {
        return {
          entityId: remoteTagGroup.id,
          entityKind: "tagGroups",
          fields: tagGroupConflictFields(localTagGroup, remoteTagGroup),
          localLabel: localTagGroup.name,
          localUpdatedAt: localTagGroup.updatedAt,
          reason: "remote_changed",
          remoteLabel: remoteTagGroup.name,
          remoteUpdatedAt: remoteTagGroup.updatedAt,
        };
      }
    } else if (
      baselineUpdatedAt === undefined ||
      remoteChangedSinceBaseline(remoteTagGroup.updatedAt, baselineUpdatedAt)
    ) {
      return {
        entityId: remoteTagGroup.id,
        entityKind: "tagGroups",
        reason: "remote_changed",
        remoteLabel: remoteTagGroup.name,
        remoteUpdatedAt: remoteTagGroup.updatedAt,
      };
    }
  }

  for (const localTagGroup of localTagGroupsById.values()) {
    if (baseline.tagGroups[localTagGroup.id] && !remoteTagGroupIds.has(localTagGroup.id)) {
      return {
        entityId: localTagGroup.id,
        entityKind: "tagGroups",
        localLabel: localTagGroup.name,
        localUpdatedAt: localTagGroup.updatedAt,
        reason: "remote_deleted",
        remoteUpdatedAt: baseline.tagGroups[localTagGroup.id],
      };
    }
  }

  // Tag options only need checking against groups we own locally — an option's
  // owning group determines writability the same way an item's folder does.
  const remoteTagOptions = remoteResult.data.tagOptions.filter((tagOption) =>
    localTagGroupsById.has(tagOption.groupId) || remoteTagGroupIds.has(tagOption.groupId),
  );
  const remoteTagOptionsById = new Map(remoteTagOptions.map((tagOption) => [tagOption.id, tagOption]));

  for (const remoteTagOption of remoteTagOptionsById.values()) {
    const localTagOption = localTagOptionsById.get(remoteTagOption.id);
    const baselineUpdatedAt = baseline.tagOptions[remoteTagOption.id];

    if (localTagOption) {
      if (
        localTagOption.updatedAt !== remoteTagOption.updatedAt &&
        remoteChangedSinceBaseline(remoteTagOption.updatedAt, baselineUpdatedAt)
      ) {
        return {
          entityId: remoteTagOption.id,
          entityKind: "tagOptions",
          fields: tagOptionConflictFields(localTagOption, remoteTagOption),
          localLabel: localTagOption.name,
          localUpdatedAt: localTagOption.updatedAt,
          reason: "remote_changed",
          remoteLabel: remoteTagOption.name,
          remoteUpdatedAt: remoteTagOption.updatedAt,
        };
      }
    } else if (
      baselineUpdatedAt === undefined ||
      remoteChangedSinceBaseline(remoteTagOption.updatedAt, baselineUpdatedAt)
    ) {
      return {
        entityId: remoteTagOption.id,
        entityKind: "tagOptions",
        reason: "remote_changed",
        remoteLabel: remoteTagOption.name,
        remoteUpdatedAt: remoteTagOption.updatedAt,
      };
    }
  }

  for (const localTagOption of localTagOptionsById.values()) {
    if (
      baseline.tagOptions[localTagOption.id] &&
      !remoteTagOptionsById.has(localTagOption.id) &&
      localTagGroupsById.has(localTagOption.groupId)
    ) {
      return {
        entityId: localTagOption.id,
        entityKind: "tagOptions",
        localLabel: localTagOption.name,
        localUpdatedAt: localTagOption.updatedAt,
        reason: "remote_deleted",
        remoteUpdatedAt: baseline.tagOptions[localTagOption.id],
      };
    }
  }

  return null;
};

const replaceNormalizedTroveDataForUser = async (
  supabase: SupabaseClient,
  userId: string,
  troveData: TroveData,
  options: PushTroveOptions = {},
): Promise<PushTroveResult> => {
  const normalizedData = normalizeTroveData(troveData);
  const foldersById = new Map(normalizedData.folders.map((folder) => [folder.id, folder]));
  const ownedFolders = normalizedData.folders.filter((folder) =>
    (folder.ownerId ?? userId) === userId && canManageFolderRecord(folder),
  );
  const writableItems = normalizedData.items.filter((item) => {
    if (!item.folderId) {
      return (item.ownerId ?? userId) === userId;
    }

    return canEditFolderContentRecord(foldersById.get(item.folderId));
  });

  try {
    const baseline = await loadSyncBaseline(userId);
    if (!options.skipConflictCheck) {
      const conflict = await firstSyncConflict(supabase, userId, normalizedData);
      if (conflict) {
        return {
          conflict,
          ok: false,
          error: "This content changed somewhere else. Resolve the conflict before syncing again.",
        };
      }
    }

    const folderRows = sortFoldersParentFirst(ownedFolders).map((folder) =>
      folderToRow(folder, userId),
    );

    for (const folderRow of folderRows) {
      await upsertFolderRowForCurrentUser(
        supabase,
        folderRow,
        options.skipConflictCheck ? undefined : baseline.folders[folderRow.id],
      );
    }

    const itemRows = writableItems.map((item) => savedItemToRow(item, userId, foldersById));
    for (const itemRow of itemRows) {
      await upsertItemRowForCurrentUser(
        supabase,
        itemRow,
        options.skipConflictCheck ? undefined : baseline.items[itemRow.id],
      );
    }

    const ownedTagGroups = normalizedData.tagGroups.filter((tagGroup) => (tagGroup.ownerId ?? userId) === userId);
    const ownedTagGroupIds = new Set(ownedTagGroups.map((tagGroup) => tagGroup.id));
    const writableTagOptions = normalizedData.tagOptions.filter((tagOption) => ownedTagGroupIds.has(tagOption.groupId));

    const tagGroupRows = ownedTagGroups.map((tagGroup) => tagGroupToRow(tagGroup, userId));
    for (const tagGroupRow of tagGroupRows) {
      await upsertTagGroupRowForCurrentUser(
        supabase,
        tagGroupRow,
        options.skipConflictCheck ? undefined : baseline.tagGroups[tagGroupRow.id],
      );
    }

    const tagOptionRows = writableTagOptions.map(tagOptionToRow);
    for (const tagOptionRow of tagOptionRows) {
      await upsertTagOptionRowForCurrentUser(
        supabase,
        tagOptionRow,
        options.skipConflictCheck ? undefined : baseline.tagOptions[tagOptionRow.id],
      );
    }

    const localItemIds = normalizedData.items
      .filter((item) => (item.ownerId ?? userId) === userId)
      .map((item) => item.id);
    await deleteOwnedRowsMissing(
      supabase,
      "trove_items",
      localItemIds,
      baseline.items,
      options.skipConflictCheck ?? false,
    );

    const localFolderIds = ownedFolders.map((folder) => folder.id);
    await deleteOwnedRowsMissing(
      supabase,
      "trove_folders",
      localFolderIds,
      baseline.folders,
      options.skipConflictCheck ?? false,
    );

    await deleteOwnedRowsMissing(
      supabase,
      "trove_tag_options",
      writableTagOptions.map((tagOption) => tagOption.id),
      baseline.tagOptions,
      options.skipConflictCheck ?? false,
    );

    await deleteOwnedRowsMissing(
      supabase,
      "trove_tag_groups",
      ownedTagGroups.map((tagGroup) => tagGroup.id),
      baseline.tagGroups,
      options.skipConflictCheck ?? false,
    );

    const updatedAt = await upsertSyncState(supabase, userId);
    await writeStoredRemoteUpdatedAt(userId, updatedAt);
    const remoteAfterPush = await fetchNormalizedTroveDataForUser(supabase, userId);
    await saveSyncBaseline(
      userId,
      remoteAfterPush.kind === "data"
        ? baselineFromTroveData(remoteAfterPush.data)
        : baselineFromTroveData(normalizedData),
    );

    return { ok: true, updatedAt };
  } catch (error) {
    if (!options.skipConflictCheck && isSyncConflictError(error)) {
      try {
        const conflict = await firstSyncConflict(supabase, userId, normalizedData);
        if (conflict) {
          return {
            conflict,
            ok: false,
            error: "This content changed somewhere else. Resolve the conflict before syncing again.",
          };
        }
      } catch (conflictError) {
        console.warn("Failed to inspect Trove sync conflict", conflictError);
      }

      return {
        ok: false,
        error: "This content changed somewhere else. Refresh before syncing again.",
      };
    }

    console.warn("Failed to push normalized Trove data", error);
    return { ok: false, error: friendlyErrorMessage(errorMessage(error, "Failed to sync Trove data.")) };
  }
};

const ensureRemoteFoldersOwnedByUser = async (
  supabase: SupabaseClient,
  userId: string,
  folderIds: string[],
): Promise<{ error?: string; ok: boolean }> => {
  if (folderIds.length === 0) {
    return { ok: true };
  }

  const { data, error } = await supabase
    .from("trove_folders")
    .select("id, owner_id")
    .in("id", folderIds);

  if (error) {
    throw error;
  }

  const remoteFolders = (data ?? []) as Array<Pick<FolderRow, "id" | "owner_id">>;
  const folderOwnedBySomeoneElse = remoteFolders.find((folder) => folder.owner_id !== userId);

  if (folderOwnedBySomeoneElse) {
    return { ok: false, error: "Only the folder owner can share this folder." };
  }

  return { ok: true };
};

const pushFolderBranchForUser = async (
  supabase: SupabaseClient,
  userId: string,
  troveData: TroveData,
  folderId: string,
): Promise<PushTroveResult> => {
  const branchResult = collectFolderBranchForSharing(troveData, userId, folderId);
  if (!branchResult.ok || !branchResult.folders) {
    return {
      ok: false,
      error: branchResult.error ?? "Unable to sync this folder before sharing.",
    };
  }

  try {
    const conflict = await firstSyncConflict(supabase, userId, troveData);
    if (conflict) {
      return {
        conflict,
        ok: false,
        error: "This content changed somewhere else. Resolve the conflict before sharing.",
      };
    }

    const baseline = await loadSyncBaseline(userId);
    const folderRows = branchResult.folders.map((folder) => folderToRow(folder, userId));
    const ownershipResult = await ensureRemoteFoldersOwnedByUser(
      supabase,
      userId,
      folderRows.map((folder) => folder.id),
    );

    if (!ownershipResult.ok) {
      return ownershipResult;
    }

    for (const folderRow of folderRows) {
      await upsertFolderRowForCurrentUser(supabase, folderRow, baseline.folders[folderRow.id]);
    }

    const updatedAt = await upsertSyncState(supabase, userId);
    await writeStoredRemoteUpdatedAt(userId, updatedAt);
    const remoteAfterPush = await fetchNormalizedTroveDataForUser(supabase, userId);
    if (remoteAfterPush.kind === "data") {
      await saveSyncBaseline(userId, baselineFromTroveData(remoteAfterPush.data));
    }

    return { ok: true, updatedAt };
  } catch (error) {
    if (isSyncConflictError(error)) {
      try {
        const conflict = await firstSyncConflict(supabase, userId, troveData);
        if (conflict) {
          return {
            conflict,
            ok: false,
            error: "This content changed somewhere else. Resolve the conflict before sharing.",
          };
        }
      } catch (conflictError) {
        console.warn("Failed to inspect Trove folder sync conflict", conflictError);
      }

      return {
        ok: false,
        error: "This folder changed somewhere else. Refresh before sharing again.",
      };
    }

    console.warn("Failed to push folder branch before sharing", error);
    return { ok: false, error: folderSyncErrorMessage(error) };
  }
};

const pullTroveDataForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<PullTroveResult> => {
  const normalizedResult = await fetchNormalizedTroveDataForUser(supabase, userId);
  if (normalizedResult.kind === "error") {
    return { kind: "error" };
  }

  const normalizedHasSource =
    normalizedResult.syncState !== null ||
    hasTroveData(normalizedResult.data) ||
    normalizedResult.latestRowUpdatedAt !== null;

  if (normalizedHasSource) {
    let remoteUpdatedAt = latestTimestamp([
      normalizedResult.syncState?.updated_at,
      normalizedResult.latestRowUpdatedAt,
    ]);

    if (!remoteUpdatedAt) {
      try {
        remoteUpdatedAt = await upsertSyncState(supabase, userId);
      } catch (error) {
        console.warn("Failed to initialize Trove sync state", error);
        return { kind: "error" };
      }
    }

    const storedUpdatedAt = await readStoredRemoteUpdatedAt(userId);
    if (storedUpdatedAt && remoteUpdatedAt <= storedUpdatedAt) {
      await saveSyncBaseline(userId, baselineFromTroveData(normalizedResult.data));
      return { kind: "noop_up_to_date", remoteUpdatedAt };
    }

    await writeStoredRemoteUpdatedAt(userId, remoteUpdatedAt);
    await saveSyncBaseline(userId, baselineFromTroveData(normalizedResult.data));
    return {
      kind: "applied",
      data: normalizeTroveData(normalizedResult.data),
      remoteUpdatedAt,
    };
  }

  const legacyResult = await fetchLegacyTroveDataForUser(supabase, userId);
  if (legacyResult.kind === "error") {
    return { kind: "error" };
  }

  if (legacyResult.kind === "invalid") {
    return { kind: "noop_invalid" };
  }

  if (legacyResult.kind === "no_row") {
    return { kind: "no_row" };
  }

  const migrationResult = await replaceNormalizedTroveDataForUser(
    supabase,
    userId,
    legacyResult.data,
  );

  if (!migrationResult.ok || !migrationResult.updatedAt) {
    return { kind: "error" };
  }

  return {
    kind: "applied",
    data: legacyResult.data,
    remoteUpdatedAt: migrationResult.updatedAt,
  };
};

const pushTroveDataForUser = async (
  supabase: SupabaseClient,
  userId: string,
  troveData: TroveData,
  options?: PushTroveOptions,
): Promise<PushTroveResult> =>
  replaceNormalizedTroveDataForUser(supabase, userId, troveData, options);

const ensureRemoteRowForUser = async (
  supabase: SupabaseClient,
  userId: string,
  troveData: TroveData,
): Promise<{ created: boolean }> => {
  const result = await replaceNormalizedTroveDataForUser(
    supabase,
    userId,
    troveData,
  );

  return { created: result.ok };
};

const subscribeTroveRealtimeForUser = (
  supabase: SupabaseClient,
  userId: string,
  onChange: () => void,
): TroveRealtimeSubscription => {
  let refreshHandle: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (refreshHandle) {
      clearTimeout(refreshHandle);
    }

    refreshHandle = setTimeout(onChange, 500);
  };

  const channel = supabase
    .channel(`trove-sync:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "trove_sync_state",
        filter: `user_id=eq.${userId}`,
      },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trove_folders" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trove_items" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trove_folder_shares" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trove_folder_share_invites" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trove_tag_groups" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trove_tag_options" },
      scheduleRefresh,
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Trove realtime subscription issue", status);
      }
    });

  return {
    unsubscribe: () => {
      if (refreshHandle) {
        clearTimeout(refreshHandle);
      }
      void supabase.removeChannel(channel);
    },
  };
};

export {
  clearStoredRemoteUpdatedAt,
  deleteTroveItemForUser,
  ensureRemoteRowForUser,
  pullTroveDataForUser,
  pushFolderBranchForUser,
  pushTroveDataForUser,
  readStoredRemoteUpdatedAt,
  subscribeTroveRealtimeForUser,
};
export type { PullTroveResult, PushTroveResult, TroveRealtimeSubscription };
