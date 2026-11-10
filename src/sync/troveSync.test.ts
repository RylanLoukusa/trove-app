import AsyncStorage from "@react-native-async-storage/async-storage";
import { pullTroveDataForUser, pushTroveDataForUser } from "./troveSync";
import { saveSyncBaseline } from "./syncBaseline";
import type { Folder, ListEntry, SavedItem, TroveData } from "../types/models";

// Mirrors the internal (unexported) key format from troveSync.ts's `remoteUpdatedAtKey`.
const remoteUpdatedAtKey = (userId: string) => `trove:remoteUpdatedAt:${userId}`;

type CannedResult = { data: unknown; error: unknown };

/**
 * Minimal fake for Supabase's chainable query builder. Every chain method
 * (select/eq/in/order/maybeSingle/upsert/delete) returns the same builder so
 * any combination of chained calls is supported, and the builder itself is a
 * thenable that resolves to the canned result for that table -- so `await`ing
 * it at any point in the chain (matching however troveSync.ts calls it)
 * resolves correctly.
 */
const makeQueryBuilder = (result: CannedResult) => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
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

const createFakeSupabase = (responses: Record<string, CannedResult>) =>
  ({
    from: (table: string) => makeQueryBuilder(responses[table] ?? { data: [], error: null }),
    rpc: jest.fn(),
  }) as any;

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

  const pushWith = async (local: TroveData, remoteEntries: unknown[], baselineEntries: Record<string, string>) => {
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
      trove_items: { data: [itemRow()], error: null },
      trove_list_entries: { data: remoteEntries, error: null },
    });
    supabase.rpc.mockResolvedValue({ error: null });
    const result = await pushTroveDataForUser(supabase, userId, local);
    const rpcCalls = supabase.rpc.mock.calls as Array<[string, Record<string, unknown>]>;
    return { result, rpcCalls, args: (name: string) => rpcCalls.find(([called]) => called === name)?.[1] };
  };

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
