import { Folder, ItemPriority, ItemStatus, ItemType, SavedItem, TroveData } from "../types/models";

export type ItemChoiceOption = { label: string; detail: string; tone: string };

export const itemStatuses: ItemStatus[] = ["waiting", "planned", "done", "skipped"];
export const itemPriorities: ItemPriority[] = ["low", "medium", "high"];

export const statusChoices: Record<ItemStatus, ItemChoiceOption> = {
  waiting: { label: "Waiting", detail: "Saved for later", tone: "#DFAE73" },
  planned: { label: "Planned", detail: "Chosen and queued up", tone: "#6F8FAF" },
  done: { label: "Done", detail: "Finished or visited", tone: "#6E8F72" },
  skipped: { label: "Skipped", detail: "Not for now", tone: "#B85B53" },
};

export const priorityChoices: Record<ItemPriority, ItemChoiceOption> = {
  low: { label: "Low", detail: "Nice to have", tone: "#8AA8A1" },
  medium: { label: "Medium", detail: "Worth keeping in rotation", tone: "#DFAE73" },
  high: { label: "High", detail: "Top of the list", tone: "#B85B53" },
};

// The trailing U+FE0E forces text (not emoji) presentation for the square glyph on iOS,
// so it renders as a plain colored character instead of a fixed-size black emoji.
const BULLET_GLYPHS = ["●", "○", "▪︎"];

export const bulletGlyphForIndent = (indentLevel = 0): string => BULLET_GLYPHS[indentLevel % BULLET_GLYPHS.length];

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

export const normalizeTroveData = (data: TroveData): TroveData => ({
  ...data,
  folders: data.folders.map(normalizeFolder),
  items: data.items.map(normalizeSavedItem),
});
