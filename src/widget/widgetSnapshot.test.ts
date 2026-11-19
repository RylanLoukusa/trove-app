import type { ListEntry, SavedItem, SavedListItem } from "../types/models";
import { buildWidgetSnapshot, widgetSnapshotKey, WIDGET_LINE_COUNT } from "./widgetSnapshot";

const line = (text: string, extra: Partial<SavedListItem> = {}): SavedListItem => ({
  id: text,
  kind: "check",
  text,
  checked: false,
  ...extra,
});
const list = (id: string, updatedAt: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title: id,
  type: "list",
  tagOptionIds: [],
  listItems: [],
  createdAt: updatedAt,
  updatedAt,
  ...extra,
});
const now = new Date("2026-11-17T12:00:00.000Z");

describe("buildWidgetSnapshot", () => {
  it("shows pinned lists, with the lines still to do and how many are done", () => {
    const snapshot = buildWidgetSnapshot(
      [
        list("Chores", "2026-11-16T00:00:00.000Z"),
        list("Groceries", "2026-11-10T00:00:00.000Z", {
          pinned: true,
          listItems: [
            line("Milk", { checked: true }),
            line("Bread"),
            line("Fruit", { kind: "bullet", indentLevel: 5 }),
            line("   "),
            line("Eggs"),
          ],
        }),
      ],
      [],
      now,
    );

    expect(snapshot).toEqual({
      version: 2,
      updatedAt: now.toISOString(),
      day: "2026-11-17",
      source: "pinned",
      lists: [
        {
          id: "Groceries",
          title: "Groceries",
          role: "list",
          open: 3,
          done: 1,
          lines: [
            { text: "Bread", kind: "check", indent: 0 },
            { text: "Fruit", kind: "bullet", indent: 3 },
            { text: "Eggs", kind: "check", indent: 0 },
          ],
          pending: 3,
          url: "trove://item/Groceries",
        },
      ],
    });
  });

  it("falls back to the lists changed most recently when nothing is pinned", () => {
    const snapshot = buildWidgetSnapshot(
      [
        list("Old", "2026-11-01T00:00:00.000Z"),
        list("New", "2026-11-16T00:00:00.000Z"),
        list("Template", "2026-11-17T00:00:00.000Z", { isTemplate: true }),
        list("Mid", "2026-11-10T00:00:00.000Z"),
        list("Older", "2026-10-01T00:00:00.000Z"),
      ],
      [],
      now,
    );

    expect(snapshot.source).toBe("recent");
    expect(snapshot.lists.map((item) => item.id)).toEqual(["New", "Mid", "Old"]);
  });

  it("doesn't count a pin on a list someone else shared", () => {
    const snapshot = buildWidgetSnapshot(
      [list("Theirs", "2026-11-16T00:00:00.000Z", { pinned: true, accessRole: "editor" })],
      [],
      now,
    );

    expect(snapshot.source).toBe("recent");
  });

  it("says there's nothing to show, and keeps long lists short", () => {
    expect(buildWidgetSnapshot([], [], now)).toMatchObject({ source: "none", lists: [] });

    const many = Array.from({ length: 30 }, (_, index) => line(`Line ${index}`));
    const snapshot = buildWidgetSnapshot([list("Big", "2026-11-16T00:00:00.000Z", { listItems: many })], [], now);
    expect(snapshot.lists[0].lines).toHaveLength(WIDGET_LINE_COUNT);
    expect(snapshot.lists[0].open).toBe(30);
    expect(snapshot.lists[0].pending).toBe(30);
  });

  it("ignores the time when telling whether anything changed, but not the day", () => {
    const lists = [list("A", "2026-11-16T00:00:00.000Z", { listItems: [line("x")] })];
    const morning = new Date(2026, 10, 17, 8);
    expect(widgetSnapshotKey(buildWidgetSnapshot(lists, [], morning))).toBe(
      widgetSnapshotKey(buildWidgetSnapshot(lists, [], new Date(2026, 10, 17, 21))),
    );
    expect(widgetSnapshotKey(buildWidgetSnapshot(lists, [], morning))).not.toBe(
      widgetSnapshotKey(buildWidgetSnapshot(lists, [], new Date(2026, 10, 18, 8))),
    );
  });

  it("puts Today first and This week second, with the lines they pull in from other lists", () => {
    const today = new Date(2026, 10, 17, 9);
    const entry = (id: string, listId: string, extra: Partial<ListEntry> = {}): ListEntry =>
      ({
        id,
        listId,
        kind: "check",
        text: id,
        checked: false,
        indentLevel: 0,
        position: id,
        tagOptionIds: [],
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        ...extra,
      }) as ListEntry;
    const snapshot = buildWidgetSnapshot(
      [
        list("Groceries", "2026-11-16T00:00:00.000Z", { pinned: true }),
        list("week", "2026-11-01T00:00:00.000Z", {
          title: "This week",
          listMode: "focus",
          focusRule: "due_week",
          pinned: true,
        }),
        list("today", "2026-11-01T00:00:00.000Z", {
          title: "Today",
          listMode: "focus",
          focusRule: "due_today",
          pinned: true,
        }),
        list("Chores", "2026-11-02T00:00:00.000Z"),
      ],
      [
        entry("Typed on Today", "today"),
        entry("Pay rent", "Chores", { dueDate: "2026-11-17" }),
        entry("Overdue", "Chores", { dueDate: "2026-11-10" }),
        entry("Friday", "Chores", { dueDate: "2026-11-20" }),
        entry("Next month", "Chores", { dueDate: "2026-12-20" }),
        entry("Done yesterday", "Chores", {
          dueDate: "2026-11-16",
          checked: true,
          completedAt: "2026-11-16T10:00:00.000Z",
        }),
      ],
      today,
    );

    expect(snapshot.lists.map((item) => [item.id, item.role])).toEqual([
      ["today", "today"],
      ["week", "week"],
      ["Groceries", "list"],
    ]);
    expect(snapshot.lists[0].lines.map((item) => item.text)).toEqual(["Typed on Today", "Overdue", "Pay rent"]);
    expect(snapshot.lists[0].lines[1]).toMatchObject({ due: "2026-11-10" });
    expect(snapshot.lists[1].lines.map((item) => item.text)).toEqual(["Overdue", "Pay rent", "Friday"]);
    expect(snapshot.source).toBe("pinned");
  });
});
