import type { Folder, SavedItem, SavedListItem } from "../types/models";
import { listDisplayTitle } from "./listEntries";

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
export const searchTrove = (query: string, folders: Folder[], lists: SavedItem[]): SearchResults => {
  const needle = query.trim().toLowerCase();
  if (!needle) return { folders: [], lists: [], lines: [] };
  const matches = (value?: string): boolean => !!value && value.toLowerCase().includes(needle);

  const lines: LineMatch[] = [];
  for (const list of lists) {
    for (const line of list.listItems ?? []) {
      if (lines.length >= MAX_LINE_MATCHES) break;
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
