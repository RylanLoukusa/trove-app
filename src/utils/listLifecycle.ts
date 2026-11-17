import type { Folder, ListEntry, SavedItem } from "../types/models";
import { getFolderTreeIds } from "./folderTree";

// A deleted list or folder waits this long in Recently deleted before it is
// deleted for good.
export const DELETED_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

export const daysUntilPurge = (deletedAt: string, now: Date = new Date()): number => {
  const deleted = Date.parse(deletedAt);
  if (Number.isNaN(deleted)) return DELETED_KEEP_DAYS;
  return Math.max(0, Math.ceil((deleted + DELETED_KEEP_DAYS * DAY_MS - now.getTime()) / DAY_MS));
};

export const isPastKeeping = (deletedAt: string, now: Date = new Date()): boolean => {
  const deleted = Date.parse(deletedAt);
  return !Number.isNaN(deleted) && now.getTime() - deleted >= DELETED_KEEP_DAYS * DAY_MS;
};

export const purgeLabel = (deletedAt: string, now: Date = new Date()): string => {
  const days = daysUntilPurge(deletedAt, now);
  return days <= 1 ? "Deleted for good tomorrow" : `${days} days left`;
};

// A folder that was deleted or archived as a whole, with when and how many
// lists went with it.
export type SetAsideFolder = { folder: Folder; at: string; listCount: number };

export type ListLifecycle<T extends SavedItem = SavedItem> = {
  // Lists in everyday use: on Home, in folders, in pickers and in Today.
  active: T[];
  archived: T[];
  deleted: T[];
  templates: T[];
  // Folders in everyday use (not deleted or archived, nor inside one that is).
  folders: Folder[];
  deletedFolders: SetAsideFolder[];
  archivedFolders: SetAsideFolder[];
};

// Sorts every list and folder into where it shows. A list is deleted or
// archived by its own mark, or by sitting in a folder that was deleted or
// archived as a whole (so a list another device added to that folder since
// goes with it). Deleted wins over archived, and a template is never on Home.
export const sortByLifecycle = <T extends SavedItem>(items: T[], folders: Folder[]): ListLifecycle<T> => {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const rootTimes = (kind: "deleted" | "archived"): Map<string, string> => {
    const times = new Map<string, string>();
    items.forEach((item) => {
      const at = kind === "deleted" ? item.deletedAt : item.deletedAt ? undefined : item.archivedAt;
      const rootId = kind === "deleted" ? item.deletedWithFolderId : item.archivedWithFolderId;
      if (!at || !rootId || !folderIds.has(rootId)) return;
      const known = times.get(rootId);
      if (!known || at > known) times.set(rootId, at);
    });
    return times;
  };
  const treeOwners = (roots: Map<string, string>): Map<string, string> => {
    const owners = new Map<string, string>();
    roots.forEach((_, rootId) => {
      getFolderTreeIds(folders, rootId).forEach((id) => {
        if (!owners.has(id)) owners.set(id, rootId);
      });
    });
    return owners;
  };

  const deletedRoots = rootTimes("deleted");
  const deletedTree = treeOwners(deletedRoots);
  const archivedRoots = rootTimes("archived");
  // A folder archived inside a deleted one is simply deleted.
  [...archivedRoots.keys()].forEach((rootId) => {
    if (deletedTree.has(rootId)) archivedRoots.delete(rootId);
  });
  const archivedTree = treeOwners(archivedRoots);

  const result: ListLifecycle<T> = {
    active: [],
    archived: [],
    deleted: [],
    templates: [],
    folders: folders.filter((folder) => !deletedTree.has(folder.id) && !archivedTree.has(folder.id)),
    deletedFolders: [],
    archivedFolders: [],
  };
  const counts = new Map<string, number>();
  const count = (rootId: string) => counts.set(rootId, (counts.get(rootId) ?? 0) + 1);

  items.forEach((item) => {
    const deletedRoot = deletedTree.get(item.folderId);
    const archivedRoot = archivedTree.get(item.folderId);
    if (item.deletedAt || deletedRoot) {
      // A list deleted by itself before its folder was keeps its own date.
      const withFolder = deletedRoot && (!item.deletedAt || item.deletedWithFolderId === deletedRoot);
      if (withFolder) count(deletedRoot);
      result.deleted.push(
        withFolder
          ? { ...item, deletedAt: deletedRoots.get(deletedRoot) ?? item.deletedAt, deletedWithFolderId: deletedRoot }
          : item,
      );
    } else if (item.isTemplate) {
      result.templates.push(item);
    } else if (item.archivedAt || archivedRoot) {
      if (archivedRoot) count(archivedRoot);
      result.archived.push(
        archivedRoot
          ? { ...item, archivedAt: item.archivedAt ?? archivedRoots.get(archivedRoot), archivedWithFolderId: archivedRoot }
          : item,
      );
    } else {
      result.active.push(item);
    }
  });

  const setAside = (roots: Map<string, string>): SetAsideFolder[] =>
    [...roots.entries()]
      .map(([rootId, at]) => ({ folder: folders.find((folder) => folder.id === rootId)!, at, listCount: counts.get(rootId) ?? 0 }))
      .sort((a, b) => b.at.localeCompare(a.at));
  result.deletedFolders = setAside(deletedRoots);
  result.archivedFolders = setAside(archivedRoots);
  return result;
};

// The lines a copy of a list starts with. A copy keeps its own lines only
// (lines shown from other lists stay behind), with new ids. A fresh copy,
// used for templates, also starts unchecked and without dates.
export const copyEntriesForList = (
  entries: ListEntry[],
  input: { listId: string; fresh: boolean; timestamp: string; ownerId?: string; userId?: string; createId: () => string },
): ListEntry[] =>
  entries
    .filter((entry) => !entry.refEntryId)
    .map((entry) => {
      const { completedAt, dueDate, ...rest } = entry;
      return {
        ...rest,
        id: input.createId(),
        listId: input.listId,
        checked: input.fresh ? false : entry.checked,
        tagOptionIds: [...entry.tagOptionIds],
        ...(entry.images?.length ? { images: entry.images.map((image) => ({ ...image })) } : {}),
        ...(!input.fresh && dueDate ? { dueDate } : {}),
        ...(!input.fresh && completedAt ? { completedAt } : {}),
        ownerId: input.ownerId,
        createdBy: input.userId,
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
      };
    });

// "Packing list" -> "Packing list copy" -> "Packing list copy 2".
export const copyTitle = (title: string, takenTitles: string[]): string => {
  const base = title.replace(/ copy( \d+)?$/, "");
  const taken = new Set(takenTitles.map((taken) => taken.trim().toLowerCase()));
  let candidate = `${base} copy`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${base} copy ${n}`;
  return candidate;
};
