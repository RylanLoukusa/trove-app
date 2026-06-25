import { Folder, ItemType, SavedItem, WaitingListData } from "../types/models";

export const isMediaItemType = (type: ItemType): boolean => type === "media" || type === "image" || type === "video";

export const normalizeItemType = (type: ItemType): ItemType => (isMediaItemType(type) ? "media" : type);

export const getItemTypeLabel = (type: ItemType): string => {
  switch (normalizeItemType(type)) {
    case "text":
      return "Note";
    case "list":
      return "List";
    case "link":
      return "Link";
    case "media":
      return "Media";
    default:
      return "Item";
  }
};

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
  };
};

export const normalizeFolder = (folder: Folder): Folder => ({
  ...folder,
  parentFolderId: folder.parentFolderId || null,
});

export const normalizeWaitingListData = (data: WaitingListData): WaitingListData => ({
  ...data,
  folders: data.folders.map(normalizeFolder),
  items: data.items.map(normalizeSavedItem),
});
