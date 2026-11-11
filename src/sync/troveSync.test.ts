import AsyncStorage from "@react-native-async-storage/async-storage";
import { pullTroveDataForUser, pushTroveDataForUser } from "./troveSync";
import { saveSyncBaseline } from "./syncBaseline";
import type { Folder, ListEntry, SavedItem, TroveData } from "../types/models";

// Mirrors the internal (unexported) key format from troveSync.ts's `remoteUpdatedAtKey`.
const remoteUpdatedAtKey = (userId: string) => `trove:remoteUpdatedAt:${userId}`;

type CannedResult = { data: unknown; error: unknown };

/**
 * Minimal fake for Supabase's chainable query builder. Every chain method
 * (select/eq/neq/in/order/maybeSingle/upsert/delete) returns the same builder
 * so any combination of chained calls is supported, and the builder itself is
 * a thenable that resolves to the canned result for that table -- so
 * `await`ing it at any point in the chain (matching however troveSync.ts
 * calls it) resolves correctly. Filters are not applied: a query gets every
 * canned row for its table whatever it asked for.
 */
const makeQueryBuilder = (result: CannedResult) => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    order: () => builder,
    upsert: () => builder,
    delete: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: CannedResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
};

const createFakeSupabase = (responses: Record<string, CannedResult>) => {
  const removeStoredFiles = jest.fn(async (_paths: string[]): Promise<CannedResult> => ({ data: [], error: null }));
  const storageFrom = jest.fn((_bucket: string) => ({ remove: removeStoredFiles }));
  return {
    from: (table: string) => makeQueryBuilder(responses[table] ?? { data: [], error: null }),
    rpc: jest.fn(),
    storage: { from: storageFrom },
    removeStoredFiles,
  } as any;
};

const userId = "user-1";

const folderRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "folder-1",
  owner_id: userId,
  parent_folder_id: null,
  name: "Folder",
  icon: null,
  color: null,
  purpose: null,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

const emptyResponses = {
  trove_sync_state: { data: null, error: null },
  trove_folders: { data: [], error: null },
  trove_items: { data: [], error: null },
  trove_folder_shares: { data: [], error: null },
  trove_data: { data: null, error: null },
};

describe("pullTroveDataForUser", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns 'applied' with the pulled data when there's remote content and nothing stored locally yet", async () => {
    const supabase = createFakeSupabase({
      ...emptyResponses,
      trove_sync_state: { data: { updated_at: "2026-03-01T00:00:00.000Z", normalized_initialized: true }, error: null },
      trove_folders: { data: [folderRow()], error: null },
    });

    const result = await pullTroveDataForUser(supabase, userId);

    expect(result.kind).toBe("applied");
    if (result.kind === "applied") {
      expect(result.data.folders).toHaveLength(1);
      expect(result.data.folders[0].id).toBe("folder-1");
      expect(result.remoteUpdatedAt).toBe("2026-03-01T00:00:00.000Z");
    }
  });

  it("returns 'noop_up_to_date' when the stored remote timestamp is already current", async () => {
    await AsyncStorage.setItem(remoteUpdatedAtKey(userId), "2026-03-01T00:00:00.000Z");

    const supabase = createFakeSupabase({
      ...emptyResponses,
      trove_sync_state: { data: { updated_at: "2026-03-01T00:00:00.000Z", normalized_initialized: true }, error: null },
      trove_folders: { data: [folderRow()], error: null },
    });

    const result = await pullTroveDataForUser(supabase, userId);

    expect(result.kind).toBe("noop_up_to_date");
  });

  it("returns 'no_row' when there is no sync state, no rows, and no legacy row for this user", async () => {
    const supabase = createFakeSupabase(emptyResponses);

    const result = await pullTroveDataForUser(supabase, userId);

    expect(result.kind).toBe("no_row");
  });
});

const itemRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "list-1",
  owner_id: userId,
  created_by: userId,
  folder_id: "folder-1",
  title: "Wedding",
  description: null,
  type: "list",
  url: null,
  source_url: null,
  source_platform: null,
  shared_text: null,
  media_uri: null,
  thumbnail_uri: null,
  media: null,
  media_items: null,
  attachments: null,
  list_items: null,
  rich_text: null,
  connections: null,
  tags: [],
  notes: null,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

const entryRow = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  list_id: "list-1",
  owner_id: userId,
  created_by: userId,
  kind: "check",
  text: id,
  checked: false,
  indent_level: 0,
  position: "V",
  notes: null,
  due_date: null,
  completed_at: null,
  tags: [],
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

const folder: Folder = {
  id: "folder-1",
  name: "Folder",
  parentFolderId: null,
  ownerId: userId,
  accessRole: "owner",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};
const list: SavedItem = {
  id: "list-1",
  folderId: "folder-1",
  title: "Wedding",
  type: "list",
  tagOptionIds: [],
  ownerId: userId,
  accessRole: "owner",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};
const localEntry = (id: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "list-1",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: "V",
  tagOptionIds: [],
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

const pushWith = async (
  local: TroveData,
  remoteEntries: unknown[],
  baselineEntries: Record<string, string>,
  remote: { items?: unknown[]; failingRpcs?: string[] } = {},
) => {
  await saveSyncBaseline(userId, {
    folders: { "folder-1": folder.updatedAt },
    items: { "list-1": list.updatedAt },
    listEntries: baselineEntries,
    tagGroups: {},
    tagOptions: {},
  });
  const supabase = createFakeSupabase({
    ...emptyResponses,
    trove_sync_state: { data: { updated_at: "2026-03-02T00:00:00.000Z", normalized_initialized: true }, error: null },
    trove_folders: { data: [folderRow()], error: null },
    trove_items: { data: remote.items ?? [itemRow()], error: null },
    trove_list_entries: { data: remoteEntries, error: null },
  });
  supabase.rpc.mockImplementation(async (name: string) => ({
    error: remote.failingRpcs?.includes(name) ? { message: "Not right now" } : null,
  }));
  const result = await pushTroveDataForUser(supabase, userId, local);
  const rpcCalls = supabase.rpc.mock.calls as Array<[string, Record<string, unknown>]>;
  return {
    result,
    rpcCalls,
    supabase,
    args: (name: string) => rpcCalls.find(([called]) => called === name)?.[1],
    allArgs: (name: string) => rpcCalls.filter(([called]) => called === name).map(([, params]) => params),
  };
};

describe("list entries sync", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("pulls entries as their own records and migrates lists that only have the legacy snapshot", async () => {
    const supabase = createFakeSupabase({
      ...emptyResponses,
      trove_sync_state: { data: { updated_at: "2026-03-01T00:00:00.000Z", normalized_initialized: true }, error: null },
      trove_folders: { data: [folderRow()], error: null },
      trove_items: {
        data: [
          itemRow({ list_items: [{ id: "stale", kind: "check", text: "Ignored" }] }),
          itemRow({ id: "list-2", list_items: [{ id: "a", kind: "check", text: "From old app", checked: true }] }),
        ],
        error: null,
      },
      trove_list_entries: {
        data: [entryRow("e2", { position: "W", checked: true, due_date: "2026-12-01" }), entryRow("e1")],
        error: null,
      },
    });

    const result = await pullTroveDataForUser(supabase, userId);

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.data.items.every((item) => !("listItems" in item))).toBe(true);
    expect(result.data.listEntries.map((entry) => entry.id).sort()).toEqual(["e1", "e2", "list-2~a"]);
    expect(result.data.listEntries.find((entry) => entry.id === "e2")).toMatchObject({ checked: true, dueDate: "2026-12-01" });
    expect(result.data.listEntries.find((entry) => entry.id === "list-2~a")).toMatchObject({
      listId: "list-2",
      text: "From old app",
      position: "V000001V",
    });
  });

  it("pushes entries in one batch and keeps the item's list_items snapshot for older apps", async () => {
    const local: TroveData = {
      folders: [folder],
      items: [list],
      listEntries: [localEntry("e1"), localEntry("e2", { position: "W", checked: true, updatedAt: "2026-03-05T00:00:00.000Z" })],
      tagGroups: [],
      tagOptions: [],
    };

    const { result, args } = await pushWith(local, [entryRow("e1"), entryRow("e2", { position: "W" })], {
      e1: "2026-03-01T00:00:00.000Z",
      e2: "2026-03-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    const upsert = args("trove_upsert_list_entries_for_current_user")!;
    expect((upsert.target_entries as Array<{ id: string }>).map((entry) => entry.id)).toEqual(["e1", "e2"]);
    expect(args("trove_upsert_item_for_current_user")!.target_list_items).toEqual([
      { id: "e1", kind: "check", text: "e1", checked: false, indentLevel: 0 },
      { id: "e2", kind: "check", text: "e2", checked: true, indentLevel: 0 },
    ]);
    expect(args("trove_delete_missing_list_entries_for_current_user")).toMatchObject({
      local_list_ids: ["list-1"],
      local_entry_ids: ["e1", "e2"],
    });
  });

  it("pushes a focus list with its references after the lines they point at", async () => {
    const focus: SavedItem = { ...list, id: "today", title: "Today", listMode: "focus" };
    const reference = localEntry("today>e1", { listId: "today", text: "", refEntryId: "e1", position: "V" });
    const local: TroveData = {
      folders: [folder],
      items: [list, focus],
      listEntries: [reference, localEntry("e1", { text: "Book florist" })],
      tagGroups: [],
      tagOptions: [],
    };

    const { result, rpcCalls, args } = await pushWith(local, [entryRow("e1", { text: "Book florist" })], {
      e1: "2026-03-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    const upsert = args("trove_upsert_list_entries_for_current_user")!;
    const payload = upsert.target_entries as Array<{ id: string; ref_entry_id: string | null }>;
    expect(payload.map((entry) => entry.id)).toEqual(["e1", "today>e1"]);
    expect(payload[1].ref_entry_id).toBe("e1");
    const focusUpsert = rpcCalls.find(
      ([name, params]) => name === "trove_upsert_item_for_current_user" && params.target_item_id === "today",
    )?.[1];
    // A focus list without a rule sends "none" so a rule set elsewhere is cleared.
    expect(focusUpsert).toMatchObject({ target_list_mode: "focus", target_focus_rule: "none" });
    // Older apps and public links see the referenced line's text.
    expect(focusUpsert?.target_list_items).toEqual([
      { id: "today>e1", kind: "check", text: "Book florist", checked: false, indentLevel: 0 },
    ]);
    expect(args("trove_upsert_item_for_current_user")).toMatchObject({ target_list_mode: null, target_focus_rule: null });
  });

  it("pulls focus lists and their references", async () => {
    const supabase = createFakeSupabase({
      ...emptyResponses,
      trove_sync_state: { data: { updated_at: "2026-03-01T00:00:00.000Z", normalized_initialized: true }, error: null },
      trove_folders: { data: [folderRow()], error: null },
      trove_items: { data: [itemRow(), itemRow({ id: "today", title: "Today", list_mode: "focus", focus_rule: "due_week" })], error: null },
      trove_list_entries: {
        data: [entryRow("e1"), entryRow("today>e1", { list_id: "today", text: "", ref_entry_id: "e1" })],
        error: null,
      },
    });

    const result = await pullTroveDataForUser(supabase, userId);

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.data.items.find((item) => item.id === "today")).toMatchObject({ listMode: "focus", focusRule: "due_week" });
    expect(result.data.items.find((item) => item.id === "list-1")?.listMode).toBeUndefined();
    expect(result.data.listEntries.find((entry) => entry.id === "today>e1")?.refEntryId).toBe("e1");
  });

  it("treats a line someone else added as new, not a conflict, and makes the next pull fetch it", async () => {
    await AsyncStorage.setItem(remoteUpdatedAtKey(userId), "2026-03-01T00:00:00.000Z");
    const local: TroveData = {
      folders: [folder],
      items: [list],
      listEntries: [localEntry("e1", { checked: true, updatedAt: "2026-03-05T00:00:00.000Z" })],
      tagGroups: [],
      tagOptions: [],
    };

    const { result, args } = await pushWith(
      local,
      [entryRow("e1"), entryRow("partner", { updated_at: "2026-03-04T00:00:00.000Z" })],
      { e1: "2026-03-01T00:00:00.000Z" },
    );

    expect(result.ok).toBe(true);
    expect(result.conflict).toBeUndefined();
    expect(args("trove_delete_missing_list_entries_for_current_user")!.known_updated_at).not.toHaveProperty("partner");
    expect(await AsyncStorage.getItem(remoteUpdatedAtKey(userId))).toBeNull();
    const baseline = JSON.parse((await AsyncStorage.getItem(`trove:syncBaseline:${userId}`))!);
    expect(baseline.listEntries).not.toHaveProperty("partner");
  });

  it("reports a conflict when the same line changed on both devices", async () => {
    const local: TroveData = {
      folders: [folder],
      items: [list],
      listEntries: [localEntry("e1", { text: "Mine", updatedAt: "2026-03-05T00:00:00.000Z" })],
      tagGroups: [],
      tagOptions: [],
    };

    const { result, rpcCalls } = await pushWith(
      local,
      [entryRow("e1", { text: "Theirs", updated_at: "2026-03-04T00:00:00.000Z" })],
      { e1: "2026-03-01T00:00:00.000Z" },
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toMatchObject({ entityKind: "listEntries", entityId: "e1", reason: "remote_changed" });
    expect(result.conflict?.fields?.map((field) => field.field)).toEqual(["text"]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("does not re-upload a line someone else deleted that this device never changed", async () => {
    const local: TroveData = {
      folders: [folder],
      items: [list],
      listEntries: [localEntry("e1"), localEntry("gone", { position: "W" })],
      tagGroups: [],
      tagOptions: [],
    };

    const { result, args } = await pushWith(local, [entryRow("e1")], {
      e1: "2026-03-01T00:00:00.000Z",
      gone: "2026-03-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    const upsert = args("trove_upsert_list_entries_for_current_user")!;
    expect((upsert.target_entries as Array<{ id: string }>).map((entry) => entry.id)).toEqual(["e1"]);
    const baseline = JSON.parse((await AsyncStorage.getItem(`trove:syncBaseline:${userId}`))!);
    expect(baseline.listEntries.gone).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("plain and bold lines sync", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("reads plain and bold lines from the tags they travel in", async () => {
    const supabase = createFakeSupabase({
      ...emptyResponses,
      trove_sync_state: { data: { updated_at: "2026-03-01T00:00:00.000Z", normalized_initialized: true }, error: null },
      trove_folders: { data: [folderRow()], error: null },
      trove_items: { data: [itemRow()], error: null },
      trove_list_entries: {
        data: [
          entryRow("heading", { kind: "bullet", tags: ["fmt:text", "fmt:bold"], position: "V1" }),
          entryRow("bullet", { kind: "bullet", position: "V2" }),
          entryRow("task", { kind: "check", tags: ["fmt:bold"], position: "V3" }),
        ],
        error: null,
      },
    });

    const result = await pullTroveDataForUser(supabase, userId);

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    const byId = new Map(result.data.listEntries.map((entry) => [entry.id, entry]));
    expect(byId.get("heading")).toMatchObject({ kind: "text", bold: true, tagOptionIds: [] });
    expect(byId.get("bullet")).toMatchObject({ kind: "bullet", tagOptionIds: [] });
    expect(byId.get("bullet")?.bold).toBeUndefined();
    expect(byId.get("task")).toMatchObject({ kind: "check", bold: true, tagOptionIds: [] });
  });

  it("sends plain and bold lines in a form older versions and shared links can show", async () => {
    const local: TroveData = {
      folders: [folder],
      items: [list],
      listEntries: [
        localEntry("heading", { kind: "text", bold: true, text: "Produce", position: "V1" }),
        localEntry("bullet", { kind: "bullet", text: "Apples", indentLevel: 1, position: "V2" }),
        localEntry("task", { text: "Milk", checked: true, position: "V3" }),
      ],
      tagGroups: [],
      tagOptions: [],
    };

    const { result, args } = await pushWith(local, [], {});

    expect(result.ok).toBe(true);
    const payload = args("trove_upsert_list_entries_for_current_user")!.target_entries as Array<{
      id: string;
      kind: string;
      tags: string[];
    }>;
    expect(payload.map(({ id, kind, tags }) => ({ id, kind, tags }))).toEqual([
      { id: "heading", kind: "bullet", tags: ["fmt:text", "fmt:bold"] },
      { id: "bullet", kind: "bullet", tags: [] },
      { id: "task", kind: "check", tags: [] },
    ]);
    expect(args("trove_upsert_item_for_current_user")!.target_list_items).toEqual([
      { id: "heading", kind: "bullet", text: "Produce", checked: false, indentLevel: 0, plain: true, bold: true },
      { id: "bullet", kind: "bullet", text: "Apples", checked: false, indentLevel: 1 },
      { id: "task", kind: "check", text: "Milk", checked: true, indentLevel: 0 },
    ]);
  });
});

describe("notes, links and photos from before Trove kept only lists", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    // A delete that has to wait for the next sync is reported with a warning.
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    warn.mockRestore();
    await AsyncStorage.clear();
  });

  const note = itemRow({ id: "note-1", type: "text", title: "Old note" });
  const photo = itemRow({
    id: "photo-1",
    type: "media",
    title: "Old photo",
    media: { storagePath: "user-1/cover.jpg", thumbnailPath: "user-1/cover-thumb.jpg", mediaType: "image" },
    media_items: [
      { id: "m1", storagePath: "user-1/cover.jpg", mediaType: "image" },
      { id: "m2", storagePath: "user-1/clip.mp4", thumbnailPath: "user-1/clip-thumb.jpg", mediaType: "video" },
    ],
  });
  const someoneElsesLink = itemRow({ id: "their-link", type: "link", owner_id: "user-2", created_by: "user-2" });

  const pullWith = async (items: unknown[], prepare?: (supabase: any) => void) => {
    const supabase = createFakeSupabase({
      ...emptyResponses,
      trove_sync_state: { data: { updated_at: "2026-03-01T00:00:00.000Z", normalized_initialized: true }, error: null },
      trove_folders: { data: [folderRow()], error: null },
      trove_items: { data: items, error: null },
    });
    supabase.rpc.mockResolvedValue({ error: null });
    prepare?.(supabase);
    const result = await pullTroveDataForUser(supabase, userId);
    const deletedIds = (supabase.rpc.mock.calls as Array<[string, Record<string, unknown>]>)
      .filter(([name]) => name === "trove_delete_item_for_current_user")
      .map(([, params]) => params.target_item_id);
    return { result, supabase, deletedIds };
  };

  it("keeps only lists on this device and deletes this person's old items from the server", async () => {
    const { result, supabase, deletedIds } = await pullWith([itemRow(), note, photo, someoneElsesLink]);

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.data.items.map((item) => item.id)).toEqual(["list-1"]);
    expect(deletedIds).toEqual(["note-1", "photo-1"]);
    expect(supabase.storage.from).toHaveBeenCalledWith("media");
    expect(supabase.removeStoredFiles).toHaveBeenCalledTimes(1);
    expect([...supabase.removeStoredFiles.mock.calls[0][0]].sort()).toEqual([
      "user-1/clip-thumb.jpg",
      "user-1/clip.mp4",
      "user-1/cover-thumb.jpg",
      "user-1/cover.jpg",
    ]);
  });

  it("touches nothing on the server when there are only lists", async () => {
    const { result, supabase, deletedIds } = await pullWith([itemRow(), itemRow({ id: "list-2" })]);

    expect(result.kind).toBe("applied");
    expect(deletedIds).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("leaves a photo for the next sync when its stored files can't be removed yet", async () => {
    const { result, deletedIds } = await pullWith([itemRow(), note, photo], (supabase) => {
      supabase.removeStoredFiles.mockResolvedValue({ data: null, error: { message: "Storage is down" } });
    });

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(deletedIds).toEqual(["note-1"]);
    expect(result.data.items.map((item) => item.id)).toEqual(["list-1"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Could not remove 1 old Trove items"));
  });

  it("still finishes the pull when the server refuses a delete", async () => {
    const { result, deletedIds } = await pullWith([itemRow(), note], (supabase) => {
      supabase.rpc.mockRejectedValue(new Error("Network request failed"));
    });

    expect(deletedIds).toEqual(["note-1"]);
    expect(result.kind).toBe("applied");
  });

  const localLists: TroveData = { folders: [folder], items: [list], listEntries: [], tagGroups: [], tagOptions: [] };

  it("deletes old items on push and never hands a list to the delete", async () => {
    const { result, supabase, args, allArgs } = await pushWith(localLists, [], {}, { items: [itemRow(), note, photo] });

    expect(result.ok).toBe(true);
    expect(allArgs("trove_delete_item_for_current_user").map((params) => params.target_item_id)).toEqual([
      "note-1",
      "photo-1",
    ]);
    expect(supabase.removeStoredFiles).toHaveBeenCalledTimes(1);
    expect(args("trove_delete_missing_items_for_current_user")).toMatchObject({ local_item_ids: ["list-1"] });
  });

  it("does not push an old note or photo that is still in this device's storage", async () => {
    const staleLocal = {
      ...localLists,
      items: [list, { ...list, id: "note-1", type: "text", title: "Old note" } as SavedItem],
    };

    const { result, allArgs } = await pushWith(staleLocal, [], {}, { items: [itemRow()] });

    expect(result.ok).toBe(true);
    expect(allArgs("trove_upsert_item_for_current_user").map((params) => params.target_item_id)).toEqual(["list-1"]);
  });

  it("keeps an old item it could not delete out of the clean-up, so the next sync tries again", async () => {
    const { result, args } = await pushWith(localLists, [], {}, {
      items: [itemRow(), note],
      failingRpcs: ["trove_delete_item_for_current_user"],
    });

    expect(result.ok).toBe(true);
    expect(args("trove_delete_missing_items_for_current_user")).toMatchObject({ local_item_ids: ["list-1", "note-1"] });
  });
});
