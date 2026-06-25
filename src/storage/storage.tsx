import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppStateStatus } from "react-native";
import { Alert, AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../lib/supabase";
import { syncShareExtensionFolders } from "../share/sharedImport";
import { deleteStoredMediaForItems } from "../lib/supabaseStorage";
import {
  clearStoredRemoteUpdatedAt,
  ensureRemoteRowForUser,
  pullWaitingListForUser,
  pushFolderBranchForUser,
  pushWaitingListForUser,
  subscribeWaitingListRealtimeForUser,
} from "../sync/waitingListSync";
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

type RefreshFromRemoteOptions = {
  force?: boolean;
};

type WaitingListContextValue = WaitingListData & {
  isReady: boolean;
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
  const activeUserId = isAuthReady ? session?.user?.id ?? null : null;
  const dataRef = useRef(data);
  dataRef.current = data;
  const skipRemotePushRef = useRef(true);
  const skipNextRemotePushRef = useRef(false);
  const remoteRowExistsRef = useRef(false);
  const pendingRemotePushRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastForegroundRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!isAuthReady) return;

    let cancelled = false;
    skipRemotePushRef.current = true;
    skipNextRemotePushRef.current = false;
    remoteRowExistsRef.current = false;
    pendingRemotePushRef.current = false;
    setIsReady(false);
    setData(activeUserId ? emptyData : seedData);

    void loadWaitingListData(activeUserId)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch(() => {
        if (!cancelled) setData(activeUserId ? emptyData : seedData);
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

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
      void pushWaitingListForUser(supabase, userId, data)
        .then((result) => {
          if (result.ok) {
            remoteRowExistsRef.current = true;
          }
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
  }, [activeUserId, data, isReady, isAuthReady]);

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
    return folder;
  }, [activeUserId]);

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
    return didUpdate;
  }, []);

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
    return { ok: true };
  }, []);

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
    return item;
  }, [activeUserId]);

  const updateItem = useCallback<WaitingListContextValue["updateItem"]>((itemId, updates) => {
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
  }, [activeUserId]);

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

      const { error } = await supabase
        .from("waiting_list_items")
        .delete()
        .eq("id", itemId);
      if (error) {
        return { ok: false, error: error.message };
      }

      void deleteStoredMediaForItems(itemToDelete ? [itemToDelete] : []);
      setData((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
      return { ok: true };
    }

    if (itemToDelete) {
      const mediaResult = await deleteStoredMediaForItems([itemToDelete]);
      if (!mediaResult.ok) return mediaResult;
    }

    setData((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
    return { ok: true };
  }, [activeUserId]);

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
        return { ok: true };
      }

      if (result.kind === "no_row" && options?.force) {
        remoteRowExistsRef.current = false;
        skipNextRemotePushRef.current = true;
        setData((current) => ({
          folders: current.folders.filter((folder) => !folder.ownerId || folder.ownerId === userId),
          items: current.items.filter((item) => !item.ownerId || item.ownerId === userId),
        }));
        return { ok: true };
      }

      if (result.kind === "noop_up_to_date" || result.kind === "no_row" || result.kind === "noop_invalid") {
        return { ok: true };
      }

      return { ok: false, error: "Unable to refresh shared folders." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unable to refresh shared folders." };
    }
  }, [activeUserId]);

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
    const result = await pushWaitingListForUser(supabase, userId, dataRef.current);
    pendingRemotePushRef.current = false;

    if (!result.ok) {
      return { ok: false, error: result.error ?? "Unable to sync this folder before sharing." };
    }

    remoteRowExistsRef.current = true;
    return { ok: true };
  }, [activeUserId]);

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
    const result = await pushFolderBranchForUser(supabase, userId, dataRef.current, folderId);
    pendingRemotePushRef.current = false;

    if (!result.ok) {
      return { ok: false, error: result.error ?? "Unable to sync this folder before sharing." };
    }

    remoteRowExistsRef.current = true;
    return { ok: true };
  }, [activeUserId]);

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
      void refreshFromRemote({ force: !pendingRemotePushRef.current });
    });

    return () => subscription.remove();
  }, [activeUserId, isAuthReady, isReady, refreshFromRemote]);

  useEffect(() => {
    if (!isReady || !isAuthReady || !activeUserId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const subscription = subscribeWaitingListRealtimeForUser(supabase, activeUserId, () => {
      void refreshFromRemote({ force: !pendingRemotePushRef.current });
    });

    return () => subscription.unsubscribe();
  }, [activeUserId, isAuthReady, isReady, refreshFromRemote]);

  const resetToSeed = useCallback(() => setData(seedData), []);
  const clearLocalData = useCallback(() => setData(emptyData), []);

  const value = useMemo<WaitingListContextValue>(
    () => ({
      ...data,
      isReady,
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
      syncFolderForSharing,
      syncToRemote,
      resetToSeed,
      clearLocalData,
    }),
    [
      data,
      isReady,
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
