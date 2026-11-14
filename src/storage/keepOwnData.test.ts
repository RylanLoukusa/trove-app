import { keepOwnDataFromDevice } from "./keepOwnData";
import type { Folder, ListEntry, SavedItem, TagGroup, TagOption, TroveData } from "../types/models";

const me = "me";
const friend = "friend";
const stamp = "2026-03-01T00:00:00.000Z";

const folder = (id: string, ownerId?: string): Folder => ({
  id,
  name: id,
  parentFolderId: null,
  ownerId,
  createdAt: stamp,
  updatedAt: stamp,
});
const list = (id: string, ownerId?: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title: id,
  type: "list",
  tagOptionIds: [],
  ownerId,
  createdAt: stamp,
  updatedAt: stamp,
  ...extra,
});
const line = (id: string, listId: string): ListEntry => ({
  id,
  listId,
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: "V",
  tagOptionIds: [],
  createdAt: stamp,
  updatedAt: stamp,
});
const group = (id: string, ownerId?: string): TagGroup => ({
  id,
  ownerId,
  name: id,
  selectionMode: "single",
  allowInlineCreate: false,
  isSystem: false,
  sortOrder: 0,
  createdAt: stamp,
  updatedAt: stamp,
});
const option = (id: string, groupId: string): TagOption => ({ id, groupId, name: id, sortOrder: 0, createdAt: stamp, updatedAt: stamp });
const data = (overrides: Partial<TroveData>): TroveData => ({
  folders: [],
  items: [],
  listEntries: [],
  tagGroups: [],
  tagOptions: [],
  ...overrides,
});

const ids = (records: Array<{ id: string }>) => records.map((record) => record.id);

describe("keepOwnDataFromDevice", () => {
  it("keeps the person's own lists and lines as they are on the device", () => {
    const device = data({
      items: [list("today", me, { pinned: true }), list("groceries", undefined)],
      listEntries: [line("milk", "groceries")],
    });
    const server = data({
      items: [list("groceries", me, { title: "Old name" }), list("deleted-here", me)],
      listEntries: [line("old-line", "groceries"), line("gone", "deleted-here")],
    });

    const result = keepOwnDataFromDevice(device, server, me);

    expect(ids(result.items)).toEqual(["today", "groceries"]);
    expect(result.items[0].pinned).toBe(true);
    expect(result.items[1].title).toBe("groceries");
    expect(ids(result.listEntries)).toEqual(["milk"]);
  });

  it("takes what was shared with them from the server, and drops what no longer is", () => {
    const device = data({
      folders: [folder("mine", me), folder("unshared", friend)],
      items: [list("party", friend, { title: "Old party" }), list("left", friend)],
      listEntries: [line("old-balloons", "party")],
    });
    const server = data({
      folders: [folder("mine", me), folder("family", friend)],
      items: [list("party", friend)],
      listEntries: [line("balloons", "party")],
    });

    const result = keepOwnDataFromDevice(device, server, me);

    expect(ids(result.folders)).toEqual(["mine", "family"]);
    expect(ids(result.items)).toEqual(["party"]);
    expect(result.items[0].title).toBe("party");
    expect(ids(result.listEntries)).toEqual(["balloons"]);
  });

  it("keeps tags with the group they belong to", () => {
    const device = data({
      tagGroups: [group("priority"), group("old-shared", friend)],
      tagOptions: [option("high", "priority"), option("stale", "old-shared")],
    });
    const server = data({
      tagGroups: [group("priority", me), group("shared", friend)],
      tagOptions: [option("server-high", "priority"), option("red", "shared")],
    });

    const result = keepOwnDataFromDevice(device, server, me);

    expect(ids(result.tagGroups)).toEqual(["priority", "shared"]);
    expect(ids(result.tagOptions)).toEqual(["high", "red"]);
  });
});
