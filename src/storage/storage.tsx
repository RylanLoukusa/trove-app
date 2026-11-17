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
import { seedData, seedFolders, seedItems, seedListEntries } from "../data/seedData";
import { isBaseDataSeeded, markBaseDataSeeded } from "./baseDataSeed";
import { isOwnDataUploaded, markOwnDataUploaded, mergeForFirstUpload } from "./firstUpload";
import { isPinnedDefaultsDone, markPinnedDefaultsDone, planPinnedDefaults } from "./pinnedDefaults";
import {
  isTagBackfillDone,
  markTagBackfillDone,
  readLegacyFieldsFromLocalItem,
  fetchLegacyItemFieldsForUser,
  resolveLegacyItemTagOptionIds,
  seedDefaultTagGroups,
} from "./tagBackfill";
import { Folder, ListEntry, SavedItem, TagGroup, TagOption, TroveData } from "../types/models";
import { canEditFolderContentRecord, canEditItemRecord, canManageFolderRecord } from "../utils/access";
import { copyEntriesForList, copyTitle, isPastKeeping, SetAsideFolder, sortByLifecycle } from "../utils/listLifecycle";
import { friendlyErrorMessage } from "../utils/errorMessages";
import { createId } from "../utils/id";
import { canMoveFolder, deleteFolderRecursively, getFolderTreeIds } from "../utils/folderTree";
import { normalizeTroveData } from "../utils/itemTypes";
import {
  applyListItemsToEntries,
  canListBorrowLines,
  focusReferenceId,
  generatePositionBetween,
  generatePositionsBetween,
  hydrateItemsWithEntries,
  isFocusList,
  isValidPosition,
  listIdsLendingLines,
  MAX_ENTRY_INDENT,
  pruneReferencesToRemoved,
  sortEntries,
  UNTITLED_LIST_TITLE,
} from "../utils/listEntries";

const STORAGE_KEY_PREFIX = "trove:data:v1";
const emptyData: TroveData = { folders: [], items: [], listEntries: [], tagGroups: [], tagOptions: [] };
const FOREGROUND_REFRESH_INTERVAL_MS = 30_000;

const hasTroveData = (data: TroveData): boolean =>
  data.folders.length > 0 || data.items.length > 0 || data.tagGroups.length > 0 || data.tagOptions.length > 0;

const hasPendingSync = (snapshot: SyncSnapshot): boolean =>
  hasUnsentChanges(snapshot) || snapshot.status === "conflicted";

// Changes made on this device that haven't reached the server yet.
const hasUnsentChanges = (snapshot: SyncSnapshot): boolean =>
  snapshot.status === "queued" ||
  snapshot.status === "saving" ||
  snapshot.status === "retrying" ||
  snapshot.status === "failed";

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
  // Deletes for good. Everyday deleting goes through trashItem / trashFolder,
  // which keep the list in Recently deleted first.
  deleteItem: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
  // Lists set aside: `items` and `folders` hold only what is in everyday use.
  archivedItems: SavedItem[];
  deletedItems: SavedItem[];
  templates: SavedItem[];
  archivedFolders: SetAsideFolder[];
  deletedFolders: SetAsideFolder[];
  // Moves a list to Recently deleted, where it waits 30 days.
  trashItem: (itemId: string) => { ok: boolean; error?: string };
  // Puts a deleted list back; onto Home when its folder is gone.
  restoreItem: (itemId: string) => boolean;
  // Moves a folder, its subfolders and their lists to Recently deleted. A
  // folder with no lists in it is simply deleted.
  trashFolder: (folderId: string) => Promise<{ ok: boolean; error?: string }>;
  restoreFolder: (folderId: string) => boolean;
  setItemArchived: (itemId: string, archived: boolean) => boolean;
  // Archives (or brings back) a folder along with every list in it.
  setFolderArchived: (folderId: string, archived: boolean) => boolean;
  // Copies a list and its own lines. `fresh` starts the copy unchecked and
  // without dates; `template` says whether the copy is a template.
  copyItem: (
    itemId: string,
    options?: { title?: string; fresh?: boolean; template?: boolean; folderId?: string },
  ) => SavedItem | null;
  // Everything on this device except what is in Recently deleted, for exports.
  getExportData: () => TroveData;
  // Makes a list from ready-made lines (a starter template).
  createItemWithLines: (
    title: string,
    lines: Array<Pick<ListEntry, "text"> & Partial<Pick<ListEntry, "kind" | "indentLevel" | "bold">>>,
  ) => SavedItem | null;
  // Editing a line pulled in from another list edits the original, except
  // for its indent, which belongs to the list it is shown in.
  updateListEntry: (
    entryId: string,
    updates: Partial<
      Pick<
        ListEntry,
        "text" | "checked" | "kind" | "bold" | "images" | "indentLevel" | "notes" | "dueDate" | "tagOptionIds"
      >
    >,
  ) => boolean;
  // Checks or unchecks several checklist lines at once. Returns how many changed.
  setEntriesChecked: (entryIds: string[], checked: boolean) => number;
  createListEntry: (
    listId: string,
    input: Pick<ListEntry, "text"> & Partial<Pick<ListEntry, "kind" | "dueDate" | "tagOptionIds">>,
  ) => ListEntry | null;
  // Adds lines right after `afterEntryId` (or at the end when it's null or not
  // on this list), in order. Used for Return and for pasting many lines.
  insertListEntries: (
    listId: string,
    afterEntryId: string | null,
    inputs: Array<Pick<ListEntry, "text"> & Partial<Pick<ListEntry, "kind" | "checked" | "indentLevel" | "bold" | "images">>>,
  ) => ListEntry[];
  // Moves lines to other lists. A line pulled in from another list moves
  // that original. Without a position a line goes to the end of its new
  // list. Returns where each moved line was, for Undo.
  relocateListEntries: (
    moves: Array<{ entryId: string; listId: string; position?: string }>,
  ) => Array<{ entryId: string; listId: string; position: string }>;
  // Puts deleted lines back exactly as they were (Undo after a delete).
  restoreListEntries: (entries: ListEntry[]) => number;
  // Places the entry between two neighbours (either may be null for the ends).
  moveListEntry: (entryId: string, afterEntryId: string | null, beforeEntryId: string | null) => boolean;
  deleteListEntry: (entryId: string) => boolean;
  // Pulls lines from other lists into a list (appended, skipping ones already
  // there). The lines stay in their own lists and show in both. Any list can
  // pull lines in unless its own lines are shown in another list; lines of a
  // list that pulls can't be pulled themselves. `position` places a single
  // added line; otherwise lines go at the end. Returns how many were added.
  // removeFromFocusList takes one back out and clearFocusList clears the
  // list; neither touches the original lines, though clearing does delete
  // the list's own.
  addToFocusList: (focusListId: string, entryIds: string[], position?: string) => number;
  // Moves an entry to an exact position key.
  positionListEntry: (entryId: string, position: string) => boolean;
  removeFromFocusList: (focusListId: string, entryId: string) => boolean;
  clearFocusList: (focusListId: string, which: "done" | "all") => number;
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
  const [data, setDataState] = useState<TroveData>(seedData);
  // Every local change goes through here so that removing a line also removes
  // it from any focus list that shows it.
  const setData = useCallback((next: TroveData | ((current: TroveData) => TroveData)) => {
    if (typeof next !== "function") {
      setDataState(next);
      return;
    }
    setDataState((current) => {
      const updated = next(current);
      if (updated.listEntries === current.listEntries) return updated;
      const listEntries = pruneReferencesToRemoved(current.listEntries, updated.listEntries);
      return listEntries === updated.listEntries ? updated : { ...updated, listEntries };
    });
  }, []);
  const [isReady, setIsReady] = useState(false);
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>({
    retryCount: 0,
    status: "synced",
  });
  const activeUserId = isAuthReady ? session?.user?.id ?? null : null;
  const dataRef = useRef(data);
  dataRef.current = data;
  // The account whose first pull from the server after loading has finished
  // (or had none to wait for), so lists made on another device are here.
  const [initialPullSettledFor, setInitialPullSettledFor] = useState<string | null>(null);
  const pinnedDefaultsKeyRef = useRef<string | null>(null);
  const syncSnapshotRef = useRef(syncSnapshot);
  syncSnapshotRef.current = syncSnapshot;
  const skipRemotePushRef = useRef(true);
  const skipNextRemotePushRef = useRef(false);
  const remoteRowExistsRef = useRef(false);
  const pendingRemotePushRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastForegroundRefreshAtRef = useRef(0);
  // A pull from the server that had to wait for this device's own changes to
  // go up first (see refreshWhenIdle), run once they have.
  const refreshAfterPushRef = useRef(false);
  const refreshWhenIdleRef = useRef<() => void>(() => {});

  const setAndPersistSyncSnapshot = useCallback(
    (nextSnapshot: SyncSnapshot) => {
      syncSnapshotRef.current = nextSnapshot;
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
    (result: PushTroveResult, fallbackError: string): { ok: boolean; error?: string } => {
      if (result.ok) {
        remoteRowExistsRef.current = true;
        setAndPersistSyncSnapshot(syncedSyncSnapshot());
        // After the push that called this has finished tidying up.
        if (refreshAfterPushRef.current) setTimeout(() => refreshWhenIdleRef.current(), 0);
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
    setInitialPullSettledFor(null);
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
      setInitialPullSettledFor("anonymous");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      skipRemotePushRef.current = false;
      setInitialPullSettledFor(userId);
      return;
    }

    if (hasPendingSync(syncSnapshotRef.current)) {
      skipRemotePushRef.current = false;
      setInitialPullSettledFor(userId);
      return;
    }

    skipRemotePushRef.current = true;
    let cancelled = false;
    let shouldAllowRemotePush = false;
    let pulled = false;

    void (async () => {
      try {
        // Lists kept only on this device (before every account synced) are
        // merged with the server's copy and uploaded, rather than replaced.
        const seenBefore = (await isOwnDataUploaded(userId)) ? null : await loadSyncBaseline(userId);
        if (cancelled) return;
        let upload: TroveData | null = null;
        const result = await pullTroveDataForUser(supabase, userId);
        if (cancelled) return;
        pulled = result.kind !== "error";
        if (result.kind === "applied") {
          remoteRowExistsRef.current = true;
          shouldAllowRemotePush = true;
          skipNextRemotePushRef.current = true;
          if (seenBefore) {
            upload = mergeForFirstUpload(dataRef.current, result.data, userId, seenBefore);
            setData(upload);
          } else {
            setData(result.data);
          }
        } else if (result.kind === "noop_up_to_date") {
          remoteRowExistsRef.current = true;
          shouldAllowRemotePush = true;
          const local = await loadTroveData(userId);
          if (!cancelled) {
            skipNextRemotePushRef.current = true;
            setData(local);
            if (seenBefore) upload = local;
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
            const itemIdBySeedId = new Map(seedItems.map((seedItem) => [seedItem.id, createId("item")]));
            const newItems: SavedItem[] = seedItems.map((seedItem) => ({
              ...seedItem,
              id: itemIdBySeedId.get(seedItem.id)!,
              folderId: folderIdBySeedId.get(seedItem.folderId) ?? seedItem.folderId,
              ownerId: userId,
              createdBy: userId,
              accessRole: "owner",
              createdAt: timestamp,
              updatedAt: timestamp,
            }));
            const newEntries: ListEntry[] = seedListEntries.map((seedEntry) => ({
              ...seedEntry,
              id: createId("entry"),
              listId: itemIdBySeedId.get(seedEntry.listId) ?? seedEntry.listId,
              ownerId: userId,
              createdBy: userId,
              createdAt: timestamp,
              updatedAt: timestamp,
            }));
            setData((current) => ({
              ...current,
              folders: [...current.folders, ...newFolders],
              items: [...newItems, ...current.items],
              listEntries: [...current.listEntries, ...newEntries],
            }));
            markLocalChangePending();
            await markBaseDataSeeded(userId);
          } else if (hasTroveData(dataRef.current)) {
            const ensured = await ensureRemoteRowForUser(supabase, userId, dataRef.current);
            remoteRowExistsRef.current = ensured.created;
            if (ensured.created) await markOwnDataUploaded(userId);
          }
        }
        if (upload && !cancelled) {
          const pushed = await pushTroveDataForUser(supabase, userId, upload);
          if (!cancelled) applyPushResult(pushed, "Unable to sync Trove data.");
          if (pushed.ok) await markOwnDataUploaded(userId);
        }
      } finally {
        if (!cancelled) {
          skipRemotePushRef.current = !shouldAllowRemotePush;
          // Offline, it waits for the next launch rather than risk making
          // lists that are already on the server.
          if (pulled) setInitialPullSettledFor(userId);
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
    // The change that put pulled data in place needs no push. It is let go
    // first, even mid-pull, or it would swallow the next real change instead.
    if (skipNextRemotePushRef.current) {
      skipNextRemotePushRef.current = false;
      return;
    }
    if (skipRemotePushRef.current) return;
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
  }, [activeUserId, applyPushResult, data, isReady, isAuthReady]);

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

    setData((current) => {
      const remaining = deleteFolderRecursively(current.folders, current.items, folderId);
      const remainingItemIds = new Set(remaining.items.map((item) => item.id));
      return {
        ...current,
        ...remaining,
        listEntries: current.listEntries.filter((entry) => remainingItemIds.has(entry.listId)),
      };
    });
    markLocalChangePending();
    return { ok: true };
  }, [markLocalChangePending]);

  const createItem = useCallback<TroveContextValue["createItem"]>((input) => {
    const folder = dataRef.current.folders.find((candidate) => candidate.id === input.folderId);
    if (input.folderId && !canEditFolderContentRecord(folder)) {
      Alert.alert("Cannot add list", "You do not have permission to add lists to that folder.");
      return null;
    }

    const timestamp = new Date().toISOString();
    const { listItems, ...itemInput } = input;
    const item: SavedItem = {
      ...itemInput,
      id: createId("item"),
      title: input.title.trim() || UNTITLED_LIST_TITLE,
      tagOptionIds: input.tagOptionIds,
      ownerId: folder?.ownerId ?? activeUserId ?? undefined,
      createdBy: input.createdBy ?? activeUserId ?? undefined,
      accessRole: folder?.accessRole ?? (activeUserId ? "owner" : undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setData((current) => ({
      ...current,
      items: [item, ...current.items],
      listEntries: listItems
        ? applyListItemsToEntries({
            listId: item.id,
            listItems,
            entries: current.listEntries,
            timestamp,
            ownerId: item.ownerId,
            userId: activeUserId ?? undefined,
            createId: () => createId("entry"),
          })
        : current.listEntries,
    }));
    markLocalChangePending();
    return listItems ? { ...item, listItems } : item;
  }, [activeUserId, markLocalChangePending]);

  const updateItem = useCallback<TroveContextValue["updateItem"]>((itemId, allUpdates) => {
    let didUpdate = false;
    const { listItems, ...updates } = allUpdates;
    setData((current) => {
      let nextListEntries = current.listEntries;
      const items = current.items.map((item) => {
        if (item.id !== itemId) return item;
        const currentFolder = current.folders.find((folder) => folder.id === item.folderId);
        const nextFolderId = updates.folderId ?? item.folderId;
        const nextFolder = current.folders.find((folder) => folder.id === nextFolderId);

        if (!canEditItemRecord(item, currentFolder)) {
          Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
          return item;
        }

        if (nextFolderId && !canEditFolderContentRecord(nextFolder)) {
          Alert.alert("Cannot move list", "You do not have permission to add lists to that folder.");
          return item;
        }

        didUpdate = true;
        const timestamp = new Date().toISOString();
        const nextItem: SavedItem = {
          ...item,
          ...updates,
          title: updates.title?.trim() || item.title,
          tagOptionIds: updates.tagOptionIds ?? item.tagOptionIds,
          ownerId: nextFolder?.ownerId ?? item.ownerId ?? activeUserId ?? undefined,
          accessRole: nextFolder?.accessRole ?? item.accessRole ?? (activeUserId ? "owner" : undefined),
        };

        // A focus list's lines point at other lists, so they are only changed
        // through the entry actions, never by rewriting the whole array.
        if (listItems && !isFocusList(item)) {
          nextListEntries = applyListItemsToEntries({
            listId: item.id,
            listItems,
            entries: current.listEntries,
            timestamp,
            ownerId: nextItem.ownerId,
            userId: activeUserId ?? undefined,
            createId: () => createId("entry"),
          });
        }

        // Editing only the list's lines leaves the item row untouched, so
        // checking off a line never conflicts with an edit to the list itself.
        const itemChanged = (Object.keys(nextItem) as Array<keyof SavedItem>).some(
          (key) => JSON.stringify(nextItem[key]) !== JSON.stringify(item[key]),
        );
        return itemChanged ? { ...nextItem, updatedAt: timestamp } : item;
      });
      return { ...current, items, listEntries: nextListEntries };
    });
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
        listEntries: current.listEntries.map((entry) =>
          entry.tagOptionIds.some((id) => optionIdsInGroup.has(id))
            ? { ...entry, tagOptionIds: entry.tagOptionIds.filter((id) => !optionIdsInGroup.has(id)) }
            : entry,
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
      listEntries: current.listEntries.some((entry) => entry.tagOptionIds.includes(optionId))
        ? current.listEntries.map((entry) =>
            entry.tagOptionIds.includes(optionId)
              ? { ...entry, tagOptionIds: entry.tagOptionIds.filter((id) => id !== optionId) }
              : entry,
          )
        : current.listEntries,
    }));
    markLocalChangePending();
  }, [markLocalChangePending]);

  const canEditListRecord = useCallback((listId?: string): boolean => {
    const list = dataRef.current.items.find((candidate) => candidate.id === listId);
    const folder = dataRef.current.folders.find((candidate) => candidate.id === list?.folderId);
    return !!list && canEditItemRecord(list, folder);
  }, []);

  const updateListEntry = useCallback<TroveContextValue["updateListEntry"]>((requestedId, updates) => {
    const requested = dataRef.current.listEntries.find((candidate) => candidate.id === requestedId);
    const isReference = !!requested?.refEntryId;
    const entryId = requested?.refEntryId ?? requestedId;
    const entry = isReference ? dataRef.current.listEntries.find((candidate) => candidate.id === entryId) : requested;

    // A pulled-in line keeps its own indent; everything else is the original's.
    const { indentLevel, ...contentUpdates } = updates;
    const placementIndent = isReference ? indentLevel : undefined;
    const sourceUpdates = isReference ? contentUpdates : updates;
    const changesSource = Object.keys(sourceUpdates).length > 0;

    if (
      !requested ||
      (changesSource && (!entry || !canEditListRecord(entry.listId))) ||
      (placementIndent !== undefined && !canEditListRecord(requested.listId))
    ) {
      Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
      return false;
    }
    if (!changesSource && placementIndent === undefined) return true;

    const timestamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      listEntries: current.listEntries.map((candidate) => {
        if (placementIndent !== undefined && candidate.id === requestedId) {
          return { ...candidate, indentLevel: placementIndent, updatedAt: timestamp };
        }
        if (!changesSource || candidate.id !== entryId) return candidate;
        const next: ListEntry = { ...candidate, ...sourceUpdates, updatedAt: timestamp };
        if (!next.bold) delete next.bold;
        if (!next.images?.length) delete next.images;
        if (next.kind !== "check") next.checked = false;
        if (next.checked !== candidate.checked) next.completedAt = next.checked ? timestamp : undefined;
        return next;
      }),
    }));
    markLocalChangePending();
    return true;
  }, [canEditListRecord, markLocalChangePending]);

  const setEntriesChecked = useCallback<TroveContextValue["setEntriesChecked"]>((entryIds, checked) => {
    const entriesById = new Map(dataRef.current.listEntries.map((entry) => [entry.id, entry]));
    const targetIds = new Set<string>();
    entryIds.forEach((entryId) => {
      const requested = entriesById.get(entryId);
      const entry = requested?.refEntryId ? entriesById.get(requested.refEntryId) : requested;
      if (entry && entry.kind === "check" && entry.checked !== checked && canEditListRecord(entry.listId)) {
        targetIds.add(entry.id);
      }
    });
    if (targetIds.size === 0) return 0;

    const timestamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      listEntries: current.listEntries.map((candidate) =>
        targetIds.has(candidate.id)
          ? { ...candidate, checked, completedAt: checked ? timestamp : undefined, updatedAt: timestamp }
          : candidate,
      ),
    }));
    markLocalChangePending();
    return targetIds.size;
  }, [canEditListRecord, markLocalChangePending]);

  const createListEntry = useCallback<TroveContextValue["createListEntry"]>((listId, input) => {
    const list = dataRef.current.items.find((candidate) => candidate.id === listId);
    if (!list || !canEditListRecord(listId)) {
      Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
      return null;
    }

    const siblings = sortEntries(dataRef.current.listEntries.filter((entry) => entry.listId === listId));
    const timestamp = new Date().toISOString();
    const entry: ListEntry = {
      id: createId("entry"),
      listId,
      kind: input.kind ?? siblings[siblings.length - 1]?.kind ?? "check",
      text: input.text.trim(),
      checked: false,
      indentLevel: 0,
      position: generatePositionBetween(siblings[siblings.length - 1]?.position ?? null, null),
      dueDate: input.dueDate,
      tagOptionIds: input.tagOptionIds ?? [],
      ownerId: list.ownerId ?? activeUserId ?? undefined,
      createdBy: activeUserId ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setData((current) => ({ ...current, listEntries: [...current.listEntries, entry] }));
    markLocalChangePending();
    return entry;
  }, [activeUserId, canEditListRecord, markLocalChangePending]);

  const insertListEntries = useCallback<TroveContextValue["insertListEntries"]>((listId, afterEntryId, inputs) => {
    const list = dataRef.current.items.find((candidate) => candidate.id === listId);
    if (!list || !canEditListRecord(listId)) {
      Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
      return [];
    }
    if (inputs.length === 0) return [];

    const siblings = sortEntries(dataRef.current.listEntries.filter((entry) => entry.listId === listId));
    const afterIndex = afterEntryId ? siblings.findIndex((entry) => entry.id === afterEntryId) : -1;
    const after = afterIndex >= 0 ? siblings[afterIndex] : siblings[siblings.length - 1];
    const before = afterIndex >= 0 ? siblings[afterIndex + 1] : undefined;
    const positions = generatePositionsBetween(after?.position ?? null, before?.position ?? null, inputs.length);
    const fallbackKind = after?.kind ?? siblings[siblings.length - 1]?.kind ?? "check";
    const timestamp = new Date().toISOString();
    const created: ListEntry[] = inputs.map((input, index) => {
      const kind = input.kind ?? fallbackKind;
      const checked = kind === "check" && !!input.checked;
      return {
        id: createId("entry"),
        listId,
        kind,
        text: input.text.trim(),
        checked,
        completedAt: checked ? timestamp : undefined,
        indentLevel: Math.max(0, Math.min(input.indentLevel ?? 0, MAX_ENTRY_INDENT)),
        ...(input.bold ? { bold: true } : {}),
        ...(input.images?.length ? { images: input.images } : {}),
        position: positions[index],
        tagOptionIds: [],
        ownerId: list.ownerId ?? activeUserId ?? undefined,
        createdBy: activeUserId ?? undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
    setData((current) => ({ ...current, listEntries: [...current.listEntries, ...created] }));
    markLocalChangePending();
    return created;
  }, [activeUserId, canEditListRecord, markLocalChangePending]);

  const relocateListEntries = useCallback<TroveContextValue["relocateListEntries"]>((moves) => {
    const { items, listEntries } = dataRef.current;
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const entriesById = new Map(listEntries.map((entry) => [entry.id, entry]));
    const previous: Array<{ entryId: string; listId: string; position: string }> = [];
    const updates = new Map<string, Pick<ListEntry, "listId" | "position" | "ownerId">>();
    // Last position handed out per target list, so several moves stack in order.
    const lastPosition = new Map<string, string | null>();
    let denied = false;

    moves.forEach((move) => {
      const requested = entriesById.get(move.entryId);
      const entry = requested?.refEntryId ? entriesById.get(requested.refEntryId) : requested;
      const target = itemsById.get(move.listId);
      if (!entry || !target || target.type !== "list" || updates.has(entry.id)) return;
      if (entry.listId === target.id && !move.position) return;
      if (!canEditListRecord(entry.listId) || !canEditListRecord(target.id)) {
        denied = true;
        return;
      }
      let position = move.position;
      if (!position || !isValidPosition(position)) {
        if (!lastPosition.has(target.id)) {
          const siblings = sortEntries(listEntries.filter((candidate) => candidate.listId === target.id));
          lastPosition.set(target.id, siblings[siblings.length - 1]?.position ?? null);
        }
        position = generatePositionBetween(lastPosition.get(target.id) ?? null, null);
        lastPosition.set(target.id, position);
      }
      previous.push({ entryId: entry.id, listId: entry.listId, position: entry.position });
      updates.set(entry.id, { listId: target.id, position, ownerId: target.ownerId ?? entry.ownerId });
    });

    if (denied) Alert.alert("Cannot move line", "You need edit access to both lists to move a line.");
    if (updates.size === 0) return [];
    const timestamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      listEntries: current.listEntries
        // A list that showed the line as pulled in now holds the line itself.
        .filter(
          (candidate) => !candidate.refEntryId || updates.get(candidate.refEntryId)?.listId !== candidate.listId,
        )
        .map((candidate) => {
          const update = updates.get(candidate.id);
          return update ? { ...candidate, ...update, updatedAt: timestamp } : candidate;
        }),
    }));
    markLocalChangePending();
    return previous;
  }, [canEditListRecord, markLocalChangePending]);

  const restoreListEntries = useCallback<TroveContextValue["restoreListEntries"]>((entries) => {
    const { listEntries } = dataRef.current;
    const existing = new Set(listEntries.map((entry) => entry.id));
    const restorable = entries.filter((entry) => !existing.has(entry.id) && canEditListRecord(entry.listId));
    if (restorable.length === 0) return 0;
    const timestamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      listEntries: [...current.listEntries, ...restorable.map((entry) => ({ ...entry, updatedAt: timestamp }))],
    }));
    markLocalChangePending();
    return restorable.length;
  }, [canEditListRecord, markLocalChangePending]);

  const moveListEntry = useCallback<TroveContextValue["moveListEntry"]>((entryId, afterEntryId, beforeEntryId) => {
    const entries = dataRef.current.listEntries;
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry || !canEditListRecord(entry.listId)) {
      Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
      return false;
    }

    const after = entries.find((candidate) => candidate.id === afterEntryId && candidate.listId === entry.listId);
    const before = entries.find((candidate) => candidate.id === beforeEntryId && candidate.listId === entry.listId);
    const lower = after?.position ?? null;
    let upper = before?.position ?? null;
    if (lower !== null && upper !== null && lower >= upper) upper = null;
    if ((lower === null || entry.position > lower) && (upper === null || entry.position < upper)) return true;

    const timestamp = new Date().toISOString();
    const position = generatePositionBetween(lower, upper);
    setData((current) => ({
      ...current,
      listEntries: current.listEntries.map((candidate) =>
        candidate.id === entryId ? { ...candidate, position, updatedAt: timestamp } : candidate,
      ),
    }));
    markLocalChangePending();
    return true;
  }, [canEditListRecord, markLocalChangePending]);

  const deleteListEntry = useCallback<TroveContextValue["deleteListEntry"]>((entryId) => {
    const entry = dataRef.current.listEntries.find((candidate) => candidate.id === entryId);
    if (!entry || !canEditListRecord(entry.listId)) {
      Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
      return false;
    }

    setData((current) => ({ ...current, listEntries: current.listEntries.filter((candidate) => candidate.id !== entryId) }));
    markLocalChangePending();
    return true;
  }, [canEditListRecord, markLocalChangePending]);

  const addToFocusList = useCallback<TroveContextValue["addToFocusList"]>((focusListId, entryIds, position) => {
    const { items, listEntries } = dataRef.current;
    const focusList = items.find((candidate) => candidate.id === focusListId);
    if (!focusList || focusList.type !== "list" || !canEditListRecord(focusListId)) {
      Alert.alert("Cannot edit list", "You do not have permission to edit this list.");
      return 0;
    }
    if (!canListBorrowLines(focusList, listIdsLendingLines(listEntries))) return 0;

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const alreadyIn = new Set(
      listEntries.filter((entry) => entry.listId === focusListId && entry.refEntryId).map((entry) => entry.refEntryId),
    );
    const sources = entryIds
      .filter((entryId, index) => entryIds.indexOf(entryId) === index && !alreadyIn.has(entryId))
      .map((entryId) => listEntries.find((entry) => entry.id === entryId))
      .filter((entry): entry is ListEntry => {
        if (!entry || entry.refEntryId || entry.listId === focusListId) return false;
        const list = itemsById.get(entry.listId);
        return !!list && !isFocusList(list);
      });
    if (sources.length === 0) return 0;

    const siblings = sortEntries(listEntries.filter((entry) => entry.listId === focusListId));
    const positions =
      position && sources.length === 1
        ? [position]
        : generatePositionsBetween(siblings[siblings.length - 1]?.position ?? null, null, sources.length);
    const timestamp = new Date().toISOString();
    const references: ListEntry[] = sources.map((source, index) => ({
      id: focusReferenceId(focusListId, source.id),
      listId: focusListId,
      kind: "check",
      text: "",
      checked: false,
      indentLevel: 0,
      position: positions[index],
      tagOptionIds: [],
      refEntryId: source.id,
      ownerId: focusList?.ownerId ?? activeUserId ?? undefined,
      createdBy: activeUserId ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const referenceIds = new Set(references.map((reference) => reference.id));
    setData((current) => ({
      ...current,
      // The first line a list pulls in marks it as a list that shows lines
      // from other lists, which is what lets the server accept them.
      items: current.items.map((item) =>
        item.id === focusListId && !isFocusList(item) ? { ...item, listMode: "focus", updatedAt: timestamp } : item,
      ),
      // A stale reference row with the same id (removed, then re-added) is replaced.
      listEntries: [...current.listEntries.filter((entry) => !referenceIds.has(entry.id)), ...references],
    }));
    markLocalChangePending();
    return references.length;
  }, [activeUserId, canEditListRecord, markLocalChangePending, setData]);

  const positionListEntry = useCallback<TroveContextValue["positionListEntry"]>((entryId, position) => {
    const entry = dataRef.current.listEntries.find((candidate) => candidate.id === entryId);
    if (!entry || !canEditListRecord(entry.listId) || !isValidPosition(position)) return false;
    if (entry.position === position) return true;
    const timestamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      listEntries: current.listEntries.map((candidate) =>
        candidate.id === entryId ? { ...candidate, position, updatedAt: timestamp } : candidate,
      ),
    }));
    markLocalChangePending();
    return true;
  }, [canEditListRecord, markLocalChangePending, setData]);

  const removeFromFocusList = useCallback<TroveContextValue["removeFromFocusList"]>((focusListId, entryId) => {
    const reference = dataRef.current.listEntries.find(
      (entry) => entry.listId === focusListId && (entry.id === entryId || entry.refEntryId === entryId) && !!entry.refEntryId,
    );
    if (!reference || !canEditListRecord(focusListId)) return false;
    setData((current) => ({ ...current, listEntries: current.listEntries.filter((entry) => entry.id !== reference.id) }));
    markLocalChangePending();
    return true;
  }, [canEditListRecord, markLocalChangePending, setData]);

  const clearFocusList = useCallback<TroveContextValue["clearFocusList"]>((focusListId, which) => {
    const { items, listEntries } = dataRef.current;
    if (!isFocusList(items.find((item) => item.id === focusListId)) || !canEditListRecord(focusListId)) return 0;

    const byId = new Map(listEntries.map((entry) => [entry.id, entry]));
    const isDone = (entry: ListEntry): boolean =>
      entry.refEntryId ? !!byId.get(entry.refEntryId)?.checked : entry.checked;
    const removeIds = new Set(
      listEntries
        .filter((entry) => entry.listId === focusListId)
        // References to lines this device can't see are left alone.
        .filter((entry) => !entry.refEntryId || byId.has(entry.refEntryId))
        .filter((entry) => which === "all" || isDone(entry))
        .map((entry) => entry.id),
    );
    if (removeIds.size === 0) return 0;
    setData((current) => ({ ...current, listEntries: current.listEntries.filter((entry) => !removeIds.has(entry.id)) }));
    markLocalChangePending();
    return removeIds.size;
  }, [canEditListRecord, markLocalChangePending, setData]);

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
      return { ok: false, error: "You do not have permission to delete this list." };
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
      setData((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
      listEntries: current.listEntries.filter((entry) => entry.listId !== itemId),
    }));
      markLocalChangePending();
      return { ok: true };
    }

    if (itemToDelete) {
      const mediaResult = await deleteStoredMediaForItems([itemToDelete]);
      if (!mediaResult.ok) return mediaResult;
    }

    setData((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
      listEntries: current.listEntries.filter((entry) => entry.listId !== itemId),
    }));
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
      const baselineBefore = await loadSyncBaseline(userId);
      // Until this device's own lists are on the server, its copy of them
      // wins (see the first pull after loading).
      const seenBefore = (await isOwnDataUploaded(userId)) ? null : baselineBefore;
      const dataBefore = dataRef.current;
      if (options?.force) {
        await clearStoredRemoteUpdatedAt(userId);
      }

      const result = await pullTroveDataForUser(supabase, userId);

      // Something changed here while the pull was under way, or changes made
      // here haven't gone up yet: the server's copy doesn't have them, so
      // putting it in place would lose them. Keep this device's copy, forget
      // the pull so the next one brings the same things, and pull again once
      // the changes are up.
      const changesNotOnServer =
        dataRef.current !== dataBefore || pendingRemotePushRef.current || hasUnsentChanges(syncSnapshotRef.current);
      if ((result.kind === "applied" || result.kind === "no_row") && changesNotOnServer) {
        await saveSyncBaseline(userId, baselineBefore);
        await clearStoredRemoteUpdatedAt(userId);
        refreshAfterPushRef.current = true;
        return { ok: true };
      }

      if (result.kind === "applied") {
        // A merge is sent back up; the server's own copy needs no push.
        skipNextRemotePushRef.current = !seenBefore;
        skipRemotePushRef.current = false;
        setData(seenBefore ? (current) => mergeForFirstUpload(current, result.data, userId, seenBefore) : result.data);
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
          const survivingItems = current.items.filter((item) => !item.ownerId || item.ownerId === userId);
          const survivingItemIds = new Set(survivingItems.map((item) => item.id));
          return {
            folders: current.folders.filter((folder) => !folder.ownerId || folder.ownerId === userId),
            items: survivingItems,
            listEntries: current.listEntries.filter((entry) => survivingItemIds.has(entry.listId)),
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

  // For pulls nobody asked for: a change on the server, or coming back to the
  // app. While this device is still sending its own changes up, every step of
  // that push looks like a change on the server, and a pull between steps
  // would put back the server's copy from before them: a list or line just
  // added would vanish until the next pull. So it waits until they're up.
  const refreshWhenIdle = useCallback(() => {
    if (pendingRemotePushRef.current || hasPendingSync(syncSnapshotRef.current)) {
      refreshAfterPushRef.current = true;
      return;
    }
    refreshAfterPushRef.current = false;
    void refreshFromRemote({ force: true });
  }, [refreshFromRemote]);
  refreshWhenIdleRef.current = refreshWhenIdle;

  const syncToRemote = useCallback<TroveContextValue["syncToRemote"]>(async () => {
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
    const result = await pushTroveDataForUser(supabase, userId, dataRef.current);
    pendingRemotePushRef.current = false;

    return applyPushResult(result, "Unable to sync this folder before sharing.");
  }, [activeUserId, applyPushResult, setAndPersistSyncSnapshot]);

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
  }, [activeUserId, applyPushResult, setAndPersistSyncSnapshot]);

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
        listEntries: { ...baseline.listEntries },
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
      refreshWhenIdle();
    });

    return () => subscription.remove();
  }, [activeUserId, isAuthReady, isReady, refreshWhenIdle]);

  useEffect(() => {
    if (!isReady || !isAuthReady || !activeUserId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const subscription = subscribeTroveRealtimeForUser(supabase, activeUserId, refreshWhenIdle);

    return () => subscription.unsubscribe();
  }, [activeUserId, isAuthReady, isReady, refreshWhenIdle]);

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

  // Pins Today and This week once per account on this device, making them
  // if they don't exist yet.
  useEffect(() => {
    const userKey = activeUserId ?? "anonymous";
    if (!isReady || !isAuthReady || initialPullSettledFor !== userKey) return;
    if (pinnedDefaultsKeyRef.current === userKey) return;
    pinnedDefaultsKeyRef.current = userKey;

    void (async () => {
      if (await isPinnedDefaultsDone(userKey)) return;
      if (pinnedDefaultsKeyRef.current !== userKey) return;
      const plan = planPinnedDefaults(dataRef.current.items, canEditItem);
      plan.pin.forEach((listId) => updateItem(listId, { pinned: true }));
      for (const [index, list] of plan.create.entries()) {
        // A moment apart, so the last one made sorts first.
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 5));
        if (pinnedDefaultsKeyRef.current !== userKey) return;
        createItem({
          folderId: "",
          title: list.title,
          type: "list",
          tagOptionIds: [],
          listMode: "focus",
          focusRule: list.focusRule,
          pinned: true,
        });
      }
      await markPinnedDefaultsDone(userKey);
    })();
  }, [activeUserId, canEditItem, createItem, initialPullSettledFor, isAuthReady, isReady, updateItem]);

  const resetToSeed = useCallback(() => {
    setData(seedData);
    seedDefaultTagGroups(createTagGroup, createTagOption);
  }, [createTagGroup, createTagOption]);
  const clearLocalData = useCallback(() => setData(emptyData), []);


  // --- Recently deleted, Archive, copies -------------------------------------
  const trashItem = useCallback<TroveContextValue["trashItem"]>((itemId) => {
    const item = dataRef.current.items.find((candidate) => candidate.id === itemId);
    const folder = dataRef.current.folders.find((candidate) => candidate.id === item?.folderId);
    if (!item || !canEditItemRecord(item, folder)) {
      return { ok: false, error: "You do not have permission to delete this list." };
    }
    updateItem(itemId, { deletedAt: new Date().toISOString(), deletedWithFolderId: undefined });
    return { ok: true };
  }, [updateItem]);

  const restoreItem = useCallback<TroveContextValue["restoreItem"]>((itemId) => {
    const { items, folders } = dataRef.current;
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    // Its folder may have been deleted since, or still be in Recently deleted.
    const folderInUse = sortByLifecycle(items, folders).folders.some((folder) => folder.id === item.folderId);
    updateItem(itemId, {
      deletedAt: undefined,
      deletedWithFolderId: undefined,
      ...(item.folderId && !folderInUse ? { folderId: "" } : {}),
    });
    return true;
  }, [updateItem]);

  const trashFolder = useCallback<TroveContextValue["trashFolder"]>(async (folderId) => {
    const { items, folders } = dataRef.current;
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (!canManageFolderRecord(folder)) {
      return { ok: false, error: "Only the folder owner can delete this folder." };
    }
    const treeIds = new Set(getFolderTreeIds(folders, folderId));
    const lists = items.filter((item) => treeIds.has(item.folderId) && !item.deletedAt);
    // Nothing to keep: an empty folder goes straight away.
    if (lists.length === 0) return deleteFolder(folderId);
    const deletedAt = new Date().toISOString();
    lists.forEach((list) => updateItem(list.id, { deletedAt, deletedWithFolderId: folderId }));
    return { ok: true };
  }, [deleteFolder, updateItem]);

  const restoreFolder = useCallback<TroveContextValue["restoreFolder"]>((folderId) => {
    const { items, folders } = dataRef.current;
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (!folder) return false;
    items
      .filter((item) => item.deletedAt && item.deletedWithFolderId === folderId)
      .forEach((item) => updateItem(item.id, { deletedAt: undefined, deletedWithFolderId: undefined }));
    // The folder it sat in may be gone or deleted: it comes back on Home.
    const parentInUse =
      !folder.parentFolderId ||
      sortByLifecycle(
        items.filter((item) => item.deletedWithFolderId !== folderId),
        folders,
      ).folders.some((candidate) => candidate.id === folder.parentFolderId);
    if (!parentInUse) updateFolder(folderId, { parentFolderId: null });
    return true;
  }, [updateFolder, updateItem]);

  const setItemArchived = useCallback<TroveContextValue["setItemArchived"]>((itemId, archived) => {
    const item = dataRef.current.items.find((candidate) => candidate.id === itemId);
    const folder = dataRef.current.folders.find((candidate) => candidate.id === item?.folderId);
    if (!item || !canEditItemRecord(item, folder)) return false;
    if (archived) {
      updateItem(itemId, { archivedAt: new Date().toISOString(), archivedWithFolderId: undefined, pinned: false });
      return true;
    }
    const { items, folders } = dataRef.current;
    // Taken out of an archived folder, it goes to Home; the folder stays archived.
    const folderInUse = sortByLifecycle(items, folders).folders.some((candidate) => candidate.id === item.folderId);
    updateItem(itemId, {
      archivedAt: undefined,
      archivedWithFolderId: undefined,
      ...(item.folderId && !folderInUse ? { folderId: "" } : {}),
    });
    return true;
  }, [updateItem]);

  const setFolderArchived = useCallback<TroveContextValue["setFolderArchived"]>((folderId, archived) => {
    const { items, folders } = dataRef.current;
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (!folder || !canManageFolderRecord(folder)) return false;
    if (!archived) {
      const treeIds = new Set(getFolderTreeIds(folders, folderId));
      items
        .filter((item) => item.archivedWithFolderId === folderId || (treeIds.has(item.folderId) && item.archivedAt))
        .forEach((item) => updateItem(item.id, { archivedAt: undefined, archivedWithFolderId: undefined }));
      return true;
    }
    const treeIds = new Set(getFolderTreeIds(folders, folderId));
    const lists = items.filter((item) => treeIds.has(item.folderId) && !item.deletedAt && !item.isTemplate);
    if (lists.length === 0) return false;
    const archivedAt = new Date().toISOString();
    lists.forEach((list) => updateItem(list.id, { archivedAt, archivedWithFolderId: folderId, pinned: false }));
    return true;
  }, [updateItem]);

  const copyItem = useCallback<TroveContextValue["copyItem"]>((itemId, options = {}) => {
    const { items, folders, listEntries } = dataRef.current;
    const source = items.find((candidate) => candidate.id === itemId);
    if (!source) return null;
    // A copy sits beside its list, or on Home when it is a template, comes
    // from one, or sits in a folder this person can't add to.
    const canAddTo = (id: string) => canEditFolderContentRecord(folders.find((candidate) => candidate.id === id));
    const beside = options.template || source.isTemplate || !canAddTo(source.folderId) ? "" : source.folderId;
    const folderId = options.folderId ?? beside;
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (folderId && !canEditFolderContentRecord(folder)) {
      Alert.alert("Cannot add list", "You do not have permission to add lists to that folder.");
      return null;
    }
    const timestamp = new Date().toISOString();
    const fresh = options.fresh ?? false;
    const template = options.template ?? false;
    const title =
      options.title?.trim() ||
      copyTitle(
        source.title,
        items.filter((item) => !!item.isTemplate === template).map((item) => item.title),
      );
    const copy: SavedItem = {
      id: createId("item"),
      folderId,
      title,
      type: "list",
      tagOptionIds: [...source.tagOptionIds],
      // A copy keeps how the list adds lines by itself, but not its pin.
      ...(source.listMode ? { listMode: source.listMode } : {}),
      ...(source.focusRule ? { focusRule: source.focusRule } : {}),
      ...(source.ruleTagId ? { ruleTagId: source.ruleTagId } : {}),
      ...(template ? { isTemplate: true } : {}),
      ownerId: folder?.ownerId ?? activeUserId ?? undefined,
      createdBy: activeUserId ?? undefined,
      accessRole: folder?.accessRole ?? (activeUserId ? "owner" : undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const lines = copyEntriesForList(
      listEntries.filter((entry) => entry.listId === source.id),
      {
        listId: copy.id,
        fresh,
        timestamp,
        ownerId: copy.ownerId,
        userId: activeUserId ?? undefined,
        createId: () => createId("entry"),
      },
    );
    setData((current) => ({
      ...current,
      items: [copy, ...current.items],
      listEntries: [...current.listEntries, ...lines],
    }));
    markLocalChangePending();
    return copy;
  }, [activeUserId, markLocalChangePending, setData]);

  const createItemWithLines = useCallback<TroveContextValue["createItemWithLines"]>((title, lines) => {
    const timestamp = new Date().toISOString();
    const list: SavedItem = {
      id: createId("item"),
      folderId: "",
      title: title.trim() || UNTITLED_LIST_TITLE,
      type: "list",
      tagOptionIds: [],
      ownerId: activeUserId ?? undefined,
      createdBy: activeUserId ?? undefined,
      accessRole: activeUserId ? "owner" : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const positions = generatePositionsBetween(null, null, lines.length);
    const entries = lines.map<ListEntry>((line, index) => ({
      id: createId("entry"),
      listId: list.id,
      kind: line.kind ?? "check",
      text: line.text,
      checked: false,
      indentLevel: Math.min(line.indentLevel ?? 0, MAX_ENTRY_INDENT),
      ...(line.bold ? { bold: true } : {}),
      position: positions[index],
      tagOptionIds: [],
      ownerId: list.ownerId,
      createdBy: activeUserId ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    setData((current) => ({
      ...current,
      items: [list, ...current.items],
      listEntries: [...current.listEntries, ...entries],
    }));
    markLocalChangePending();
    return list;
  }, [activeUserId, markLocalChangePending, setData]);

  const getExportData = useCallback<TroveContextValue["getExportData"]>(() => {
    const current = dataRef.current;
    const lifecycle = sortByLifecycle(current.items, current.folders);
    const goneListIds = new Set(lifecycle.deleted.map((item) => item.id));
    const goneFolderIds = new Set(
      lifecycle.deletedFolders.flatMap(({ folder }) => getFolderTreeIds(current.folders, folder.id)),
    );
    return {
      ...current,
      folders: current.folders.filter((folder) => !goneFolderIds.has(folder.id)),
      items: current.items.filter((item) => !goneListIds.has(item.id)),
      listEntries: current.listEntries.filter((entry) => !goneListIds.has(entry.listId)),
    };
  }, []);

  // What has waited its 30 days in Recently deleted goes for good. Only the
  // owner's device does this, so a shared list isn't removed from under them.
  const purgedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!isReady) return;
    const { deleted, deletedFolders } = sortByLifecycle(data.items, data.folders);
    const mine = (ownerId?: string) => !ownerId || !activeUserId || ownerId === activeUserId;
    const once = (id: string): boolean => {
      if (purgedRef.current.has(id)) return false;
      purgedRef.current.add(id);
      return true;
    };
    const goneWithFolder = new Set<string>();
    deletedFolders.forEach(({ folder, at }) => {
      if (!isPastKeeping(at) || !mine(folder.ownerId)) return;
      goneWithFolder.add(folder.id);
      if (once(folder.id)) void deleteFolder(folder.id);
    });
    deleted.forEach((item) => {
      if (!item.deletedAt || !isPastKeeping(item.deletedAt) || !mine(item.ownerId)) return;
      if (item.deletedWithFolderId && goneWithFolder.has(item.deletedWithFolderId)) return;
      if (once(item.id)) void deleteItem(item.id);
    });
  }, [activeUserId, data.folders, data.items, deleteFolder, deleteItem, isReady]);

  // Screens read list lines as `item.listItems`; they are derived from the
  // entry records here rather than stored on the item.
  // Screens get the lists and folders in everyday use; what is deleted,
  // archived or a template is handed over separately. Lines of deleted lists
  // are out of sight everywhere but on those lists themselves.
  const { lifecycle, visibleEntries } = useMemo(() => {
    const raw = sortByLifecycle(data.items, data.folders);
    const deletedIds = new Set(raw.deleted.map((item) => item.id));
    const visible =
      deletedIds.size === 0 ? data.listEntries : data.listEntries.filter((entry) => !deletedIds.has(entry.listId));
    const sorted = sortByLifecycle(hydrateItemsWithEntries(data.items, visible), data.folders);
    return {
      lifecycle:
        deletedIds.size === 0 ? sorted : { ...sorted, deleted: hydrateItemsWithEntries(raw.deleted, data.listEntries) },
      visibleEntries: visible,
    };
  }, [data.folders, data.items, data.listEntries]);

  const value = useMemo<TroveContextValue>(
    () => ({
      ...data,
      items: lifecycle.active,
      folders: lifecycle.folders,
      listEntries: visibleEntries,
      archivedItems: lifecycle.archived,
      deletedItems: lifecycle.deleted,
      templates: lifecycle.templates,
      archivedFolders: lifecycle.archivedFolders,
      deletedFolders: lifecycle.deletedFolders,
      trashItem,
      restoreItem,
      trashFolder,
      restoreFolder,
      setItemArchived,
      setFolderArchived,
      copyItem,
      createItemWithLines,
      getExportData,
      isReady,
      syncSnapshot,
      createFolder,
      updateFolder,
      deleteFolder,
      createItem,
      updateItem,
      deleteItem,
      updateListEntry,
      setEntriesChecked,
      createListEntry,
      insertListEntries,
      relocateListEntries,
      restoreListEntries,
      moveListEntry,
      deleteListEntry,
      addToFocusList,
      positionListEntry,
      removeFromFocusList,
      clearFocusList,
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
      lifecycle,
      visibleEntries,
      trashItem,
      restoreItem,
      trashFolder,
      restoreFolder,
      setItemArchived,
      setFolderArchived,
      copyItem,
      createItemWithLines,
      getExportData,
      isReady,
      syncSnapshot,
      createFolder,
      updateFolder,
      deleteFolder,
      createItem,
      updateItem,
      deleteItem,
      updateListEntry,
      setEntriesChecked,
      createListEntry,
      insertListEntries,
      relocateListEntries,
      restoreListEntries,
      moveListEntry,
      deleteListEntry,
      addToFocusList,
      positionListEntry,
      removeFromFocusList,
      clearFocusList,
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
