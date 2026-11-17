import type { SavedItem, SavedListItem } from "../types/models";
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
      version: 1,
      updatedAt: now.toISOString(),
      source: "pinned",
      lists: [
        {
          id: "Groceries",
          title: "Groceries",
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

  it("ignores the time when telling whether anything changed", () => {
    const lists = [list("A", "2026-11-16T00:00:00.000Z", { listItems: [line("x")] })];
    expect(widgetSnapshotKey(buildWidgetSnapshot(lists, [], now))).toBe(
      widgetSnapshotKey(buildWidgetSnapshot(lists, [], new Date("2026-11-18T00:00:00.000Z"))),
    );
  });
});
