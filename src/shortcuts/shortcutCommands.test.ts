import type { SavedItem } from "../types/models";
import {
  findListByName,
  isShortcutUrl,
  parseShortcutUrl,
  runShortcutCommand,
  SHORTCUT_INBOX_ID,
  shortcutLines,
  shortcutListIndex,
  ShortcutDeps,
} from "./shortcutCommands";

const list = (id: string, title: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title,
  type: "list",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

describe("links from Shortcuts", () => {
  it("reads adding and opening by list name", () => {
    expect(parseShortcutUrl("trove://add?text=Milk%0AEggs&list=Groceries")).toEqual({ action: "add", text: "Milk\nEggs", list: "Groceries" });
    expect(parseShortcutUrl("trove://add?text=Call+the+vet")).toEqual({ action: "add", text: "Call the vet" });
    expect(parseShortcutUrl("https://trovecollections.app/open?list=Packing")).toEqual({ action: "open", list: "Packing" });
  });

  it("leaves every other link to the app's screens", () => {
    expect(parseShortcutUrl("trove://item/abc")).toBeNull();
    expect(parseShortcutUrl("trove://add?list=Groceries")).toBeNull();
    expect(parseShortcutUrl("trove://open")).toBeNull();
    expect(parseShortcutUrl("https://example.com/add?text=x")).toBeNull();
    expect(isShortcutUrl("trove://folder/f1")).toBe(false);
  });

  it("splits the text into lines without their markers", () => {
    expect(shortcutLines("- Milk\n2. Eggs\n\n • Bread ")).toEqual(["Milk", "Eggs", "Bread"]);
  });
});

describe("finding a list by name", () => {
  const lists = [
    list("g", "Groceries"),
    list("gt", "Groceries for the trip", { pinned: true }),
    list("p", "Packing"),
    list("t", "Groceries", { isTemplate: true }),
  ];

  it("takes the same name first, then one that starts or contains it", () => {
    expect(findListByName(lists, "groceries")?.id).toBe("g");
    expect(findListByName(lists, "my groceries list")?.id).toBe("g");
    expect(findListByName(lists, "pack")?.id).toBe("p");
    expect(findListByName(lists, "trip")?.id).toBe("gt");
    expect(findListByName(lists, "chores")).toBeNull();
  });
});

describe("carrying out a command", () => {
  const deps = (items: SavedItem[]): ShortcutDeps & { createList: jest.Mock; addLines: jest.Mock } => ({
    items,
    canEditItem: (id) => id !== "ro",
    inboxTitle: "Inbox",
    createList: jest.fn((title: string) => list("new", title)),
    addLines: jest.fn((_id: string, lines: string[]) => lines.length),
  });

  it("adds to the list named", () => {
    const d = deps([list("g", "Groceries")]);
    expect(runShortcutCommand({ action: "add", text: "Milk\nEggs", list: "groceries" }, d)).toEqual({
      ok: true,
      listId: "g",
      added: 2,
      created: false,
    });
    expect(d.addLines).toHaveBeenCalledWith("g", ["Milk", "Eggs"]);
  });

  it("adds to the Inbox without a list, making it when there is none", () => {
    const d = deps([list("i", "Inbox", { folderId: "f1" })]);
    expect(runShortcutCommand({ action: "add", text: "Milk" }, d)).toMatchObject({ ok: true, listId: "new", created: true });
    expect(d.createList).toHaveBeenCalledWith("Inbox", ["Milk"]);
  });

  it("makes the list named when there is no such list, or only one that can't be changed", () => {
    const d = deps([list("ro", "Chores")]);
    expect(runShortcutCommand({ action: "add", text: "Dishes", list: "Chores" }, d)).toMatchObject({ ok: true, created: true });
    expect(d.createList).toHaveBeenCalledWith("Chores", ["Dishes"]);
  });

  it("opens a list by name, or says there is none", () => {
    const d = deps([list("p", "Packing")]);
    expect(runShortcutCommand({ action: "open", list: "packing" }, d)).toMatchObject({ ok: true, listId: "p" });
    expect(runShortcutCommand({ action: "open", list: "Chores" }, d)).toEqual({ ok: false, error: 'There\'s no list called "Chores".' });
  });

  it("adds to the list Siri picked, even when another has the same name", () => {
    const d = deps([list("a", "Groceries", { pinned: true }), list("b", "Groceries")]);
    expect(runShortcutCommand({ action: "add", text: "Milk", list: "Groceries", listId: "b" }, d)).toMatchObject({
      ok: true,
      listId: "b",
      created: false,
    });
    expect(d.createList).not.toHaveBeenCalled();
  });

  it("goes by name when the list Siri picked is gone, and to the Inbox when Siri picked it", () => {
    const d = deps([list("g", "Groceries"), list("i", "Inbox")]);
    expect(runShortcutCommand({ action: "add", text: "Milk", list: "Groceries", listId: "gone" }, d)).toMatchObject({ listId: "g" });
    expect(runShortcutCommand({ action: "add", text: "Milk", list: "Inbox", listId: SHORTCUT_INBOX_ID }, d)).toMatchObject({
      listId: "i",
      created: false,
    });
    expect(runShortcutCommand({ action: "open", list: "Whatever", listId: "g" }, d)).toMatchObject({ listId: "g" });
  });
});

describe("the lists Siri offers", () => {
  it("lists what can be added to, pinned first, with the Inbox when there's none yet", () => {
    const items = [
      list("old", "Old", { updatedAt: "2026-01-01T00:00:00.000Z" }),
      list("new", "New", { updatedAt: "2026-03-01T00:00:00.000Z" }),
      list("pin", "Pinned", { pinned: true }),
      list("ro", "Theirs"),
      list("tpl", "Template", { isTemplate: true }),
    ];
    expect(shortcutListIndex(items, (id) => id !== "ro", "Inbox")).toEqual([
      { id: "pin", title: "Pinned" },
      { id: "new", title: "New" },
      { id: "old", title: "Old" },
      { id: SHORTCUT_INBOX_ID, title: "Inbox" },
    ]);
    expect(shortcutListIndex([list("i", "Inbox")], () => true, "Inbox")).toEqual([{ id: "i", title: "Inbox" }]);
  });
});
