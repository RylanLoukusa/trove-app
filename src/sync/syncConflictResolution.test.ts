import { mergeConflictFields } from "./syncConflictResolution";
import type { SyncConflictSummary } from "./syncBaseline";
import type { Folder, SavedItem, TroveData } from "../types/models";

const now = "2026-01-01T00:00:00.000Z";
const mergedAt = "2026-02-02T00:00:00.000Z";

const folder = (id: string, name: string, purpose: string): Folder => ({
  id,
  name,
  parentFolderId: null,
  purpose,
  createdAt: now,
  updatedAt: now,
});

const item = (id: string, title: string): SavedItem => ({
  id,
  folderId: "folder-1",
  title,
  type: "text",
  tagOptionIds: [],
  createdAt: now,
  updatedAt: now,
});

const baseConflict: SyncConflictSummary = {
  entityId: "folder-1",
  entityKind: "folders",
  reason: "remote_changed",
  remoteUpdatedAt: mergedAt,
  fields: [
    { field: "name", localRawValue: "Local Name", localValue: "Local Name", remoteRawValue: "Remote Name", remoteValue: "Remote Name" },
  ],
};

describe("mergeConflictFields", () => {
  it("returns the data unchanged when there are no conflicting fields", () => {
    const troveData: TroveData = { folders: [folder("folder-1", "Local Name", "Local purpose")], items: [], tagGroups: [], tagOptions: [] };
    const conflict: SyncConflictSummary = { ...baseConflict, fields: undefined };
    expect(mergeConflictFields(troveData, conflict, {}, mergedAt)).toBe(troveData);

    const conflictEmptyFields: SyncConflictSummary = { ...baseConflict, fields: [] };
    expect(mergeConflictFields(troveData, conflictEmptyFields, {}, mergedAt)).toBe(troveData);
  });

  it("applies the remote value only for fields explicitly chosen as remote, for the folders entityKind", () => {
    const troveData: TroveData = {
      folders: [folder("folder-1", "Local Name", "Local purpose"), folder("folder-2", "Other Folder", "Other purpose")],
      items: [],
      tagGroups: [],
      tagOptions: [],
    };

    const result = mergeConflictFields(troveData, baseConflict, { name: "remote" }, mergedAt);

    const merged = result.folders.find((f) => f.id === "folder-1");
    expect(merged?.name).toBe("Remote Name");
    expect(merged?.purpose).toBe("Local purpose");
    expect(merged?.updatedAt).toBe(mergedAt);

    // Untouched folder is unaffected.
    expect(result.folders.find((f) => f.id === "folder-2")).toEqual(troveData.folders[1]);
  });

  it("keeps the local value when a conflicting field is not chosen as remote", () => {
    const troveData: TroveData = { folders: [folder("folder-1", "Local Name", "Local purpose")], items: [], tagGroups: [], tagOptions: [] };

    const result = mergeConflictFields(troveData, baseConflict, { name: "local" }, mergedAt);

    const merged = result.folders.find((f) => f.id === "folder-1");
    expect(merged?.name).toBe("Local Name");
    // updatedAt still bumps to the merge time even when nothing textual changed.
    expect(merged?.updatedAt).toBe(mergedAt);
  });

  it("applies the same logic to the items entityKind", () => {
    const troveData: TroveData = { folders: [], items: [item("item-1", "Local Title"), item("item-2", "Other Item")], tagGroups: [], tagOptions: [] };
    const itemConflict: SyncConflictSummary = {
      entityId: "item-1",
      entityKind: "items",
      reason: "remote_changed",
      remoteUpdatedAt: mergedAt,
      fields: [
        { field: "title", localRawValue: "Local Title", localValue: "Local Title", remoteRawValue: "Remote Title", remoteValue: "Remote Title" },
      ],
    };

    const result = mergeConflictFields(troveData, itemConflict, { title: "remote" }, mergedAt);

    expect(result.items.find((i) => i.id === "item-1")?.title).toBe("Remote Title");
    expect(result.items.find((i) => i.id === "item-2")).toEqual(troveData.items[1]);
  });
});
