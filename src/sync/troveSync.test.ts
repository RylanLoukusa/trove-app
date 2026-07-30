import AsyncStorage from "@react-native-async-storage/async-storage";
import { pullTroveDataForUser } from "./troveSync";

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
