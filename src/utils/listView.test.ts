import type { ListEntry, TagGroup, TagOption } from "../types/models";
import {
  describeDueDate,
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
