import type { ListEntry, TagGroup, TagOption } from "../types/models";
import {
  defaultListViewSettings,
  describeDueDate,
  formatListDate,
  matchesFocusRule,
  orderEntriesForView,
  parseDateKey,
  priorityOptionsFor,
  quickDueDates,
  withPriority,
} from "./listView";

const low: TagOption = { id: "low", groupId: "priority", name: "Low", sortOrder: 0, createdAt: "", updatedAt: "" };
const medium: TagOption = { ...low, id: "medium", name: "Medium", sortOrder: 1 };
const high: TagOption = { ...low, id: "high", name: "High", sortOrder: 2 };
const priorityOptions = [low, medium, high];

const entry = (id: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "list-1",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: id,
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const ids = (entries: ListEntry[]) => entries.map((candidate) => candidate.id);

describe("orderEntriesForView", () => {
  const entries = [
    entry("a", { dueDate: "2026-12-05", tagOptionIds: ["low"], text: "Venue", createdAt: "2026-01-03T00:00:00.000Z" }),
    entry("b", { text: "cake", createdAt: "2026-01-05T00:00:00.000Z" }),
    entry("c", { dueDate: "2026-12-01", tagOptionIds: ["high"], text: "Florist", checked: true }),
    entry("d", { dueDate: "2026-12-01", tagOptionIds: ["medium", "other-tag"], text: "Band", createdAt: "2026-01-04T00:00:00.000Z" }),
  ];

  it("keeps manual order and can leave completed lines in place", () => {
    expect(ids(orderEntriesForView(entries, { sortMode: "manual", completedMode: "inline" }))).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves checked lines where they are unless the list says otherwise", () => {
    expect(defaultListViewSettings).toEqual({ sortMode: "manual", completedMode: "inline" });
    expect(ids(orderEntriesForView(entries, defaultListViewSettings))).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps headings and bullets in place when checked lines move down", () => {
    const outline = [
      entry("a", { kind: "text", text: "Produce" }),
      entry("b", { checked: true }),
      entry("c", { kind: "bullet" }),
      entry("d"),
    ];
    expect(ids(orderEntriesForView(outline, { sortMode: "manual", completedMode: "bottom" }))).toEqual(["a", "c", "d", "b"]);
    expect(ids(orderEntriesForView(outline, { sortMode: "manual", completedMode: "hide" }))).toEqual(["a", "c", "d"]);
  });

  it("moves completed lines to the bottom or hides them", () => {
    expect(ids(orderEntriesForView(entries, { sortMode: "manual", completedMode: "bottom" }))).toEqual(["a", "b", "d", "c"]);
    expect(ids(orderEntriesForView(entries, { sortMode: "manual", completedMode: "hide" }))).toEqual(["a", "b", "d"]);
  });

  it("sorts by due date with undated lines last and ties in manual order", () => {
    expect(ids(orderEntriesForView(entries, { sortMode: "due", completedMode: "inline" }))).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts by priority from high to low, unprioritized last", () => {
    expect(ids(orderEntriesForView(entries, { sortMode: "priority", completedMode: "inline" }, priorityOptions))).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("sorts A to Z ignoring case, and newest first", () => {
    expect(ids(orderEntriesForView(entries, { sortMode: "alpha", completedMode: "inline" }))).toEqual(["d", "b", "c", "a"]);
    expect(ids(orderEntriesForView(entries, { sortMode: "newest", completedMode: "inline" }))).toEqual(["b", "d", "a", "c"]);
  });
});

describe("priority helpers", () => {
  it("finds the Priority group's options in order", () => {
    const groups: TagGroup[] = [
      { id: "status", name: "Status", selectionMode: "single", allowInlineCreate: true, isSystem: true, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: "priority", name: "Priority", selectionMode: "single", allowInlineCreate: true, isSystem: true, sortOrder: 1, createdAt: "", updatedAt: "" },
    ];
    expect(ids(priorityOptionsFor(groups, [high, low, medium]) as never)).toEqual(["low", "medium", "high"]);
    expect(priorityOptionsFor([], [high])).toEqual([]);
  });

  it("replaces only the priority tag", () => {
    expect(withPriority(["tag-x", "low"], priorityOptions, "high")).toEqual(["tag-x", "high"]);
    expect(withPriority(["tag-x", "low"], priorityOptions, null)).toEqual(["tag-x"]);
  });
});

describe("due dates", () => {
  // Wednesday, Nov 11 2026 (local time).
  const wednesday = new Date(2026, 10, 11, 15, 30);

  it("offers today, tomorrow, the coming Saturday and next Monday", () => {
    expect(quickDueDates(wednesday).map((quick) => quick.value)).toEqual([
      "2026-11-11",
      "2026-11-12",
      "2026-11-14",
      "2026-11-16",
    ]);
  });

  it("treats the weekend itself as this weekend", () => {
    const sunday = new Date(2026, 10, 15, 9);
    expect(quickDueDates(sunday).find((quick) => quick.key === "weekend")?.value).toBe("2026-11-15");
    expect(quickDueDates(sunday).find((quick) => quick.key === "nextWeek")?.value).toBe("2026-11-16");
  });

  it("describes due dates relative to today", () => {
    expect(describeDueDate("2026-11-10", wednesday)?.tone).toBe("overdue");
    expect(describeDueDate("2026-11-11", wednesday)).toEqual({ label: "Today", tone: "today" });
    expect(describeDueDate("2026-11-12", wednesday)).toEqual({ label: "Tomorrow", tone: "soon" });
    expect(describeDueDate("2026-11-14", wednesday)?.tone).toBe("soon");
    expect(describeDueDate("2026-12-25", wednesday)?.tone).toBe("later");
    expect(describeDueDate("not a date", wednesday)).toBeNull();
  });

  it("only accepts real calendar dates", () => {
    expect(parseDateKey("2026-02-28")).not.toBeNull();
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-2-3")).toBeNull();
  });
});

describe("formatListDate", () => {
  // Wednesday, Nov 11 2026 (local time).
  const wednesday = new Date(2026, 10, 11, 15, 30);
  const at = (...parts: [number, number, number, number?, number?]) => new Date(...parts).toISOString();

  it("shows the time for a list changed today", () => {
    const changed = new Date(2026, 10, 11, 9, 5);
    expect(formatListDate(changed.toISOString(), wednesday)).toBe(
      changed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
    expect(formatListDate(changed.toISOString(), wednesday)).toMatch(/9:05/);
  });

  it("says Yesterday, even for a change late in the evening", () => {
    expect(formatListDate(at(2026, 10, 10, 23, 59), wednesday)).toBe("Yesterday");
    expect(formatListDate(at(2026, 10, 10, 0, 1), wednesday)).toBe("Yesterday");
  });

  it("names the weekday for the rest of the past week", () => {
    expect(formatListDate(at(2026, 10, 9, 12), wednesday)).toBe(
      new Date(2026, 10, 9).toLocaleDateString(undefined, { weekday: "long" }),
    );
    expect(formatListDate(at(2026, 10, 5, 12), wednesday)).toBe(
      new Date(2026, 10, 5).toLocaleDateString(undefined, { weekday: "long" }),
    );
  });

  it("shows the date for anything older, with the year once it is a different one", () => {
    expect(formatListDate(at(2026, 10, 4, 12), wednesday)).toBe(
      new Date(2026, 10, 4).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
    expect(formatListDate(at(2025, 11, 31, 12), wednesday)).toMatch(/2025/);
    expect(formatListDate(at(2026, 0, 2, 12), wednesday)).not.toMatch(/2026/);
  });

  it("treats a time a little ahead of this device's clock as now, and gives nothing for a bad date", () => {
    expect(formatListDate(at(2026, 10, 12, 8), wednesday)).toMatch(/8:00/);
    expect(formatListDate("not a date", wednesday)).toBe("");
  });
});

describe("matchesFocusRule", () => {
  // Wednesday, Nov 11 2026 (local time).
  const wednesday = new Date(2026, 10, 11, 15, 30);
  const due = (dueDate: string, overrides: Partial<ListEntry> = {}) => entry(dueDate, { dueDate, ...overrides });

  it("matches due today or overdue", () => {
    expect(matchesFocusRule(due("2026-11-10"), "due_today", [], wednesday)).toBe(true);
    expect(matchesFocusRule(due("2026-11-11"), "due_today", [], wednesday)).toBe(true);
    expect(matchesFocusRule(due("2026-11-12"), "due_today", [], wednesday)).toBe(false);
    expect(matchesFocusRule(entry("undated"), "due_today", [], wednesday)).toBe(false);
  });

  it("matches the next 7 days and this weekend", () => {
    expect(matchesFocusRule(due("2026-11-17"), "due_week", [], wednesday)).toBe(true);
    expect(matchesFocusRule(due("2026-11-18"), "due_week", [], wednesday)).toBe(false);
    expect(matchesFocusRule(due("2026-11-14"), "due_weekend", [], wednesday)).toBe(true);
    expect(matchesFocusRule(due("2026-11-15"), "due_weekend", [], wednesday)).toBe(true);
    expect(matchesFocusRule(due("2026-11-13"), "due_weekend", [], wednesday)).toBe(false);
    // On Sunday, "this weekend" is still the current one.
    expect(matchesFocusRule(due("2026-11-14"), "due_weekend", [], new Date(2026, 10, 15, 9))).toBe(true);
  });

  it("matches the highest priority", () => {
    expect(matchesFocusRule(entry("a", { tagOptionIds: ["high"] }), "high_priority", priorityOptions, wednesday)).toBe(true);
    expect(matchesFocusRule(entry("a", { tagOptionIds: ["medium"] }), "high_priority", priorityOptions, wednesday)).toBe(false);
    expect(matchesFocusRule(entry("a", { tagOptionIds: ["high"] }), "high_priority", [], wednesday)).toBe(false);
  });

  it("keeps done lines only on the day they were done", () => {
    const doneToday = due("2026-11-10", { checked: true, completedAt: new Date(2026, 10, 11, 9).toISOString() });
    const doneBefore = due("2026-11-10", { checked: true, completedAt: new Date(2026, 10, 10, 9).toISOString() });
    expect(matchesFocusRule(doneToday, "due_today", [], wednesday)).toBe(true);
    expect(matchesFocusRule(doneBefore, "due_today", [], wednesday)).toBe(false);
    expect(matchesFocusRule(due("2026-11-10", { kind: "bullet" }), "due_today", [], wednesday)).toBe(false);
  });
});
