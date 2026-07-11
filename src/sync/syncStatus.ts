import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SyncConflictSummary } from "./syncBaseline";

export type SyncStatus = "synced" | "queued" | "saving" | "retrying" | "failed" | "conflicted";

export type SyncSnapshot = {
  conflict?: SyncConflictSummary;
  lastError?: string;
  lastSyncedAt?: string;
  pendingSince?: string;
  retryCount: number;
  status: SyncStatus;
};

const defaultSnapshot: SyncSnapshot = {
  retryCount: 0,
  status: "synced",
};

const syncSnapshotKey = (userId: string) => `trove:syncSnapshot:${userId}`;

export const displayTextForSyncSnapshot = (snapshot: SyncSnapshot): string => {
  switch (snapshot.status) {
    case "synced":
      return "Saved";
    case "queued":
      return "Pending sync";
    case "saving":
      return "Saving";
    case "retrying":
      return "Retrying sync";
    case "failed":
      return "Sync failed";
    case "conflicted":
      return "Sync conflict";
  }
};

export const loadSyncSnapshot = async (userId: string): Promise<SyncSnapshot> => {
  try {
    const stored = await AsyncStorage.getItem(syncSnapshotKey(userId));
    if (!stored) return defaultSnapshot;

    const parsed = JSON.parse(stored) as Partial<SyncSnapshot>;
    return {
      conflict: parsed.conflict,
      lastError: parsed.lastError,
      lastSyncedAt: parsed.lastSyncedAt,
      pendingSince: parsed.pendingSince,
      retryCount: parsed.retryCount ?? 0,
      status: parsed.status ?? "synced",
    };
  } catch (error) {
    console.warn("Failed to load sync status", error);
    return defaultSnapshot;
  }
};

export const saveSyncSnapshot = async (
  userId: string,
  snapshot: SyncSnapshot,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(syncSnapshotKey(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Failed to save sync status", error);
  }
};

export const clearSyncSnapshot = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(syncSnapshotKey(userId));
  } catch (error) {
    console.warn("Failed to clear sync status", error);
  }
};

export const queuedSyncSnapshot = (current: SyncSnapshot): SyncSnapshot => ({
  ...current,
  conflict: undefined,
  lastError: undefined,
  pendingSince: current.pendingSince ?? new Date().toISOString(),
  status: current.status === "failed" || current.status === "conflicted" ? "retrying" : "queued",
});

export const savingSyncSnapshot = (current: SyncSnapshot): SyncSnapshot => ({
  ...current,
  conflict: undefined,
  lastError: undefined,
  status: current.retryCount > 0 ? "retrying" : "saving",
});

export const failedSyncSnapshot = (
  current: SyncSnapshot,
  error: string,
): SyncSnapshot => ({
  ...current,
  conflict: undefined,
  lastError: error,
  pendingSince: current.pendingSince ?? new Date().toISOString(),
  retryCount: current.retryCount + 1,
  status: "failed",
});

export const conflictedSyncSnapshot = (
  current: SyncSnapshot,
  conflict: SyncConflictSummary,
): SyncSnapshot => ({
  ...current,
  conflict,
  lastError: "This item changed somewhere else. Refresh before syncing again.",
  pendingSince: current.pendingSince ?? new Date().toISOString(),
  status: "conflicted",
});

export const syncedSyncSnapshot = (): SyncSnapshot => ({
  lastSyncedAt: new Date().toISOString(),
  retryCount: 0,
  status: "synced",
});
