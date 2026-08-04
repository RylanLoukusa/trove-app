import AsyncStorage from "@react-native-async-storage/async-storage";
import { baselineFromTroveData, clearSyncBaseline, loadSyncBaseline, saveSyncBaseline } from "./syncBaseline";
import type { Folder, SavedItem, TroveData } from "../types/models";

const folder = (id: string, updatedAt: string): Folder => ({
  id,
  name: `Folder ${id}`,
  parentFolderId: null,
  createdAt: updatedAt,
  updatedAt,
});

const item = (id: string, updatedAt: string): SavedItem => ({
  id,
  folderId: "folder-1",
  title: `Item ${id}`,
  type: "text",
  tagOptionIds: [],
  createdAt: updatedAt,
  updatedAt,
});

const emptyBaseline = { folders: {}, items: {}, tagGroups: {}, tagOptions: {} };

describe("baselineFromTroveData", () => {
  it("maps each folder and item id to its updatedAt timestamp", () => {
    const troveData: TroveData = {
      folders: [folder("folder-1", "2026-01-01T00:00:00.000Z"), folder("folder-2", "2026-01-02T00:00:00.000Z")],
      items: [item("item-1", "2026-01-03T00:00:00.000Z")],
      tagGroups: [],
      tagOptions: [],
    };

    expect(baselineFromTroveData(troveData)).toEqual({
      folders: {
        "folder-1": "2026-01-01T00:00:00.000Z",
        "folder-2": "2026-01-02T00:00:00.000Z",
      },
      items: {
        "item-1": "2026-01-03T00:00:00.000Z",
      },
      tagGroups: {},
      tagOptions: {},
    });
  });

  it("returns empty maps for empty input", () => {
    expect(baselineFromTroveData({ folders: [], items: [], tagGroups: [], tagOptions: [] })).toEqual(emptyBaseline);
  });
});

describe("loadSyncBaseline / saveSyncBaseline / clearSyncBaseline", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns an empty baseline when nothing has been saved yet", async () => {
    expect(await loadSyncBaseline("user-1")).toEqual(emptyBaseline);
  });

  it("round-trips a saved baseline", async () => {
    const baseline = { folders: { "folder-1": "2026-01-01T00:00:00.000Z" }, items: {}, tagGroups: {}, tagOptions: {} };
    await saveSyncBaseline("user-1", baseline);
    expect(await loadSyncBaseline("user-1")).toEqual(baseline);
  });

  it("keeps baselines separate per user", async () => {
    await saveSyncBaseline("user-1", { folders: { a: "1" }, items: {}, tagGroups: {}, tagOptions: {} });
    await saveSyncBaseline("user-2", { folders: { b: "2" }, items: {}, tagGroups: {}, tagOptions: {} });

    expect(await loadSyncBaseline("user-1")).toEqual({ folders: { a: "1" }, items: {}, tagGroups: {}, tagOptions: {} });
    expect(await loadSyncBaseline("user-2")).toEqual({ folders: { b: "2" }, items: {}, tagGroups: {}, tagOptions: {} });
  });

  it("returns an empty baseline again after clearing", async () => {
    await saveSyncBaseline("user-1", { folders: { a: "1" }, items: {}, tagGroups: {}, tagOptions: {} });
    await clearSyncBaseline("user-1");
    expect(await loadSyncBaseline("user-1")).toEqual(emptyBaseline);
  });
});
