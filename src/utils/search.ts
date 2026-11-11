import type { Folder, SavedItem, SavedListItem } from "../types/models";
import { isUntitledList, listDisplayTitle } from "./listEntries";

export type LineMatch = { list: SavedItem; line: SavedListItem };

export type SearchResults = {
  folders: Folder[];
  lists: SavedItem[];
  lines: LineMatch[];
};

// Enough to scan; a longer tail means the search is too loose to be useful.
export const MAX_LINE_MATCHES = 60;

// Finds folders by name or purpose, lists by title, and single lines by their
// text. `lists` are read through useTrove(), so each carries its lines.
// `borrowedLineIds` are the lines a list only shows from another list: each
// of those is found once, on the list it belongs to.
export const searchTrove = (
  query: string,
  folders: Folder[],
  lists: SavedItem[],
  borrowedLineIds?: ReadonlySet<string>,
): SearchResults => {
  const needle = query.trim().toLowerCase();
  if (!needle) return { folders: [], lists: [], lines: [] };
  const matches = (value?: string): boolean => !!value && value.toLowerCase().includes(needle);

  const lines: LineMatch[] = [];
  for (const list of lists) {
    // An unnamed list is shown by its first line, so that line is already
    // found as the list itself.
    const titleLine = isUntitledList(list) ? (list.listItems ?? []).find((line) => line.text.trim()) : undefined;
    for (const line of list.listItems ?? []) {
      if (lines.length >= MAX_LINE_MATCHES) break;
      if (line === titleLine || borrowedLineIds?.has(line.id)) continue;
      if (matches(line.text)) lines.push({ list, line });
    }
  }

  return {
    folders: folders.filter((folder) => matches(folder.name) || matches(folder.purpose)),
    lists: lists.filter((list) => matches(listDisplayTitle(list, list.listItems))),
    lines,
  };
};

// Splits `text` around the first place `query` appears, for highlighting.
export const splitAtMatch = (text: string, query: string): { before: string; match: string; after: string } => {
  const needle = query.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return { before: text, match: "", after: "" };
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + needle.length),
    after: text.slice(index + needle.length),
  };
};
