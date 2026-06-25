import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessRole, Folder, SavedItem, ShareScope, WaitingListData } from "../types/models";
import { canEditFolderContentRecord, canManageFolderRecord } from "../utils/access";
import {
  normalizeItemType,
  normalizeSavedItem,
  normalizeWaitingListData,
} from "../utils/itemTypes";

const remoteUpdatedAtKey = (userId: string) =>
  `the-waiting-list:remoteUpdatedAt:${userId}`;

type PullWaitingListResult =
  | { kind: "applied"; data: WaitingListData; remoteUpdatedAt: string }
  | { kind: "noop_up_to_date"; remoteUpdatedAt: string }
  | { kind: "noop_invalid" }
  | { kind: "error" }
  | { kind: "no_row" };

type WaitingListRealtimeSubscription = {
  unsubscribe: () => void;
};

type PushWaitingListResult = {
  error?: string;
  ok: boolean;
  updatedAt?: string;
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
  tags: unknown;
  status: SavedItem["status"];
  priority: SavedItem["priority"];
  notes: string | null;
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

const isWaitingListPayload = (payload: unknown): payload is WaitingListData => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<WaitingListData>;
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

const folderSyncErrorMessage = (error: unknown): string => {
  const message = errorMessage(error, "Unable to sync this folder before sharing.");
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("row-level security") &&
    lowerMessage.includes("waiting_list_folders")
  ) {
    return "This folder could not be synced as yours. Refresh your data, then try sharing it again.";
  }

  return message;
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

const hasWaitingListData = (data: WaitingListData): boolean =>
  data.folders.length > 0 || data.items.length > 0;

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
  waitingList: WaitingListData,
  userId: string,
  folderId: string,
): { error?: string; folders?: Folder[]; ok: boolean } => {
  const normalizedData = normalizeWaitingListData(waitingList);
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
    tags: stringArray(row.tags),
    status: row.status,
    priority: row.priority,
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
    tags: normalizedItem.tags ?? [],
    status: normalizedItem.status,
    priority: normalizedItem.priority,
    notes: optional(normalizedItem.notes),
    created_at: normalizedItem.createdAt,
    updated_at: normalizedItem.updatedAt,
  };
};

const upsertFolderRowForCurrentUser = async (
  supabase: SupabaseClient,
  folderRow: FolderRow,
): Promise<void> => {
  const { error } = await supabase.rpc("upsert_waiting_list_folder_for_current_user", {
    target_color: folderRow.color,
    target_created_at: folderRow.created_at,
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

const postgrestInList = (values: string[]): string =>
  `(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;

const deleteOwnedRowsMissing = async (
  supabase: SupabaseClient,
  table: "waiting_list_folders" | "waiting_list_items",
  userId: string,
  ids: string[],
): Promise<void> => {
  let query = supabase.from(table).delete().eq("owner_id", userId);

  if (ids.length > 0) {
    query = query.not("id", "in", postgrestInList(ids));
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
};

const fetchLegacyWaitingListForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { kind: "data"; data: WaitingListData; updatedAt: string }
  | { kind: "no_row" }
  | { kind: "invalid" }
  | { kind: "error" }
> => {
  const { data, error } = await supabase
    .from("waiting_list_data")
    .select("payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to pull legacy remote waiting list data", error);
    return { kind: "error" };
  }

  if (!data) {
    return { kind: "no_row" };
  }

  const row = data as LegacyRemoteRow;
  if (!isWaitingListPayload(row.payload)) {
    console.warn("Remote waiting list payload is invalid");
    return { kind: "invalid" };
  }

  return {
    kind: "data",
    data: normalizeWaitingListData(row.payload),
    updatedAt: row.updated_at,
  };
};

const fetchNormalizedWaitingListForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | {
      kind: "data";
      data: WaitingListData;
      latestRowUpdatedAt: string | null;
      syncState: SyncStateRow | null;
    }
  | { kind: "error" }
> => {
  const [syncStateResult, foldersResult, itemsResult, sharesResult] = await Promise.all([
    supabase
      .from("waiting_list_sync_state")
      .select("updated_at, normalized_initialized")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("waiting_list_folders")
      .select(
        "id, owner_id, parent_folder_id, name, icon, color, purpose, created_at, updated_at",
      ),
    supabase
      .from("waiting_list_items")
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
          "status",
          "priority",
          "notes",
          "created_at",
          "updated_at",
        ].join(", "),
      ),
    supabase
      .from("waiting_list_folder_shares")
      .select("folder_id, shared_with_user_id, role, scope, updated_at")
      .eq("shared_with_user_id", userId),
  ]);

  if (syncStateResult.error) {
    console.warn("Failed to pull waiting list sync state", syncStateResult.error);
    return { kind: "error" };
  }

  if (foldersResult.error) {
    console.warn("Failed to pull remote waiting list folders", foldersResult.error);
    return { kind: "error" };
  }

  if (itemsResult.error) {
    console.warn("Failed to pull remote waiting list items", itemsResult.error);
    return { kind: "error" };
  }

  if (sharesResult.error) {
    console.warn("Failed to pull remote waiting list shares", sharesResult.error);
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

  const latestRowUpdatedAt = latestTimestamp([
    ...folders.map((folder) => folder.updatedAt),
    ...items.map((item) => item.updatedAt),
    ...shares.map((share) => share.updated_at),
  ]);

  return {
    kind: "data",
    data: { folders, items },
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
    .from("waiting_list_sync_state")
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

const replaceNormalizedWaitingListForUser = async (
  supabase: SupabaseClient,
  userId: string,
  waitingList: WaitingListData,
): Promise<PushWaitingListResult> => {
  const normalizedData = normalizeWaitingListData(waitingList);
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
    const folderRows = sortFoldersParentFirst(ownedFolders).map((folder) =>
      folderToRow(folder, userId),
    );

    for (const folderRow of folderRows) {
      await upsertFolderRowForCurrentUser(supabase, folderRow);
    }

    const itemRows = writableItems.map((item) => savedItemToRow(item, userId, foldersById));
    if (itemRows.length > 0) {
      const { error } = await supabase
        .from("waiting_list_items")
        .upsert(itemRows, { onConflict: "id" });

      if (error) {
        throw error;
      }
    }

    const localItemIds = normalizedData.items
      .filter((item) => (item.ownerId ?? userId) === userId)
      .map((item) => item.id);
    await deleteOwnedRowsMissing(
      supabase,
      "waiting_list_items",
      userId,
      localItemIds,
    );

    const localFolderIds = ownedFolders.map((folder) => folder.id);
    await deleteOwnedRowsMissing(
      supabase,
      "waiting_list_folders",
      userId,
      localFolderIds,
    );

    const updatedAt = await upsertSyncState(supabase, userId);
    await writeStoredRemoteUpdatedAt(userId, updatedAt);

    return { ok: true, updatedAt };
  } catch (error) {
    console.warn("Failed to push normalized waiting list data", error);
    return { ok: false, error: errorMessage(error, "Failed to sync waiting list data.") };
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
    .from("waiting_list_folders")
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
  waitingList: WaitingListData,
  folderId: string,
): Promise<PushWaitingListResult> => {
  const branchResult = collectFolderBranchForSharing(waitingList, userId, folderId);
  if (!branchResult.ok || !branchResult.folders) {
    return {
      ok: false,
      error: branchResult.error ?? "Unable to sync this folder before sharing.",
    };
  }

  try {
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
      await upsertFolderRowForCurrentUser(supabase, folderRow);
    }

    const updatedAt = await upsertSyncState(supabase, userId);
    await writeStoredRemoteUpdatedAt(userId, updatedAt);

    return { ok: true, updatedAt };
  } catch (error) {
    console.warn("Failed to push folder branch before sharing", error);
    return { ok: false, error: folderSyncErrorMessage(error) };
  }
};

const pullWaitingListForUser = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<PullWaitingListResult> => {
  const normalizedResult = await fetchNormalizedWaitingListForUser(supabase, userId);
  if (normalizedResult.kind === "error") {
    return { kind: "error" };
  }

  const normalizedHasSource =
    normalizedResult.syncState !== null ||
    hasWaitingListData(normalizedResult.data) ||
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
        console.warn("Failed to initialize waiting list sync state", error);
        return { kind: "error" };
      }
    }

    const storedUpdatedAt = await readStoredRemoteUpdatedAt(userId);
    if (storedUpdatedAt && remoteUpdatedAt <= storedUpdatedAt) {
      return { kind: "noop_up_to_date", remoteUpdatedAt };
    }

    await writeStoredRemoteUpdatedAt(userId, remoteUpdatedAt);
    return {
      kind: "applied",
      data: normalizeWaitingListData(normalizedResult.data),
      remoteUpdatedAt,
    };
  }

  const legacyResult = await fetchLegacyWaitingListForUser(supabase, userId);
  if (legacyResult.kind === "error") {
    return { kind: "error" };
  }

  if (legacyResult.kind === "invalid") {
    return { kind: "noop_invalid" };
  }

  if (legacyResult.kind === "no_row") {
    return { kind: "no_row" };
  }

  const migrationResult = await replaceNormalizedWaitingListForUser(
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

const pushWaitingListForUser = async (
  supabase: SupabaseClient,
  userId: string,
  waitingList: WaitingListData,
): Promise<PushWaitingListResult> =>
  replaceNormalizedWaitingListForUser(supabase, userId, waitingList);

const ensureRemoteRowForUser = async (
  supabase: SupabaseClient,
  userId: string,
  waitingList: WaitingListData,
): Promise<{ created: boolean }> => {
  const result = await replaceNormalizedWaitingListForUser(
    supabase,
    userId,
    waitingList,
  );

  return { created: result.ok };
};

const subscribeWaitingListRealtimeForUser = (
  supabase: SupabaseClient,
  userId: string,
  onChange: () => void,
): WaitingListRealtimeSubscription => {
  let refreshHandle: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (refreshHandle) {
      clearTimeout(refreshHandle);
    }

    refreshHandle = setTimeout(onChange, 500);
  };

  const channel = supabase
    .channel(`waiting-list-sync:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "waiting_list_sync_state",
        filter: `user_id=eq.${userId}`,
      },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "waiting_list_folders" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "waiting_list_items" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "waiting_list_folder_shares" },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "waiting_list_folder_share_invites" },
      scheduleRefresh,
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Waiting list realtime subscription issue", status);
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
  ensureRemoteRowForUser,
  pullWaitingListForUser,
  pushFolderBranchForUser,
  pushWaitingListForUser,
  readStoredRemoteUpdatedAt,
  subscribeWaitingListRealtimeForUser,
};
export type { PullWaitingListResult, WaitingListRealtimeSubscription };
