import { Folder, SavedItem } from "../types/models";
import { getDescendantFolderIds, getFolderPathLabel } from "./folderTree";

export const filterWaitingItems = (items: SavedItem[], folders: Folder[], folderId?: string, highPriorityOnly = false): SavedItem[] => {
  const allowedFolders = folderId ? [folderId, ...getDescendantFolderIds(folders, folderId)] : undefined;
  return items.filter((item) => item.status === "waiting" && (!allowedFolders || allowedFolders.includes(item.folderId)) && (!highPriorityOnly || item.priority === "high"));
};

// Simple MVP picker: choose from waiting items, optionally scoped by folder, and optionally only high priority.
export const pickRandomWaitingItem = (items: SavedItem[], folders: Folder[], folderId?: string, highPriorityOnly = false): SavedItem | undefined => {
  const pool = filterWaitingItems(items, folders, folderId, highPriorityOnly);
  if (pool.length === 0) return undefined;
  return pool[Math.floor(Math.random() * pool.length)];
};

const searchableText = (parts: Array<string | undefined>): string =>
  parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const searchFoldersAndItems = (
  query: string,
  folders: Folder[],
  items: SavedItem[],
): { folders: Folder[]; items: SavedItem[] } => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { folders: [], items: [] };
  }

  return {
    folders: folders.filter((folder) =>
      searchableText([folder.name, folder.purpose, getFolderPathLabel(folders, folder.id)]).includes(normalized),
    ),
    items: items.filter((item) =>
      searchableText([
        item.title,
        item.description,
        getFolderPathLabel(folders, item.folderId),
        item.url,
        item.sourceUrl,
        item.sourcePlatform,
        item.sharedText,
        item.notes,
        item.richText,
        item.tags.join(" "),
        item.listItems?.map((listItem) => listItem.text).join(" "),
      ]).includes(normalized),
    ),
  };
};
