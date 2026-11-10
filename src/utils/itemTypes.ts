import { Folder, ItemType, ListEntry, SavedItem, TroveData } from "../types/models";
import { migrateEmbeddedListItems } from "./listEntries";

export const isMediaItemType = (type: ItemType): boolean => type === "media" || type === "image" || type === "video";

export const normalizeItemType = (type: ItemType): ItemType => (isMediaItemType(type) ? "media" : type);

export const normalizeSavedItem = (item: SavedItem): SavedItem => {
  const mediaItems =
    item.mediaItems?.length || !item.media?.storagePath
      ? item.mediaItems
      : [
          {
            id: item.media.storagePath,
            storagePath: item.media.storagePath,
            mediaType: item.media.mediaType ?? "image",
            thumbnailPath: item.media.thumbnailPath,
          },
        ];

  return {
    ...item,
    mediaItems,
    type: normalizeItemType(item.type),
    tagOptionIds: item.tagOptionIds ?? [],
  };
};

export const normalizeFolder = (folder: Folder): Folder => ({
  ...folder,
  parentFolderId: folder.parentFolderId || null,
});

export const normalizeListEntry = (entry: ListEntry): ListEntry => {
  const { bold, ...rest } = entry;
  return {
    ...rest,
    kind: entry.kind === "bullet" || entry.kind === "text" ? entry.kind : "check",
    text: entry.text ?? "",
    checked: !!entry.checked,
    indentLevel: entry.indentLevel ?? 0,
    tagOptionIds: entry.tagOptionIds ?? [],
    ...(bold ? { bold: true } : {}),
  };
};

// Trove keeps lists only. It used to save notes, links and photos as well;
// any of those still in stored or synced data are dropped as it is read.
export const isListItem = (item: Pick<SavedItem, "type">): boolean => item.type === "list";

// Data stored before list entries existed has no `listEntries` and keeps list
// lines embedded on each item; those are migrated into entries here.
export const normalizeTroveData = (data: TroveData): TroveData => {
  const { items, listEntries } = migrateEmbeddedListItems(
    (data.items ?? []).map(normalizeSavedItem).filter(isListItem),
    (data.listEntries ?? []).map(normalizeListEntry),
  );
  const itemIds = new Set(items.map((item) => item.id));

  return {
    ...data,
    folders: (data.folders ?? []).map(normalizeFolder),
    items,
    listEntries: listEntries.filter((entry) => itemIds.has(entry.listId)),
    tagGroups: data.tagGroups ?? [],
    tagOptions: data.tagOptions ?? [],
  };
};
