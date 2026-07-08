import type { Folder, SavedItem, WaitingListData } from "../types/models";
import type { SyncConflictSummary } from "./syncBaseline";

export type SyncFieldChoice = "local" | "remote";

export type SyncConflictResolution =
  | "keepLocal"
  | "useRemote"
  | { fieldChoices: Record<string, SyncFieldChoice>; kind: "merge" };

const applyRemoteFieldChoices = (
  value: Record<string, unknown>,
  conflict: SyncConflictSummary,
  fieldChoices: Record<string, SyncFieldChoice>,
): Record<string, unknown> => {
  const merged = { ...value };

  conflict.fields?.forEach((field) => {
    if (fieldChoices[field.field] === "remote") {
      merged[field.field] = field.remoteRawValue;
    }
  });

  return merged;
};

export const mergeConflictFields = (
  waitingList: WaitingListData,
  conflict: SyncConflictSummary,
  fieldChoices: Record<string, SyncFieldChoice>,
  updatedAt: string,
): WaitingListData => {
  if (!conflict.fields || conflict.fields.length === 0) {
    return waitingList;
  }

  if (conflict.entityKind === "folders") {
    return {
      ...waitingList,
      folders: waitingList.folders.map((folder) => {
        if (folder.id !== conflict.entityId) return folder;

        return {
          ...applyRemoteFieldChoices(folder as unknown as Record<string, unknown>, conflict, fieldChoices),
          updatedAt,
        } as Folder;
      }),
    };
  }

  return {
    ...waitingList,
    items: waitingList.items.map((item) => {
      if (item.id !== conflict.entityId) return item;

      return {
        ...applyRemoteFieldChoices(item as unknown as Record<string, unknown>, conflict, fieldChoices),
        updatedAt,
      } as SavedItem;
    }),
  };
};
