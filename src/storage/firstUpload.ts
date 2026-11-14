import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SyncBaseline } from "../sync/syncBaseline";
import type { TroveData } from "../types/models";

// Every account syncs its own lists now. One that used to keep them only on
// the device uploads them the first time it syncs, after this merge.
const uploadedKey = (userId: string) => `trove:ownDataUploaded:v1:${userId}`;

export const isOwnDataUploaded = async (userId: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(uploadedKey(userId))) === "true";
  } catch {
    return false;
  }
};

export const markOwnDataUploaded = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(uploadedKey(userId), "true");
  } catch (error) {
    console.warn("Failed to remember this account's lists were uploaded", error);
  }
};

// What the device keeps from a pull before its own lists have ever been
// uploaded. The device's own folders, lists, lines and tags win, since the
// server never had its changes. Something of theirs that is only on the server
// is added if this device never saw it there (another device made it), and
// left out if it did (this device deleted it). What others shared with them
// comes from the server.
export const mergeForFirstUpload = (
  device: TroveData,
  server: TroveData,
  userId: string,
  seenBefore: SyncBaseline,
): TroveData => {
  const isOwn = (record: { ownerId?: string }) => !record.ownerId || record.ownerId === userId;
  const merge = <T extends { id: string; ownerId?: string }>(
    onDevice: T[],
    onServer: T[],
    seen: Record<string, string>,
    // For lines and tags, which belong to whoever owns their list or group.
    ownedHere: (record: T) => boolean = isOwn,
  ): T[] => {
    const kept = onDevice.filter(ownedHere);
    const keptIds = new Set(kept.map((record) => record.id));
    const fromServer = onServer.filter((record) =>
      keptIds.has(record.id) ? false : ownedHere(record) ? !(record.id in seen) : true,
    );
    return [...kept, ...fromServer];
  };

  const folders = merge(device.folders, server.folders, seenBefore.folders);
  const items = merge(device.items, server.items, seenBefore.items);
  const tagGroups = merge(device.tagGroups, server.tagGroups, seenBefore.tagGroups);
  const ownListIds = new Set(items.filter(isOwn).map((item) => item.id));
  const sharedListIds = new Set(items.filter((item) => !isOwn(item)).map((item) => item.id));
  const ownGroupIds = new Set(tagGroups.filter(isOwn).map((group) => group.id));
  const sharedGroupIds = new Set(tagGroups.filter((group) => !isOwn(group)).map((group) => group.id));

  return {
    folders,
    items,
    listEntries: merge(device.listEntries, server.listEntries, seenBefore.listEntries, (entry) =>
      ownListIds.has(entry.listId),
    ).filter((entry) => ownListIds.has(entry.listId) || sharedListIds.has(entry.listId)),
    tagGroups,
    tagOptions: merge(device.tagOptions, server.tagOptions, seenBefore.tagOptions, (option) =>
      ownGroupIds.has(option.groupId),
    ).filter((option) => ownGroupIds.has(option.groupId) || sharedGroupIds.has(option.groupId)),
  };
};
