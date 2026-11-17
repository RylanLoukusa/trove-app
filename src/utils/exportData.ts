import type { Folder, ListEntry, SavedItem, TagGroup, TagOption, TroveData } from "../types/models";
import { getFolderPathLabel } from "./folderTree";
import { listDisplayTitle, resolveEntries, sortEntries } from "./listEntries";

type TextLine = Pick<ListEntry, "kind" | "text" | "checked" | "indentLevel"> & Partial<Pick<ListEntry, "dueDate" | "notes">>;

// One line as plain text that also reads as Markdown: "- [x] Milk".
const lineToText = (line: TextLine): string => {
  const indent = "  ".repeat(Math.max(0, line.indentLevel ?? 0));
  const mark = line.kind === "check" ? (line.checked ? "- [x] " : "- [ ] ") : line.kind === "bullet" ? "- " : "";
  const due = line.dueDate ? ` (due ${line.dueDate})` : "";
  const notes = line.notes?.trim() ? `\n${indent}  ${line.notes.trim().replace(/\n/g, `\n${indent}  `)}` : "";
  return `${indent}${mark}${line.text}${due}${notes}`;
};

// A list as text to send or paste anywhere: its title, then its lines.
export const listToText = (title: string, lines: TextLine[]): string =>
  [title, ...lines.filter((line) => line.text.trim()).map(lineToText)].join("\n");

const linesOf = (list: SavedItem, entries: ListEntry[], entriesById: Map<string, ListEntry>): ListEntry[] =>
  resolveEntries(sortEntries(entries.filter((entry) => entry.listId === list.id)), entriesById);

// Everything as one readable text file: each list under its folder.
export const troveToText = (data: Pick<TroveData, "folders" | "items" | "listEntries">): string => {
  const entriesById = new Map(data.listEntries.map((entry) => [entry.id, entry]));
  const lists = data.items
    .filter((item) => item.type === "list" && !item.deletedAt)
    .map((list) => ({ list, folder: list.folderId ? getFolderPathLabel(data.folders, list.folderId) : "" }))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.list.title.localeCompare(b.list.title));
  const sections: string[] = [];
  let folder: string | null = null;
  lists.forEach((row) => {
    if (row.folder !== folder) {
      folder = row.folder;
      sections.push(`# ${folder || "Trove"}`);
    }
    const lines = linesOf(row.list, data.listEntries, entriesById);
    const marks = [row.list.isTemplate ? "template" : "", row.list.archivedAt ? "archived" : ""].filter(Boolean);
    const title = `## ${listDisplayTitle(row.list, lines)}${marks.length ? ` (${marks.join(", ")})` : ""}`;
    sections.push(listToText(title, lines));
  });
  return `${sections.join("\n\n")}\n`;
};

export const BACKUP_FORMAT = "trove-backup";
export const BACKUP_VERSION = 1;

export type TroveBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  folders: Folder[];
  lists: SavedItem[];
  lines: ListEntry[];
  tagGroups: TagGroup[];
  tags: TagOption[];
};

// A complete copy of the person's data, for safekeeping. Access details that
// only make sense on this account (who owns what) are kept as they are.
export const buildBackup = (data: TroveData, now: Date = new Date()): TroveBackup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  folders: data.folders,
  lists: data.items.map((item) => {
    const { listItems: _listItems, ...rest } = item;
    return rest;
  }),
  lines: data.listEntries,
  tagGroups: data.tagGroups,
  tags: data.tagOptions,
});

export const exportFileName = (extension: "json" | "md", now: Date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `trove-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`;
};
