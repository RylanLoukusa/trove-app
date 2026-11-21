import type { FocusRule, ListEntry, SavedItem, SavedListItem, TagOption } from "../types/models";
import { isSharedAccess } from "../utils/access";
import {
  isFocusList,
  listActivityTimes,
  listDisplayTitle,
  resolveEntries,
  sortEntries,
  sortListsByActivity,
} from "../utils/listEntries";
import { matchesFocusRule, toDateKey } from "../utils/listView";

// What the home screen widget shows, written for the widget to read while
// the app is closed. Today comes first and This week second, as they hold
// what's due; then lists pinned to Home, or the ones changed most recently.
// The small widget shows the first list, the bigger ones the first two.
export const WIDGET_SNAPSHOT_VERSION = 2;
export const WIDGET_LIST_COUNT = 3;
export const WIDGET_LINE_COUNT = 12;

// `due`: the line's due date, so the widget can move lines into Today after
// midnight before the app has run again.
export type WidgetLine = { text: string; kind: "check" | "bullet" | "text"; indent: number; due?: string };

export type WidgetList = {
  id: string;
  title: string;
  // "today" and "week": the Today and This week lists.
  role: "today" | "week" | "list";
  // Lines still to do and lines done, counting check lines only.
  open: number;
  done: number;
  // Lines not checked off yet, in the list's order (the first few), and how
  // many there are in all.
  lines: WidgetLine[];
  pending: number;
  // Opens the list in the app.
  url: string;
};

export type WidgetSnapshot = {
  version: number;
  updatedAt: string;
  // The day it was made for: Today and This week change at midnight.
  day: string;
  // Light or dark, as chosen in Trove's settings, or "system" to follow the phone.
  appearance?: "light" | "dark" | "system";
  // False on the free plan: the large and Lock Screen widgets then ask for
  // Pro instead of showing lists. Missing (an older app) counts as true.
  pro?: boolean;
  // "pinned": lists pinned to Home. "recent": nothing is pinned, so the
  // lists changed most recently.
  source: "pinned" | "recent" | "none";
  lists: WidgetList[];
};

export const widgetListUrl = (listId: string): string => `trove://item/${encodeURIComponent(listId)}`;

const ROLE_RULES: Array<{ role: WidgetList["role"]; rule: FocusRule }> = [
  { role: "today", rule: "due_today" },
  { role: "week", rule: "due_week" },
];

type Line = Pick<SavedListItem, "text" | "kind" | "checked" | "indentLevel"> & { dueDate?: string };

// What a list with a rule shows, as on its page: its own lines, then the
// lines its rule pulls in from other lists, soonest due first.
const ruleListLines = (
  list: SavedItem,
  rule: FocusRule,
  entries: ListEntry[],
  itemsById: Map<string, SavedItem>,
  entriesById: Map<string, ListEntry>,
  priorityOptions: TagOption[],
  now: Date,
): Line[] => {
  const own = sortEntries(entries.filter((entry) => entry.listId === list.id));
  const resolved = own.some((entry) => entry.refEntryId) ? resolveEntries(own, entriesById) : own;
  const shown = new Set(own.map((entry) => entry.refEntryId).filter(Boolean));
  const pulled = sortEntries(
    entries.filter((entry) => {
      if (entry.refEntryId || shown.has(entry.id)) return false;
      const source = itemsById.get(entry.listId);
      return (
        !!source &&
        source.type === "list" &&
        !source.isTemplate &&
        !isFocusList(source) &&
        matchesFocusRule(entry, rule, priorityOptions, now)
      );
    }),
  ).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return [...resolved, ...pulled.map((entry) => ({ ...entry, indentLevel: 0 }))];
};

const widgetList = (list: SavedItem, role: WidgetList["role"], lines: Line[]): WidgetList => {
  const checks = lines.filter((line) => line.kind === "check");
  const pending = lines.filter((line) => !line.checked && line.text.trim());
  return {
    id: list.id,
    title: listDisplayTitle(list, lines),
    role,
    open: checks.filter((line) => !line.checked).length,
    done: checks.filter((line) => line.checked).length,
    lines: pending.slice(0, WIDGET_LINE_COUNT).map((line) => ({
      text: line.text.trim(),
      kind: line.kind,
      indent: Math.min(line.indentLevel ?? 0, 3),
      ...(line.dueDate ? { due: line.dueDate } : {}),
    })),
    pending: pending.length,
    url: widgetListUrl(list.id),
  };
};

// `lists` are the active lists with their lines (as useTrove gives them), and
// `entries` every line, for what Today and This week pull in.
export const buildWidgetSnapshot = (
  lists: SavedItem[],
  entries: ListEntry[],
  now: Date = new Date(),
  priorityOptions: TagOption[] = [],
  appearance: "light" | "dark" | "system" = "system",
  pro = true,
): WidgetSnapshot => {
  const usable = lists.filter((list) => list.type === "list" && !list.isTemplate);
  const sorted = sortListsByActivity(usable, listActivityTimes(usable, entries));
  // Only the person's own lists: one shared with them belongs to someone else.
  const own = sorted.filter((list) => !isSharedAccess(list));
  const itemsById = new Map(lists.map((list) => [list.id, list]));
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

  const chosen: WidgetList[] = [];
  ROLE_RULES.forEach(({ role, rule }) => {
    const list =
      own.find((candidate) => isFocusList(candidate) && candidate.focusRule === rule && candidate.pinned) ??
      own.find((candidate) => isFocusList(candidate) && candidate.focusRule === rule);
    if (list)
      chosen.push(
        widgetList(list, role, ruleListLines(list, rule, entries, itemsById, entriesById, priorityOptions, now)),
      );
  });
  // Only the owner's pin counts, as on Home.
  const pinned = own.filter((list) => list.pinned);
  const rest = (pinned.length > 0 ? pinned : sorted).filter((list) => !chosen.some((item) => item.id === list.id));
  rest.slice(0, Math.max(0, WIDGET_LIST_COUNT - chosen.length)).forEach((list) => {
    chosen.push(widgetList(list, "list", list.listItems ?? []));
  });

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    updatedAt: now.toISOString(),
    day: toDateKey(now),
    appearance,
    pro,
    source:
      chosen.length === 0
        ? "none"
        : chosen.some((item) => item.role !== "list") || pinned.length > 0
          ? "pinned"
          : "recent",
    lists: chosen,
  };
};

// The snapshot without its time, to tell whether the widget needs an update.
export const widgetSnapshotKey = (snapshot: WidgetSnapshot): string =>
  JSON.stringify({ ...snapshot, updatedAt: undefined });
