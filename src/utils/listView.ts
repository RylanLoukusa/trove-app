import type { ListEntry, TagGroup, TagOption } from "../types/models";
import { comparePositions } from "./listEntries";

export type ListSortMode = "manual" | "due" | "priority" | "alpha" | "newest";
export type CompletedMode = "inline" | "bottom" | "hide";

export type ListViewSettings = {
  sortMode: ListSortMode;
  completedMode: CompletedMode;
};

export const defaultListViewSettings: ListViewSettings = {
  sortMode: "manual",
  completedMode: "bottom",
};

export const listSortLabels: Record<ListSortMode, string> = {
  manual: "My order",
  due: "Due date",
  priority: "Priority",
  alpha: "A to Z",
  newest: "Newest",
};

export const completedModeLabels: Record<CompletedMode, string> = {
  inline: "Keep in place",
  bottom: "Move to bottom",
  hide: "Hide",
};

// ---------------------------------------------------------------------------
// Priority (the existing "Priority" tag group)
// ---------------------------------------------------------------------------

export const findPriorityGroup = (tagGroups: TagGroup[]): TagGroup | undefined =>
  tagGroups.find((group) => group.name.trim().toLowerCase() === "priority" && group.selectionMode === "single") ??
  tagGroups.find((group) => group.name.trim().toLowerCase() === "priority");

export const priorityOptionsFor = (tagGroups: TagGroup[], tagOptions: TagOption[]): TagOption[] => {
  const group = findPriorityGroup(tagGroups);
  if (!group) return [];
  return tagOptions.filter((option) => option.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);
};

export const entryPriority = (entry: Pick<ListEntry, "tagOptionIds">, priorityOptions: TagOption[]): TagOption | undefined =>
  priorityOptions.find((option) => entry.tagOptionIds.includes(option.id));

// Replaces whatever priority the entry has with `optionId` (or clears it).
export const withPriority = (tagOptionIds: string[], priorityOptions: TagOption[], optionId: string | null): string[] => {
  const priorityIds = new Set(priorityOptions.map((option) => option.id));
  const rest = tagOptionIds.filter((id) => !priorityIds.has(id));
  return optionId ? [...rest, optionId] : rest;
};

// ---------------------------------------------------------------------------
// Dates (entries store a plain YYYY-MM-DD in the user's local calendar)
// ---------------------------------------------------------------------------

const pad = (value: number): string => String(value).padStart(2, "0");

export const toDateKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseDateKey = (key: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDateKey(date) === key.trim() ? date : null;
};

const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const daysBetween = (from: Date, to: Date): number =>
  Math.round((new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
    new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 86_400_000);

export type QuickDueDate = { key: "today" | "tomorrow" | "weekend" | "nextWeek"; label: string; value: string };

// "This weekend" is the coming Saturday (today, if it is already the weekend);
// "Next week" is the coming Monday.
export const quickDueDates = (today: Date = new Date()): QuickDueDate[] => {
  const weekday = today.getDay();
  const saturday = weekday === 6 || weekday === 0 ? today : addDays(today, 6 - weekday);
  const monday = addDays(today, ((8 - weekday) % 7) || 7);
  return [
    { key: "today", label: "Today", value: toDateKey(today) },
    { key: "tomorrow", label: "Tomorrow", value: toDateKey(addDays(today, 1)) },
    { key: "weekend", label: "This weekend", value: toDateKey(saturday) },
    { key: "nextWeek", label: "Next week", value: toDateKey(monday) },
  ];
};

export type DueTone = "overdue" | "today" | "soon" | "later";

export const describeDueDate = (dueDate: string, today: Date = new Date()): { label: string; tone: DueTone } | null => {
  const date = parseDateKey(dueDate);
  if (!date) return null;
  const days = daysBetween(today, date);
  const shortDate = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (days < 0) return { label: `Overdue · ${shortDate}`, tone: "overdue" };
  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days < 7) return { label: date.toLocaleDateString(undefined, { weekday: "long" }), tone: "soon" };
  return { label: shortDate, tone: "later" };
};

// ---------------------------------------------------------------------------
// Ordering for display
// ---------------------------------------------------------------------------

const byPosition = (a: ListEntry, b: ListEntry): number => comparePositions(a.position, b.position) || comparePositions(a.id, b.id);

// Sorting only changes what is shown; positions (the manual order) are left
// alone. Entries without the sorted-on value go last, in manual order.
export const orderEntriesForView = (
  entries: ListEntry[],
  settings: ListViewSettings,
  priorityOptions: TagOption[] = [],
): ListEntry[] => {
  const priorityRank = new Map(priorityOptions.map((option) => [option.id, option.sortOrder]));
  const rankOf = (entry: ListEntry): number | undefined => {
    const ranks = entry.tagOptionIds.map((id) => priorityRank.get(id)).filter((rank): rank is number => rank !== undefined);
    return ranks.length ? Math.max(...ranks) : undefined;
  };

  const compare = (a: ListEntry, b: ListEntry): number => {
    switch (settings.sortMode) {
      case "due": {
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
        return byPosition(a, b);
      }
      case "priority": {
        const rankA = rankOf(a);
        const rankB = rankOf(b);
        if (rankA !== undefined && rankB !== undefined && rankA !== rankB) return rankB - rankA;
        if ((rankA === undefined) !== (rankB === undefined)) return rankA !== undefined ? -1 : 1;
        return byPosition(a, b);
      }
      case "alpha":
        return a.text.localeCompare(b.text, undefined, { sensitivity: "base" }) || byPosition(a, b);
      case "newest":
        return b.createdAt.localeCompare(a.createdAt) || byPosition(a, b);
      default:
        return byPosition(a, b);
    }
  };

  const sorted = [...entries].sort(compare);
  if (settings.completedMode === "inline") return sorted;
  const open = sorted.filter((entry) => !entry.checked);
  if (settings.completedMode === "hide") return open;
  return [...open, ...sorted.filter((entry) => entry.checked)];
};
