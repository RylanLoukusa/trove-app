import { Folder, SavedItem, TagOption } from "../types/models";
import { getFolderPathLabel } from "./folderTree";

const searchableText = (parts: Array<string | undefined>): string =>
  parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const searchFoldersAndItems = (
  query: string,
  folders: Folder[],
  items: SavedItem[],
  tagOptions: TagOption[] = [],
): { folders: Folder[]; items: SavedItem[] } => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { folders: [], items: [] };
  }

  const tagOptionsById = new Map(tagOptions.map((tagOption) => [tagOption.id, tagOption]));

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
        item.tagOptionIds
          .map((tagOptionId) => tagOptionsById.get(tagOptionId)?.name)
          .filter((name): name is string => !!name)
          .join(" "),
        item.listItems?.map((listItem) => listItem.text).join(" "),
      ]).includes(normalized),
    ),
  };
};
