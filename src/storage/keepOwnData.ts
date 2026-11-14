import type { TroveData } from "../types/models";

// What a pull from the server leaves on the device of someone whose own
// folders and lists don't sync, because syncing them is part of Pro. The
// server never gets their changes, so its copy of their own things is out of
// date: those stay as they are on the device. Only what other people shared
// with them comes from the server.
export const keepOwnDataFromDevice = (device: TroveData, server: TroveData, userId: string): TroveData => {
  const isOwn = (record: { ownerId?: string }) => !record.ownerId || record.ownerId === userId;
  const withShared = <T extends { id: string; ownerId?: string }>(own: T[], fromServer: T[]): T[] => {
    const ownIds = new Set(own.map((record) => record.id));
    return [...own, ...fromServer.filter((record) => !isOwn(record) && !ownIds.has(record.id))];
  };

  const folders = withShared(device.folders.filter(isOwn), server.folders);
  const items = withShared(device.items.filter(isOwn), server.items);
  const tagGroups = withShared(device.tagGroups.filter(isOwn), server.tagGroups);

  // Lines and tags go with the list or group they belong to.
  const ownItemIds = new Set(items.filter(isOwn).map((item) => item.id));
  const sharedItemIds = new Set(items.filter((item) => !isOwn(item)).map((item) => item.id));
  const ownGroupIds = new Set(tagGroups.filter(isOwn).map((group) => group.id));
  const sharedGroupIds = new Set(tagGroups.filter((group) => !isOwn(group)).map((group) => group.id));

  return {
    folders,
    items,
    listEntries: [
      ...device.listEntries.filter((entry) => ownItemIds.has(entry.listId)),
      ...server.listEntries.filter((entry) => sharedItemIds.has(entry.listId)),
    ],
    tagGroups,
    tagOptions: [
      ...device.tagOptions.filter((option) => ownGroupIds.has(option.groupId)),
      ...server.tagOptions.filter((option) => sharedGroupIds.has(option.groupId)),
    ],
  };
};
