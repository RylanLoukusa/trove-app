import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppStateStatus } from "react-native";
import { Alert, AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useEntitlement } from "../entitlements/EntitlementContext";
import { getSupabase } from "../lib/supabase";
import { syncShareExtensionFolders } from "../share/sharedImport";
import { deleteStoredMediaForItems } from "../lib/supabaseStorage";
import {
  loadSyncBaseline,
  saveSyncBaseline,
} from "../sync/syncBaseline";
import type { SyncBaseline, SyncEntityKind } from "../sync/syncBaseline";
import { mergeConflictFields } from "../sync/syncConflictResolution";
import type { SyncConflictResolution } from "../sync/syncConflictResolution";
import {
  clearStoredRemoteUpdatedAt,
  deleteTroveItemForUser,
  ensureRemoteRowForUser,
  pullTroveDataForUser,
  pushFolderBranchForUser,
  pushTroveDataForUser,
  subscribeTroveRealtimeForUser,
} from "../sync/troveSync";
import type { PushTroveResult } from "../sync/troveSync";
import {
  conflictedSyncSnapshot,
  failedSyncSnapshot,
  loadSyncSnapshot,
  queuedSyncSnapshot,
  saveSyncSnapshot,
  savingSyncSnapshot,
  SyncSnapshot,
  syncedSyncSnapshot,
} from "../sync/syncStatus";
import { seedData, seedFolders, seedItems } from "../data/seedData";
import { isBaseDataSeeded, markBaseDataSeeded } from "./baseDataSeed";
import {
  isTagBackfillDone,
  markTagBackfillDone,
  readLegacyFieldsFromLocalItem,
  fetchLegacyItemFieldsForUser,
  resolveLegacyItemTagOptionIds,
  seedDefaultTagGroups,
} from "./tagBackfill";
import { Folder, SavedItem, TagGroup, TagOption, TroveData } from "../types/models";
import { canEditFolderContentRecord, canEditItemRecord, canManageFolderRecord } from "../utils/access";
import { friendlyErrorMessage } from "../utils/errorMessages";
import { createId } from "../utils/id";
import { requiresProForSync } from "../utils/limits";
import { canMoveFolder, deleteFolderRecursively, getFolderTreeIds } from "../utils/folderTree";
import { normalizeTroveData } from "../utils/itemTypes";

const STORAGE_KEY_PREFIX = "trove:data:v1";
const emptyData: TroveData = { folders: [], items: [], tagGroups: [], tagOptions: [] };
const FOREGROUND_REFRESH_INTERVAL_MS = 30_000;

const hasTroveData = (data: TroveData): boolean =>
  data.folders.length > 0 || data.items.length > 0 || data.tagGroups.length > 0 || data.tagOptions.length > 0;

const hasPendingSync = (snapshot: SyncSnapshot): boolean =>
  snapshot.status === "queued" ||
  snapshot.status === "saving" ||
  snapshot.status === "retrying" ||
  snapshot.status === "failed" ||
  snapshot.status === "conflicted";

type RefreshFromRemoteOptions = {
  force?: boolean;
};

type TroveContextValue = TroveData & {
  isReady: boolean;
  syncSnapshot: SyncSnapshot;
  createFolder: (input: Pick<Folder, "name" | "parentFolderId"> & Partial<Pick<Folder, "icon" | "color" | "purpose">>) => Folder | null;
  updateFolder: (folderId: string, updates: Partial<Pick<Folder, "name" | "parentFolderId" | "icon" | "color" | "purpose">>) => boolean;
  deleteFolder: (folderId: string) => Promise<{ ok: boolean; error?: string }>;
  createItem: (input: Omit<SavedItem, "id" | "createdAt" | "updatedAt">) => SavedItem | null;
  updateItem: (itemId: string, updates: Partial<Omit<SavedItem, "id" | "createdAt">>) => void;
  deleteItem: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
  createTagGroup: (
    input: Pick<TagGroup, "name"> & Partial<Pick<TagGroup, "selectionMode" | "allowInlineCreate" | "isSystem" | "sortOrder">>,
  ) => TagGroup;
  updateTagGroup: (groupId: string, updates: Partial<Pick<TagGroup, "name" | "selectionMode" | "allowInlineCreate" | "sortOrder">>) => void;
  deleteTagGroup: (groupId: string) => void;
  createTagOption: (input: Pick<TagOption, "groupId" | "name"> & Partial<Pick<TagOption, "color" | "sortOrder">>) => TagOption;
  updateTagOption: (optionId: string, updates: Partial<Pick<TagOption, "name" | "color" | "sortOrder">>) => void;
  deleteTagOption: (optionId: string) => void;
  canManageFolder: (folderId?: string | null) => boolean;
  canEditFolderContent: (folderId?: string | null) => boolean;
  canEditItem: (itemId: string) => boolean;
  refreshFromRemote: (options?: RefreshFromRemoteOptions) => Promise<{ ok: boolean; error?: string }>;
  resolveSyncConflict: (resolution: SyncConflictResolution) => Promise<{ ok: boolean; error?: string }>;
  syncFolderForSharing: (folderId: string) => Promise<{ ok: boolean; error?: string }>;
  syncToRemote: () => Promise<{ ok: boolean; error?: string }>;
  resetToSeed: () => void;
  clearLocalData: () => void;
};

const TroveContext = createContext<TroveContextValue | undefined>(undefined);

const cleanOptionalText = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const storageKeyForUser = (userId?: string | null): string =>
  userId ? `${STORAGE_KEY_PREFIX}:user:${userId}` : `${STORAGE_KEY_PREFIX}:anonymous`;

export const loadTroveData = async (userId?: string | null): Promise<TroveData> => {
  const key = storageKeyForUser(userId);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) {
    const initialData = userId ? emptyData : seedData;
    await AsyncStorage.setItem(key, JSON.stringify(initialData));
    return normalizeTroveData(initialData);
  }
  return normalizeTroveData(JSON.parse(stored) as TroveData);
};

export const saveTroveData = async (data: TroveData, userId?: string | null): Promise<void> => {
  await AsyncStorage.setItem(storageKeyForUser(userId), JSON.stringify(data));
};

const InnerTroveProvider = ({ children }: { children: ReactNode }) => {
  const { session, isAuthReady } = useAuth();
  const { isPro } = useEntitlement();
  const [data, setData] = useState<TroveData>(seedData);
  const [isReady, setIsReady] = useState(false);
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>({
    retryCount: 0,
    status: "synced",
  });
  const activeUserId = isAuthReady ? session?.user?.id ?? null : null;
  const dataRef = useRef(data);
  dataRef.current = data;
  const syncSnapshotRef = useRef(syncSnapshot);
  syncSnapshotRef.current = syncSnapshot;
  const skipRemotePushRef = useRef(true);
  const skipNextRemotePushRef = useRef(false);
  const remoteRowExistsRef = useRef(false);
  const pendingRemotePushRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastForegroundRefreshAtRef = useRef(0);

  const setAndPersistSyncSnapshot = useCallback(
    (nextSnapshot: SyncSnapshot) => {
      setSyncSnapshot(nextSnapshot);
      if (activeUserId) {
        void saveSyncSnapshot(activeUserId, nextSnapshot);
      }
    },
    [activeUserId],
  );

  const markLocalChangePending = useCallback(() => {
    if (!activeUserId || requiresProForSync(isPro)) return;
    setSyncSnapshot((current) => {
      const nextSnapshot = queuedSyncSnapshot(current);
      void saveSyncSnapshot(activeUserId, nextSnapshot);
      return nextSnapshot;
    });
  }, [activeUserId, isPro]);

  const applyPushResult = useCallback(
    (result: PushTroveResult, fallbackError: string): { ok: boolean; error?: string } => {
      if (result.ok) {
        remoteRowExistsRef.current = true;
        setAndPersistSyncSnapshot(syncedSyncSnapshot());
        return { ok: true };
      }

      if (result.conflict) {
        setAndPersistSyncSnapshot(
          conflictedSyncSnapshot(syncSnapshotRef.current, result.conflict),
        );
        return { ok: false, error: result.error ?? "Resolve the sync conflict before syncing again." };
      }

      setAndPersistSyncSnapshot(
        failedSyncSnapshot(
          syncSnapshotRef.current,
          result.error ?? fallbackError,
        ),
      );
      return { ok: false, error: result.error ?? fallbackError };
    },
    [setAndPersistSyncSnapshot],
  );

  useEffect(() => {
    if (!isAuthReady) return;

    let cancelled = false;
    skipRemotePushRef.current = true;
    skipNextRemotePushRef.current = false;
    remoteRowExistsRef.current = false;
    pendingRemotePushRef.current = false;
    setSyncSnapshot({ retryCount: 0, status: "synced" });
    setIsReady(false);
    setData(activeUserId ? emptyData : seedData);

    void (async () => {
      try {
        const [loadedData, loadedSnapshot] = await Promise.all([
          loadTroveData(activeUserId),
          activeUserId
            ? loadSyncSnapshot(activeUserId)
            : Promise.resolve<SyncSnapshot>({ retryCount: 0, status: "synced" }),
        ]);

        if (cancelled) return;

        setData(loadedData);
        setSyncSnapshot(
          loadedSnapshot.status === "saving"
            ? { ...loadedSnapshot, status: "queued" }
            : loadedSnapshot,
        );
      } catch {
        if (!cancelled) {
          setData(activeUserId ? emptyData : seedData);
          setSyncSnapshot({ retryCount: 0, status: "synced" });
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserId, isAuthReady]);

  useEffect(() => {
    if (isReady) {
      void saveTroveData(data, activeUserId);
    }
  }, [activeUserId, data, isReady]);

  useEffect(() => {
    if (!isReady) return;
    const editableFolders = data.folders.filter(canEditFolderContentRecord);
    void syncShareExtensionFolders(editableFolders, editableFolders[0]?.id ?? null);
  }, [data.folders, isReady]);

  useEffect(() => {
    if (!isReady || !isAuthReady) return;
    const userId = activeUserId;
    if (!userId) {
      skipRemotePushRef.current = false;
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      skipRemotePushRef.current = false;
      return;
    }

    if (hasPendingSync(syncSnapshotRef.current)) {
      skipRemotePushRef.current = false;
      return;
    }

    skipRemotePushRef.current = true;
    let cancelled = false;
    let shouldAllowRemotePush = false;

    void (async () => {
      try {
        const result = await pullTroveDataForUser(supabase, userId);
        if (cancelled) return;
        if (result.kind === "applied") {
          remoteRowExistsRef.current = true;
          shouldAllowRemotePush = true;
          skipNextRemotePushRef.current = true;
          setData(result.data);
        } else if (result.kind === "noop_up_to_date") {
          remoteRowExistsRef.current = true;
          shouldAllowRemotePush = true;
          const local = await loadTroveData(userId);
          if (!cancelled) {
            skipNextRemotePushRef.current = true;
            setData(local);
          }
        } else if (result.kind === "no_row") {
          shouldAllowRemotePush = true;
          if (!hasTroveData(dataRef.current) && !(await isBaseDataSeeded(userId))) {
            const timestamp = new Date().toISOString();
            const folderIdBySeedId = new Map(seedFolders.map((seedFolder) => [seedFolder.id, createId("folder")]));
            const newFolders: Folder[] = seedFolders.map((seedFolder) => ({
              ...seedFolder,
              id: folderIdBySeedId.get(seedFolder.id)!,
              parentFolderId: seedFolder.parentFolderId
                ? folderIdBySeedId.get(seedFolder.parentFolderId) ?? null
                : null,
              ownerId: userId,
              accessRole: "owner",
              createdAt: timestamp,
              updatedAt: timestamp,
            }));
            const newItems: SavedItem[] = seedItems.map((seedItem) => ({
              ...seedItem,
              id: createId("item"),
              folderId: folderIdBySeedId.get(seedItem.folderId) ?? seedItem.folderId,
              ownerId: userId,
              createdBy: userId,
              accessRole: "owner",
              createdAt: timestamp,
              updatedAt: timestamp,
            }));
            setData((current) => ({
              ...current,
              folders: [...current.folders, ...newFolders],
              items: [...newItems, ...current.items],
            }));
            markLocalChangePending();
            await markBaseDataSeeded(userId);
          } else if (isPro && hasTroveData(dataRef.current)) {
            const ensured = await ensureRemoteRowForUser(supabase, userId, dataRef.current);
            remoteRowExistsRef.current = ensured.created;
          }
        }
      } finally {
        if (!cancelled) {
          skipRemotePushRef.current = !shouldAllowRemotePush;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserId, isReady, isAuthReady]);

  useEffect(() => {
    if (!isReady || !isAuthReady) return;
    const userId = activeUserId;
    if (!userId) return;
    // Free users can still receive folders shared with them (the pull effect above),
    // but their own local data never gets pushed to the cloud without Pro.
    if (requiresProForSync(isPro)) return;
    const supabase = getSupabase();
    if (!supabase) return;
    if (skipRemotePushRef.current) return;
    if (skipNextRemotePushRef.current) {
      skipNextRemotePushRef.current = false;
      return;
    }
    if (!remoteRowExistsRef.current && !hasTroveData(data)) return;

    pendingRemotePushRef.current = true;
    let didStartPush = false;
    const handle = setTimeout(() => {
      didStartPush = true;
      setSyncSnapshot((current) => {
        const nextSnapshot = savingSyncSnapshot(current);
        void saveSyncSnapshot(userId, nextSnapshot);
        return nextSnapshot;
      });
      void pushTroveDataForUser(supabase, userId, data)
        .then((result) => {
          applyPushResult(result, "Unable to sync Trove data.");
        })
        .catch((error) => {
          setSyncSnapshot((current) => {
            const nextSnapshot = failedSyncSnapshot(
              current,
              friendlyErrorMessage(error instanceof Error ? error.message : undefined, "Unable to sync Trove data."),
            );
            void saveSyncSnapshot(userId, nextSnapshot);
            return nextSnapshot;
          });
        })
        .finally(() => {
          pendingRemotePushRef.current = false;
        });
    }, 1500);

    return () => {
      clearTimeout(handle);
      if (!didStartPush) {
        pendingRemotePushRef.current = false;
      }
    };
  }, [activeUserId, applyPushResult, data, isPro, isReady, isAuthReady]);

  const createFolder = useCallback<TroveContextValue["createFolder"]>((input) => {
    const parentFolder = dataRef.current.folders.find((folder) => folder.id === input.parentFolderId);
    if (input.parentFolderId && !canManageFolderRecord(parentFolder)) {
      Alert.alert("Cannot create folder", "Only the folder owner can create subfolders here.");
      return null;
    }

    const timestamp = new Date().toISOString();
    const folder: Folder = {
      id: createId("folder"),
      name: input.name.trim() || "Untitled folder",
      parentFolderId: input.parentFolderId,
      icon: input.icon || "📁",
      color: input.color || "#D8C7AA",
      purpose: cleanOptionalText(input.purpose),
      ownerId: activeUserId ?? undefined,
      accessRole: activeUserId ? "owner" : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setData((current) => ({ ...current, folders: [...current.folders, folder] }));
    markLocalChangePending();
    return folder;
  }, [activeUserId, markLocalChangePending]);

  const updateFolder = useCallback<TroveContextValue["updateFolder"]>((folderId, updates) => {
    let didUpdate = false;
    setData((current) => {
      const folder = current.folders.find((candidate) => candidate.id === folderId);
      if (!canManageFolderRecord(folder)) {
        Alert.alert("Cannot edit folder", "Only the folder owner can edit this folder.");
        return current;
      }
      const nextParent = current.folders.find((candidate) => candidate.id === updates.parentFolderId);
      if (updates.parentFolderId && !canManageFolderRecord(nextParent)) {
        Alert.alert("Cannot move folder", "Only the folder owner can move folders into that destination.");
        return current;
      }
      if (updates.parentFolderId !== undefined && !canMoveFolder(current.folders, folderId, updates.parentFolderId)) {
        Alert.alert("Cannot move folder", "That destination would create a loop or exceed the 5-level nesting limit.");
        return current;
      }
      didUpdate = true;
      return {
        ...current,
        folders: current.folders.map((folder) => {
          if (folder.id !== folderId) return folder;
          return {
            ...folder,
            ...updates,
            name: updates.name?.trim() || folder.name,
            purpose: updates.purpose !== undefined ? cleanOptionalText(updates.purpose) : folder.purpose,
            updatedAt: new Date().toISOString(),
          };
        }),
      };
    });
    if (didUpdate) {
      markLocalChangePending();
    }
    return didUpdate;
  }, [markLocalChangePending]);

  const deleteFolder = useCallback<TroveContextValue["deleteFolder"]>(async (folderId) => {
    const folder = dataRef.current.folders.find((candidate) => candidate.id === folderId);
    if (!canManageFolderRecord(folder)) {
      return { ok: false, error: "Only the folder owner can delete this folder." };
    }

    const folderIdsToDelete = getFolderTreeIds(dataRef.current.folders, folderId);
    const itemsToDelete = dataRef.current.items.filter((item) => folderIdsToDelete.includes(item.folderId));
    const mediaResult = await deleteStoredMediaForItems(itemsToDelete);
    if (!mediaResult.ok) return mediaResult;

    setData((current) => ({ ...current, ...deleteFolderRecursively(current.folders, current.items, folderId) }));
    markLocalChangePending();
    return { ok: true };
  }, [markLocalChangePending]);

  const createItem = useCallback<TroveContextValue["createItem"]>((input) => {
    const folder = dataRef.current.folders.find((candidate) => candidate.id === input.folderId);
    if (input.folderId && !canEditFolderContentRecord(folder)) {
      Alert.alert("Cannot save item", "You do not have permission to add items to that folder.");
      return null;
    }

    const timestamp = new Date().toISOString();
    const item: SavedItem = {
      ...input,
      id: createId("item"),
      title: input.title.trim() || "Untitled idea",
      tagOptionIds: input.tagOptionIds,
      ownerId: folder?.ownerId ?? activeUserId ?? undefined,
      createdBy: input.createdBy ?? activeUserId ?? undefined,
      accessRole: folder?.accessRole ?? (activeUserId ? "owner" : undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setData((current) => ({ ...current, items: [item, ...current.items] }));
    markLocalChangePending();
    return item;
  }, [activeUserId, markLocalChangePending]);

  const updateItem = useCallback<TroveContextValue["updateItem"]>((itemId, updates) => {
    let didUpdate = false;
    setData((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== itemId) return item;
        const currentFolder = current.folders.find((folder) => folder.id === item.folderId);
        const nextFolderId = updates.folderId ?? item.folderId;
        const nextFolder = current.folders.find((folder) => folder.id === nextFolderId);

        if (!canEditItemRecord(item, currentFolder)) {
          Alert.alert("Cannot edit item", "You do not have permission to edit this item.");
          return item;
        }

        if (nextFolderId && !canEditFolderContentRecord(nextFolder)) {
          Alert.alert("Cannot move item", "You do not have permission to save items in that folder.");
          return item;
        }

        didUpdate = true;
        return {
          ...item,
          ...updates,
          title: updates.title?.trim() || item.title,
          tagOptionIds: updates.tagOptionIds ?? item.tagOptionIds,
          ownerId: nextFolder?.ownerId ?? item.ownerId ?? activeUserId ?? undefined,
          accessRole: nextFolder?.accessRole ?? item.accessRole ?? (activeUserId ? "owner" : undefined),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    if (didUpdate) {
      markLocalChangePending();
    }
  }, [activeUserId, markLocalChangePending]);

  const createTagGroup = useCallback<TroveContextValue["createTagGroup"]>((input) => {
    const timestamp = new Date().toISOString();
    const tagGroup: TagGroup = {
      id: createId("tag-group"),
      ownerId: activeUserId ?? undefined,
      name: input.name.trim(),
      selectionMode: input.selectionMode ?? "multi",
      allowInlineCreate: input.allowInlineCreate ?? true,
      isSystem: input.isSystem ?? false,
      sortOrder: input.sortOrder ?? 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setData((current) => ({ ...current, tagGroups: [...current.tagGroups, tagGroup] }));
    markLocalChangePending();
    return tagGroup;
  }, [activeUserId, markLocalChangePending]);

  const updateTagGroup = useCallback<TroveContextValue["updateTagGroup"]>((groupId, updates) => {
    setData((current) => ({
      ...current,
      tagGroups: current.tagGroups.map((tagGroup) =>
        tagGroup.id === groupId
          ? {
              ...tagGroup,
              ...updates,
              name: updates.name?.trim() || tagGroup.name,
              updatedAt: new Date().toISOString(),
            }
          : tagGroup,
      ),
    }));
    markLocalChangePending();
  }, [markLocalChangePending]);

  const deleteTagGroup = useCallback<TroveContextValue["deleteTagGroup"]>((groupId) => {
    setData((current) => {
      const optionIdsInGroup = new Set(
        current.tagOptions.filter((tagOption) => tagOption.groupId === groupId).map((tagOption) => tagOption.id),
      );
      return {
        ...current,
        tagGroups: current.tagGroups.filter((tagGroup) => tagGroup.id !== groupId),
        tagOptions: current.tagOptions.filter((tagOption) => tagOption.groupId !== groupId),
        items: current.items.map((item) =>
          item.tagOptionIds.some((id) => optionIdsInGroup.has(id))
            ? { ...item, tagOptionIds: item.tagOptionIds.filter((id) => !optionIdsInGroup.has(id)) }
            : item,
        ),
      };
    });
    markLocalChangePending();
  }, [markLocalChangePending]);

  const createTagOption = useCallback<TroveContextValue["createTagOption"]>((input) => {
    const timestamp = new Date().toISOString();
    const tagOption: TagOption = {
      id: createId("tag-option"),
      groupId: input.groupId,
      name: input.name.trim(),
      color: input.color,
      sortOrder: input.sortOrder ?? 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setData((current) => ({ ...current, tagOptions: [...current.tagOptions, tagOption] }));
    markLocalChangePending();
    return tagOption;
  }, [markLocalChangePending]);

  const updateTagOption = useCallback<TroveContextValue["updateTagOption"]>((optionId, updates) => {
    setData((current) => ({
      ...current,
      tagOptions: current.tagOptions.map((tagOption) =>
        tagOption.id === optionId
          ? {
              ...tagOption,
              ...updates,
              name: updates.name?.trim() || tagOption.name,
              updatedAt: new Date().toISOString(),
            }
          : tagOption,
      ),
    }));
    markLocalChangePending();
  }, [markLocalChangePending]);

  const deleteTagOption = useCallback<TroveContextValue["deleteTagOption"]>((optionId) => {
    setData((current) => ({
      ...current,
      tagOptions: current.tagOptions.filter((tagOption) => tagOption.id !== optionId),
      items: current.items.some((item) => item.tagOptionIds.includes(optionId))
        ? current.items.map((item) =>
            item.tagOptionIds.includes(optionId)
              ? { ...item, tagOptionIds: item.tagOptionIds.filter((id) => id !== optionId) }
              : item,
          )
        : current.items,
    }));
    markLocalChangePending();
  }, [markLocalChangePending]);

  const canManageFolder = useCallback<TroveContextValue["canManageFolder"]>((folderId) => {
    if (!folderId) return true;
    return canManageFolderRecord(dataRef.current.folders.find((folder) => folder.id === folderId));
  }, []);

  const canEditFolderContent = useCallback<TroveContextValue["canEditFolderContent"]>((folderId) => {
    if (!folderId) return true;
    return canEditFolderContentRecord(dataRef.current.folders.find((folder) => folder.id === folderId));
  }, []);

  const canEditItem = useCallback<TroveContextValue["canEditItem"]>((itemId) => {
    const item = dataRef.current.items.find((candidate) => candidate.id === itemId);
    const folder = dataRef.current.folders.find((candidate) => candidate.id === item?.folderId);
    return canEditItemRecord(item, folder);
  }, []);

  const deleteItem = useCallback<TroveContextValue["deleteItem"]>(async (itemId) => {
    const itemToDelete = dataRef.current.items.find((item) => item.id === itemId);
    const folder = dataRef.current.folders.find((candidate) => candidate.id === itemToDelete?.folderId);
    if (!canEditItemRecord(itemToDelete, folder)) {
      return { ok: false, error: "You do not have permission to delete this item." };
    }

    const isSharedItem = !!activeUserId && !!itemToDelete?.ownerId && itemToDelete.ownerId !== activeUserId;
    if (isSharedItem) {
      const supabase = getSupabase();
      if (!supabase) {
        return { ok: false, error: "Supabase not configured" };
      }

      const deleteResult = await deleteTroveItemForUser(
        supabase,
        itemId,
        itemToDelete?.updatedAt,
      );
      if (!deleteResult.ok) {
        return { ok: false, error: deleteResult.error };
      }

      void deleteStoredMediaForItems(itemToDelete ? [itemToDelete] : []);
      setData((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
      markLocalChangePending();
      return { ok: true };
    }

    if (itemToDelete) {
      const mediaResult = await deleteStoredMediaForItems([itemToDelete]);
      if (!mediaResult.ok) return mediaResult;
    }

    setData((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
    markLocalChangePending();
    return { ok: true };
  }, [activeUserId, markLocalChangePending]);

  const refreshFromRemote = useCallback<TroveContextValue["refreshFromRemote"]>(async (options) => {
    const userId = activeUserId;
    if (!userId) {
      return { ok: false, error: "Sign in to sync shared folders." };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase not configured." };
    }

    try {
      if (options?.force) {
        await clearStoredRemoteUpdatedAt(userId);
      }

      const result = await pullTroveDataForUser(supabase, userId);

      if (result.kind === "applied") {
        skipNextRemotePushRef.current = true;
        skipRemotePushRef.current = false;
        setData(result.data);
        remoteRowExistsRef.current = true;
        setAndPersistSyncSnapshot(syncedSyncSnapshot());
        return { ok: true };
      }

      if (result.kind === "no_row" && options?.force) {
        remoteRowExistsRef.current = false;
        skipNextRemotePushRef.current = true;
        skipRemotePushRef.current = false;
        setData((current) => {
          const survivingTagGroups = current.tagGroups.filter((tagGroup) => !tagGroup.ownerId || tagGroup.ownerId === userId);
          const survivingTagGroupIds = new Set(survivingTagGroups.map((tagGroup) => tagGroup.id));
          return {
            folders: current.folders.filter((folder) => !folder.ownerId || folder.ownerId === userId),
            items: current.items.filter((item) => !item.ownerId || item.ownerId === userId),
            tagGroups: survivingTagGroups,
            tagOptions: current.tagOptions.filter((tagOption) => survivingTagGroupIds.has(tagOption.groupId)),
          };
        });
        setAndPersistSyncSnapshot(syncedSyncSnapshot());
        return { ok: true };
      }

      if (result.kind === "noop_up_to_date" || result.kind === "no_row" || result.kind === "noop_invalid") {
        skipRemotePushRef.current = false;
        return { ok: true };
      }

      return { ok: false, error: "Unable to refresh shared folders." };
    } catch (error) {
      return {
        ok: false,
        error: friendlyErrorMessage(error instanceof Error ? error.message : undefined, "Unable to refresh shared folders."),
      };
    }
  }, [activeUserId, setAndPersistSyncSnapshot]);

  const syncToRemote = useCallback<TroveContextValue["syncToRemote"]>(async () => {
    const userId = activeUserId;
    if (!userId) {
      return { ok: false, error: "Sign in to sync folders before sharing." };
    }

    if (requiresProForSync(isPro)) {
      return { ok: false, error: "Cloud sync requires Trove Pro." };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase not configured." };
    }

    pendingRemotePushRef.current = true;
    setAndPersistSyncSnapshot(savingSyncSnapshot(syncSnapshotRef.current));
    const result = await pushTroveDataForUser(supabase, userId, dataRef.current);
    pendingRemotePushRef.current = false;

    return applyPushResult(result, "Unable to sync this folder before sharing.");
  }, [activeUserId, applyPushResult, isPro, setAndPersistSyncSnapshot]);

  const syncFolderForSharing = useCallback<TroveContextValue["syncFolderForSharing"]>(async (folderId) => {
    const userId = activeUserId;
    if (!userId) {
      return { ok: false, error: "Sign in to sync folders before sharing." };
    }

    // Viewer access (email invites, public links) is free -- only editor
    // collaboration is Pro-gated, via requiresProForSharing at the call sites
    // in ShareFolderScreen. Don't require Pro here or that gate is moot.
    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase not configured." };
    }

    pendingRemotePushRef.current = true;
    setAndPersistSyncSnapshot(savingSyncSnapshot(syncSnapshotRef.current));
    const result = await pushFolderBranchForUser(supabase, userId, dataRef.current, folderId);
    pendingRemotePushRef.current = false;

    return applyPushResult(result, "Unable to sync this folder before sharing.");
  }, [activeUserId, applyPushResult, isPro, setAndPersistSyncSnapshot]);

  const resolveSyncConflict = useCallback<TroveContextValue["resolveSyncConflict"]>(async (resolution) => {
    const userId = activeUserId;
    if (!userId) {
      return { ok: false, error: "Sign in to resolve sync conflicts." };
    }

    if (syncSnapshotRef.current.status !== "conflicted") {
      return { ok: true };
    }

    if (resolution === "useRemote") {
      return refreshFromRemote({ force: true });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase not configured." };
    }

    pendingRemotePushRef.current = true;
    setAndPersistSyncSnapshot(savingSyncSnapshot(syncSnapshotRef.current));
    const conflict = syncSnapshotRef.current.conflict;
    let resolvedData = dataRef.current;

    if (typeof resolution === "object" && conflict?.fields) {
      resolvedData = mergeConflictFields(
        dataRef.current,
        conflict,
        resolution.fieldChoices,
        new Date().toISOString(),
      );

      dataRef.current = resolvedData;
      setData(resolvedData);
      await saveTroveData(resolvedData, userId);
      const baseline = await loadSyncBaseline(userId);
      const entityKind = conflict.entityKind as SyncEntityKind;
      const nextBaseline: SyncBaseline = {
        folders: { ...baseline.folders },
        items: { ...baseline.items },
        tagGroups: { ...baseline.tagGroups },
        tagOptions: { ...baseline.tagOptions },
      };
      nextBaseline[entityKind][conflict.entityId] = conflict.remoteUpdatedAt;
      await saveSyncBaseline(userId, nextBaseline);
    }

    const result = await pushTroveDataForUser(
      supabase,
      userId,
      resolvedData,
      { skipConflictCheck: resolution === "keepLocal" },
    );
    pendingRemotePushRef.current = false;

    return applyPushResult(result, "Unable to resolve this sync conflict.");
  }, [activeUserId, applyPushResult, refreshFromRemote, setAndPersistSyncSnapshot]);

  useEffect(() => {
    if (!isReady || !isAuthReady || !activeUserId) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== "active" || previousState === "active") {
        return;
      }

      const now = Date.now();
      if (now - lastForegroundRefreshAtRef.current < FOREGROUND_REFRESH_INTERVAL_MS) {
        return;
      }

      lastForegroundRefreshAtRef.current = now;
      void refreshFromRemote({
        force: !pendingRemotePushRef.current && !hasPendingSync(syncSnapshotRef.current),
      });
    });

    return () => subscription.remove();
  }, [activeUserId, isAuthReady, isReady, refreshFromRemote]);

  useEffect(() => {
    if (!isReady || !isAuthReady || !activeUserId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const subscription = subscribeTroveRealtimeForUser(supabase, activeUserId, () => {
      void refreshFromRemote({
        force: !pendingRemotePushRef.current && !hasPendingSync(syncSnapshotRef.current),
      });
    });

    return () => subscription.unsubscribe();
  }, [activeUserId, isAuthReady, isReady, refreshFromRemote]);

  useEffect(() => {
    if (!isReady || !isAuthReady) return;

    const userKey = activeUserId ?? "anonymous";
    let cancelled = false;

    void (async () => {
      if (await isTagBackfillDone(userKey)) return;

      try {
        const existingByName = new Map(dataRef.current.tagGroups.map((tagGroup) => [tagGroup.name, tagGroup]));
        const seeded =
          existingByName.has("Status") && existingByName.has("Priority")
            ? {
                statusOptionIdByName: new Map(
                  dataRef.current.tagOptions
                    .filter((option) => option.groupId === existingByName.get("Status")!.id)
                    .map((option) => [option.name.trim().toLowerCase(), option.id]),
                ),
                priorityOptionIdByName: new Map(
                  dataRef.current.tagOptions
                    .filter((option) => option.groupId === existingByName.get("Priority")!.id)
                    .map((option) => [option.name.trim().toLowerCase(), option.id]),
                ),
              }
            : seedDefaultTagGroups(createTagGroup, createTagOption);

        if (cancelled) return;

        const legacyByItemId = activeUserId
          ? await (async () => {
              const supabase = getSupabase();
              return supabase ? fetchLegacyItemFieldsForUser(supabase) : new Map();
            })()
          : new Map(dataRef.current.items.map((item) => [item.id, readLegacyFieldsFromLocalItem(item)]));

        if (cancelled) return;

        for (const item of dataRef.current.items) {
          if (item.tagOptionIds.length > 0) continue;
          const legacy = legacyByItemId.get(item.id);
          if (!legacy) continue;

          const tagOptionIds = resolveLegacyItemTagOptionIds(legacy, seeded);
          if (tagOptionIds.length > 0) {
            updateItem(item.id, { tagOptionIds });
          }
        }
      } catch (error) {
        console.warn("Failed to seed/backfill tag taxonomy", error);
      } finally {
        if (!cancelled) {
          await markTagBackfillDone(userKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserId, createTagGroup, createTagOption, isAuthReady, isReady, updateItem]);

  const resetToSeed = useCallback(() => {
    setData(seedData);
    seedDefaultTagGroups(createTagGroup, createTagOption);
  }, [createTagGroup, createTagOption]);
  const clearLocalData = useCallback(() => setData(emptyData), []);

  const value = useMemo<TroveContextValue>(
    () => ({
      ...data,
      isReady,
      syncSnapshot,
      createFolder,
      updateFolder,
      deleteFolder,
      createItem,
      updateItem,
      deleteItem,
      createTagGroup,
      updateTagGroup,
      deleteTagGroup,
      createTagOption,
      updateTagOption,
      deleteTagOption,
      canManageFolder,
      canEditFolderContent,
      canEditItem,
      refreshFromRemote,
      resolveSyncConflict,
      syncFolderForSharing,
      syncToRemote,
      resetToSeed,
      clearLocalData,
    }),
    [
      data,
      isReady,
      syncSnapshot,
      createFolder,
      updateFolder,
      deleteFolder,
      createItem,
      updateItem,
      deleteItem,
      createTagGroup,
      updateTagGroup,
      deleteTagGroup,
      createTagOption,
      updateTagOption,
      deleteTagOption,
      canManageFolder,
      canEditFolderContent,
      canEditItem,
      refreshFromRemote,
      resolveSyncConflict,
      syncFolderForSharing,
      syncToRemote,
      resetToSeed,
      clearLocalData,
    ],
  );

  return <TroveContext.Provider value={value}>{children}</TroveContext.Provider>;
};

export const TroveProvider = ({ children }: { children: ReactNode }) => (
  <InnerTroveProvider>{children}</InnerTroveProvider>
);

export const useTrove = (): TroveContextValue => {
  const context = useContext(TroveContext);
  if (!context) throw new Error("useTrove must be used inside TroveProvider");
  return context;
};
