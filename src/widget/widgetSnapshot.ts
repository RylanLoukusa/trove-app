import type { ListEntry, SavedItem } from "../types/models";
import { isSharedAccess } from "../utils/access";
import { listActivityTimes, listDisplayTitle, sortListsByActivity } from "../utils/listEntries";

// What the home screen widget shows, written for the widget to read while
// the app is closed. The widget shows the first list; the rest are there
// for bigger widgets later.
export const WIDGET_SNAPSHOT_VERSION = 1;
export const WIDGET_LIST_COUNT = 3;
export const WIDGET_LINE_COUNT = 12;

export type WidgetLine = { text: string; kind: "check" | "bullet" | "text"; indent: number };

export type WidgetList = {
  id: string;
  title: string;
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
  // "pinned": lists pinned to Home. "recent": nothing is pinned, so the
  // lists changed most recently.
  source: "pinned" | "recent" | "none";
  lists: WidgetList[];
};

export const widgetListUrl = (listId: string): string => `trove://item/${encodeURIComponent(listId)}`;

// `lists` are the active lists with their lines (as useTrove gives them).
export const buildWidgetSnapshot = (
  lists: SavedItem[],
  entries: ListEntry[],
  now: Date = new Date(),
): WidgetSnapshot => {
  const usable = lists.filter((list) => list.type === "list" && !list.isTemplate);
  const sorted = sortListsByActivity(usable, listActivityTimes(usable, entries));
  // Only the owner's pin counts, as on Home.
  const pinned = sorted.filter((list) => list.pinned && !isSharedAccess(list));
  const chosen = (pinned.length > 0 ? pinned : sorted).slice(0, WIDGET_LIST_COUNT);

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    updatedAt: now.toISOString(),
    source: chosen.length === 0 ? "none" : pinned.length > 0 ? "pinned" : "recent",
    lists: chosen.map((list) => {
      const lines = list.listItems ?? [];
      const checks = lines.filter((line) => line.kind === "check");
      const pending = lines.filter((line) => !line.checked && line.text.trim());
      return {
        id: list.id,
        title: listDisplayTitle(list, lines),
        open: checks.filter((line) => !line.checked).length,
        done: checks.filter((line) => line.checked).length,
        lines: pending
          .slice(0, WIDGET_LINE_COUNT)
          .map((line) => ({ text: line.text.trim(), kind: line.kind, indent: Math.min(line.indentLevel ?? 0, 3) })),
        pending: pending.length,
        url: widgetListUrl(list.id),
      };
    }),
  };
};

// The snapshot without its time, to tell whether the widget needs an update.
export const widgetSnapshotKey = (snapshot: WidgetSnapshot): string =>
  JSON.stringify({ ...snapshot, updatedAt: undefined });
