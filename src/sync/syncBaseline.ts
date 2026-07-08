import AsyncStorage from "@react-native-async-storage/async-storage";

import type { WaitingListData } from "../types/models";

export type SyncBaseline = {
  folders: Record<string, string>;
  items: Record<string, string>;
};

export type SyncEntityKind = keyof SyncBaseline;

export type SyncConflictReason = "remote_changed" | "remote_deleted";

export type SyncConflictField = {
  field: string;
  localRawValue?: unknown;
  localValue: string;
  remoteRawValue?: unknown;
  remoteValue: string;
};

export type SyncConflictSummary = {
  entityId: string;
  entityKind: SyncEntityKind;
  fields?: SyncConflictField[];
  localLabel?: string;
  localUpdatedAt?: string;
  reason: SyncConflictReason;
  remoteLabel?: string;
  remoteUpdatedAt: string;
};

const emptyBaseline: SyncBaseline = {
  folders: {},
  items: {},
};

const syncBaselineKey = (userId: string) => `the-waiting-list:syncBaseline:${userId}`;

export const baselineFromWaitingList = (waitingList: WaitingListData): SyncBaseline => ({
  folders: Object.fromEntries(
    waitingList.folders.map((folder) => [folder.id, folder.updatedAt]),
  ),
  items: Object.fromEntries(
    waitingList.items.map((item) => [item.id, item.updatedAt]),
  ),
});

export const loadSyncBaseline = async (userId: string): Promise<SyncBaseline> => {
  try {
    const stored = await AsyncStorage.getItem(syncBaselineKey(userId));
    if (!stored) return emptyBaseline;

    const parsed = JSON.parse(stored) as Partial<SyncBaseline>;
    return {
      folders: parsed.folders ?? {},
      items: parsed.items ?? {},
    };
  } catch (error) {
    console.warn("Failed to load sync baseline", error);
    return emptyBaseline;
  }
};

export const saveSyncBaseline = async (
  userId: string,
  baseline: SyncBaseline,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(syncBaselineKey(userId), JSON.stringify(baseline));
  } catch (error) {
    console.warn("Failed to save sync baseline", error);
  }
};

export const clearSyncBaseline = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(syncBaselineKey(userId));
  } catch (error) {
    console.warn("Failed to clear sync baseline", error);
  }
};
