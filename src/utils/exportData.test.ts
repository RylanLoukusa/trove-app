import { buildBackup, exportFileName, listToText, troveToText } from "./exportData";
import type { ListEntry, SavedItem, TroveData } from "../types/models";

const STAMP = "2026-01-01T00:00:00.000Z";
const entry = (id: string, listId: string, text: string, position: string, extra: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId,
  kind: "check",
  text,
  checked: false,
  indentLevel: 0,
  position,
  tagOptionIds: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});
const list = (id: string, title: string, folderId = "", extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId,
  title,
  type: "list",
  tagOptionIds: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const data: TroveData = {
  folders: [{ id: "trips", name: "Trips", parentFolderId: null, createdAt: STAMP, updatedAt: STAMP }],
  items: [
    list("packing", "Packing", "trips", { archivedAt: STAMP }),
    list("groceries", "Groceries"),
    list("gone", "Gone", "", { deletedAt: STAMP }),
    list("today", "Today", "", { listMode: "focus" }),
  ],
  listEntries: [
    entry("g2", "groceries", "Bread", "a1", { indentLevel: 1, kind: "bullet" }),
    entry("g1", "groceries", "Milk", "a0", { checked: true, dueDate: "2026-02-01", notes: "Whole\nnot skimmed" }),
    entry("p1", "packing", "Documents", "a0", { kind: "text" }),
    entry("x1", "gone", "Secret", "a0"),
    entry("r1", "today", "", "a0", { refEntryId: "g2" }),
  ],
  tagGroups: [],
  tagOptions: [],
};

describe("listToText", () => {
  it("writes each kind of line so it also reads as Markdown", () => {
    expect(
      listToText("Groceries", [
        { kind: "text", text: "Produce", checked: false, indentLevel: 0 },
        { kind: "check", text: "Apples", checked: true, indentLevel: 1 },
        { kind: "check", text: "Pears", checked: false, indentLevel: 1, dueDate: "2026-03-04" },
        { kind: "bullet", text: "Ask about figs", checked: false, indentLevel: 2 },
        { kind: "check", text: "  ", checked: false, indentLevel: 0 },
      ]),
    ).toBe(["Groceries", "Produce", "  - [x] Apples", "  - [ ] Pears (due 2026-03-04)", "    - Ask about figs"].join("\n"));
  });
});

describe("troveToText", () => {
  it("writes every list under its folder, in order, without what was deleted", () => {
    expect(troveToText(data)).toBe(
      [
        "# Trove",
        "## Groceries\n- [x] Milk (due 2026-02-01)\n  Whole\n  not skimmed\n  - Bread",
        "## Today\n- Bread",
        "# Trips",
        "## Packing (archived)\nDocuments",
        "",
      ]
        .join("\n\n")
        .replace(/\n\n$/, "\n"),
    );
  });
});

describe("buildBackup", () => {
  it("keeps everything it is given, without the lines repeated on each list", () => {
    const backup = buildBackup({ ...data, items: data.items.map((item) => ({ ...item, listItems: [] })) }, new Date(STAMP));

    expect(backup).toMatchObject({ format: "trove-backup", version: 1, exportedAt: STAMP });
    expect(backup.lists).toHaveLength(4);
    expect(backup.lists.every((item) => !("listItems" in item))).toBe(true);
    expect(backup.lines).toEqual(data.listEntries);
    expect(backup.folders).toEqual(data.folders);
  });
});

describe("exportFileName", () => {
  it("is dated", () => {
    expect(exportFileName("json", new Date(2026, 2, 9))).toBe("trove-2026-03-09.json");
  });
});
