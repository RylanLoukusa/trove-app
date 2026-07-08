import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppStateStatus } from "react-native";
import { Alert, AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
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
  deleteWaitingListItemForUser,
  ensureRemoteRowForUser,
  pullWaitingListForUser,
  pushFolderBranchForUser,
  pushWaitingListForUser,
  subscribeWaitingListRealtimeForUser,
} from "../sync/waitingListSync";
import type { PushWaitingListResult } from "../sync/waitingListSync";
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
import { seedData } from "../data/seedData";
import { Folder, SavedItem, WaitingListData } from "../types/models";
import { canEditFolderContentRecord, canEditItemRecord, canManageFolderRecord } from "../utils/access";
import { createId } from "../utils/id";
import { canMoveFolder, deleteFolderRecursively, getFolderTreeIds } from "../utils/folderTree";
import { normalizeWaitingListData } from "../utils/itemTypes";

const STORAGE_KEY_PREFIX = "the-waiting-list:data:v1";
const emptyData: WaitingListData = { folders: [], items: [] };
const FOREGROUND_REFRESH_INTERVAL_MS = 30_000;

const hasWaitingListData = (data: WaitingListData): boolean => data.folders.length > 0 || data.items.length > 0;

const hasPendingSync = (snapshot: SyncSnapshot): boolean =>
  snapshot.status === "queued" ||
  snapshot.status === "saving" ||
  snapshot.status === "retrying" ||
  snapshot.status === "failed" ||
  snapshot.status === "conflicted";

type RefreshFromRemoteOptions = {
  force?: boolean;
};

type WaitingListContextValue = WaitingListData & {
  isReady: boolean;
  syncSnapshot: SyncSnapshot;
  createFolder: (input: Pick<Folder, "name" | "parentFolderId"> & Partial<Pick<Folder, "icon" | "color" | "purpose">>) => Folder | null;
  updateFolder: (folderId: string, updates: Partial<Pick<Folder, "name" | "parentFolderId" | "icon" | "color" | "purpose">>) => boolean;
  deleteFolder: (folderId: string) => Promise<{ ok: boolean; error?: string }>;
  createItem: (input: Omit<SavedItem, "id" | "createdAt" | "updatedAt">) => SavedItem | null;
  updateItem: (itemId: string, updates: Partial<Omit<SavedItem, "id" | "createdAt">>) => void;
  deleteItem: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
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

const WaitingListContext = createContext<WaitingListContextValue | undefined>(undefined);

const cleanOptionalText = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const storageKeyForUser = (userId?: string | null): string =>
  userId ? `${STORAGE_KEY_PREFIX}:user:${userId}` : `${STORAGE_KEY_PREFIX}:anonymous`;

export const loadWaitingListData = async (userId?: string | null): Promise<WaitingListData> => {
  const key = storageKeyForUser(userId);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) {
    const initialData = userId ? emptyData : seedData;
    await AsyncStorage.setItem(key, JSON.stringify(initialData));
    return normalizeWaitingListData(initialData);
  }
  return normalizeWaitingListData(JSON.parse(stored) as WaitingListData);
};

export const saveWaitingListData = async (data: WaitingListData, userId?: string | null): Promise<void> => {
  await AsyncStorage.setItem(storageKeyForUser(userId), JSON.stringify(data));
};

const InnerWaitingListProvider = ({ children }: { children: ReactNode }) => {
  const { session, isAuthReady } = useAuth();
  const [data, setData] = useState<WaitingListData>(seedData);
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
    if (!activeUserId) return;
    setSyncSnapshot((current) => {
      const nextSnapshot = queuedSyncSnapshot(current);
      void saveSyncSnapshot(activeUserId, nextSnapshot);
      return nextSnapshot;
    });
  }, [activeUserId]);

  const applyPushResult = useCallback(
    (result: PushWaitingListResult, fallbackError: string): { ok: boolean; error?: string } => {
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
          loadWaitingListData(activeUserId),
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
      void saveWaitingListData(data, activeUserId);
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
        const result = await pullWaitingListForUser(supabase, userId);
        if (cancelled) return;
        if (result.kind === "applied") {
          remoteRowExistsRef.current = true;
          shouldAllowRemotePush = true;
          skipNextRemotePushRef.current = true;
          setData(result.data);
        } else if (result.kind === "noop_up_to_date") {
          remoteRowExistsRef.current = true;
          shouldAllowRemotePush = true;
          const local = await loadWaitingListData(userId);
          if (!cancelled) {
            skipNextRemotePushRef.current = true;
            setData(local);
          }
        } else if (result.kind === "no_row") {
          shouldAllowRemotePush = true;
          if (hasWaitingListData(dataRef.current)) {
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
    const supabase = getSupabase();
    if (!supabase) return;
    if (skipRemotePushRef.current) return;
    if (skipNextRemotePushRef.current) {
      skipNextRemotePushRef.current = false;
      return;
    }
    if (!remoteRowExistsRef.current && !hasWaitingListData(data)) return;

    pendingRemotePushRef.current = true;
    let didStartPush = false;
    const handle = setTimeout(() => {
      didStartPush = true;
      setSyncSnapshot((current) => {
        const nextSnapshot = savingSyncSnapshot(current);
        void saveSyncSnapshot(userId, nextSnapshot);
        return nextSnapshot;
      });
      void pushWaitingListForUser(supabase, userId, data)
        .then((result) => {
          applyPushResult(result, "Unable to sync Trove data.");
        })
        .catch((error) => {
          setSyncSnapshot((current) => {
            const nextSnapshot = failedSyncSnapshot(
              current,
              error instanceof Error ? error.message : "Unable to sync Trove data.",
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
  }, [activeUserId, applyPushResult, data, isReady, isAuthReady]);

  const createFolder = useCallback<WaitingListContextValue["createFolder"]>((input) => {
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

  const updateFolder = useCallback<WaitingListContextValue["updateFolder"]>((folderId, updates) => {
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

  const deleteFolder = useCallback<WaitingListContextValue["deleteFolder"]>(async (folderId) => {
    const folder = dataRef.current.folders.find((candidate) => candidate.id === folderId);
    if (!canManageFolderRecord(folder)) {
      return { ok: false, error: "Only the folder owner can delete this folder." };
    }

    const folderIdsToDelete = getFolderTreeIds(dataRef.current.folders, folderId);
    const itemsToDelete = dataRef.current.items.filter((item) => folderIdsToDelete.includes(item.folderId));
    const mediaResult = await deleteStoredMediaForItems(itemsToDelete);
    if (!mediaResult.ok) return mediaResult;

    setData((current) => deleteFolderRecursively(current.folders, current.items, folderId));
    markLocalChangePending();
    return { ok: true };
  }, [markLocalChangePending]);

  const createItem = useCallback<WaitingListContextValue["createItem"]>((input) => {
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
      tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
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

  const updateItem = useCallback<WaitingListContextValue["updateItem"]>((itemId, updates) => {
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
          tags: updates.tags ?? item.tags,
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

  const canManageFolder = useCallback<WaitingListContextValue["canManageFolder"]>((folderId) => {
    if (!folderId) return true;
    return canManageFolderRecord(dataRef.current.folders.find((folder) => folder.id === folderId));
  }, []);

  const canEditFolderContent = useCallback<WaitingListContextValue["canEditFolderContent"]>((folderId) => {
    if (!folderId) return true;
    return canEditFolderContentRecord(dataRef.current.folders.find((folder) => folder.id === folderId));
  }, []);

  const canEditItem = useCallback<WaitingListContextValue["canEditItem"]>((itemId) => {
    const item = dataRef.current.items.find((candidate) => candidate.id === itemId);
    const folder = dataRef.current.folders.find((candidate) => candidate.id === item?.folderId);
    return canEditItemRecord(item, folder);
  }, []);

  const deleteItem = useCallback<WaitingListContextValue["deleteItem"]>(async (itemId) => {
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

      const deleteResult = await deleteWaitingListItemForUser(
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

  const refreshFromRemote = useCallback<WaitingListContextValue["refreshFromRemote"]>(async (options) => {
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

      const result = await pullWaitingListForUser(supabase, userId);

      if (result.kind === "applied") {
        skipNextRemotePushRef.current = true;
        setData(result.data);
        remoteRowExistsRef.current = true;
        setAndPersistSyncSnapshot(syncedSyncSnapshot());
        return { ok: true };
      }

      if (result.kind === "no_row" && options?.force) {
        remoteRowExistsRef.current = false;
        skipNextRemotePushRef.current = true;
        setData((current) => ({
          folders: current.folders.filter((folder) => !folder.ownerId || folder.ownerId === userId),
          items: current.items.filter((item) => !item.ownerId || item.ownerId === userId),
        }));
        setAndPersistSyncSnapshot(syncedSyncSnapshot());
        return { ok: true };
      }

      if (result.kind === "noop_up_to_date" || result.kind === "no_row" || result.kind === "noop_invalid") {
        return { ok: true };
      }

      return { ok: false, error: "Unable to refresh shared folders." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unable to refresh shared folders." };
    }
  }, [activeUserId, setAndPersistSyncSnapshot]);

  const syncToRemote = useCallback<WaitingListContextValue["syncToRemote"]>(async () => {
    const userId = activeUserId;
    if (!userId) {
      return { ok: false, error: "Sign in to sync folders before sharing." };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase not configured." };
    }

    pendingRemotePushRef.current = true;
    setAndPersistSyncSnapshot(savingSyncSnapshot(syncSnapshotRef.current));
    const result = await pushWaitingListForUser(supabase, userId, dataRef.current);
    pendingRemotePushRef.current = false;

    return applyPushResult(result, "Unable to sync this folder before sharing.");
  }, [activeUserId, applyPushResult, setAndPersistSyncSnapshot]);

  const syncFolderForSharing = useCallback<WaitingListContextValue["syncFolderForSharing"]>(async (folderId) => {
    const userId = activeUserId;
    if (!userId) {
      return { ok: false, error: "Sign in to sync folders before sharing." };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase not configured." };
    }

    pendingRemotePushRef.current = true;
    setAndPersistSyncSnapshot(savingSyncSnapshot(syncSnapshotRef.current));
    const result = await pushFolderBranchForUser(supabase, userId, dataRef.current, folderId);
    pendingRemotePushRef.current = false;

    return applyPushResult(result, "Unable to sync this folder before sharing.");
  }, [activeUserId, applyPushResult, setAndPersistSyncSnapshot]);

  const resolveSyncConflict = useCallback<WaitingListContextValue["resolveSyncConflict"]>(async (resolution) => {
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
      await saveWaitingListData(resolvedData, userId);
      const baseline = await loadSyncBaseline(userId);
      const entityKind = conflict.entityKind as SyncEntityKind;
      const nextBaseline: SyncBaseline = {
        folders: { ...baseline.folders },
        items: { ...baseline.items },
      };
      nextBaseline[entityKind][conflict.entityId] = conflict.remoteUpdatedAt;
      await saveSyncBaseline(userId, nextBaseline);
    }

    const result = await pushWaitingListForUser(
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

    const subscription = subscribeWaitingListRealtimeForUser(supabase, activeUserId, () => {
      void refreshFromRemote({
        force: !pendingRemotePushRef.current && !hasPendingSync(syncSnapshotRef.current),
      });
    });

    return () => subscription.unsubscribe();
  }, [activeUserId, isAuthReady, isReady, refreshFromRemote]);

  const resetToSeed = useCallback(() => setData(seedData), []);
  const clearLocalData = useCallback(() => setData(emptyData), []);

  const value = useMemo<WaitingListContextValue>(
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

  return <WaitingListContext.Provider value={value}>{children}</WaitingListContext.Provider>;
};

export const WaitingListProvider = ({ children }: { children: ReactNode }) => (
  <InnerWaitingListProvider>{children}</InnerWaitingListProvider>
);

export const useWaitingList = (): WaitingListContextValue => {
  const context = useContext(WaitingListContext);
  if (!context) throw new Error("useWaitingList must be used inside WaitingListProvider");
  return context;
};
