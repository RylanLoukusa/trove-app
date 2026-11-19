import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React, { ReactNode } from "react";

import { TroveProvider, useTrove } from "./storage";
import type { Folder, ListEntry, SavedItem, TroveData } from "../types/models";

jest.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ session: null, isAuthReady: true }),
}));

jest.mock("../entitlements/EntitlementContext", () => ({
  useEntitlement: () => ({ isPro: false, isLoading: false }),
}));

jest.mock("../lib/supabase", () => ({
  getSupabase: () => null,
}));

jest.mock("../share/sharedImport", () => ({
  syncShareExtensionFolders: jest.fn(() => Promise.resolve()),
}));

const STORAGE_KEY = "trove:data:v1:anonymous";
const STAMP = "2026-01-01T00:00:00.000Z";

const folder = (id: string, name: string, parentFolderId: string | null = null): Folder => ({
  id,
  name,
  parentFolderId,
  createdAt: STAMP,
  updatedAt: STAMP,
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

const data: TroveData = {
  folders: [folder("trips", "Trips"), folder("japan", "Japan", "trips"), folder("empty", "Empty")],
  items: [
    list("groceries", "Groceries"),
    list("packing", "Packing", "trips"),
    list("tokyo", "Tokyo", "japan"),
    list("today", "Today", "", { listMode: "focus" }),
  ],
  listEntries: [
    entry("g1", "groceries", "Milk", "a0", { checked: true, dueDate: "2026-02-01", completedAt: STAMP }),
    entry("g2", "groceries", "Bread", "a1", { indentLevel: 1 }),
    entry("p1", "packing", "Passport", "a0"),
    entry("t1", "tokyo", "Ramen", "a0"),
    entry("ref1", "today", "", "a0", { refEntryId: "g2" }),
  ],
  tagGroups: [],
  tagOptions: [],
};

const wrapper = ({ children }: { children: ReactNode }) => <TroveProvider>{children}</TroveProvider>;

const renderTrove = async (stored: TroveData = data) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  const hook = await renderHook(() => useTrove(), { wrapper });
  await waitFor(() => expect(hook.result.current.isReady).toBe(true));
  return hook;
};

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id).sort();

describe("TroveProvider Recently deleted, Archive and copies", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem("trove:tagBackfillDone:anonymous", "true");
    await AsyncStorage.setItem("trove:pinnedDefaultsDone:v2:anonymous", "true");
  });

  it("moves a list to Recently deleted with its lines, and puts it back", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      expect(result.current.trashItem("groceries")).toEqual({ ok: true });
    });

    expect(ids(result.current.items)).toEqual(["packing", "today", "tokyo"]);
    expect(ids(result.current.deletedItems)).toEqual(["groceries"]);
    expect(result.current.listEntries.some((line) => line.listId === "groceries")).toBe(false);
    // Today no longer shows the line it pulled in from the deleted list.
    expect(result.current.items.find((item) => item.id === "today")!.listItems).toEqual([]);

    await act(async () => {
      result.current.restoreItem("groceries");
    });

    expect(ids(result.current.items)).toContain("groceries");
    expect(result.current.deletedItems).toEqual([]);
    expect(result.current.items.find((item) => item.id === "today")!.listItems!.map((line) => line.text)).toEqual(["Bread"]);
  });

  it("moves a folder to Recently deleted with its subfolders and lists, and puts all of it back", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      expect(await result.current.trashFolder("trips")).toEqual({ ok: true });
    });

    expect(ids(result.current.folders)).toEqual(["empty"]);
    expect(ids(result.current.items)).toEqual(["groceries", "today"]);
    expect(result.current.deletedFolders.map(({ folder: gone, listCount }) => [gone.id, listCount])).toEqual([["trips", 2]]);

    await act(async () => {
      result.current.restoreFolder("trips");
    });

    expect(ids(result.current.folders)).toEqual(["empty", "japan", "trips"]);
    expect(result.current.items.find((item) => item.id === "tokyo")!.folderId).toBe("japan");
    expect(result.current.deletedFolders).toEqual([]);
  });

  it("deletes a folder with no lists in it straight away", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      await result.current.trashFolder("empty");
    });

    expect(ids(result.current.folders)).toEqual(["japan", "trips"]);
    expect(result.current.deletedFolders).toEqual([]);
  });

  it("puts a list back on Home when its folder has been deleted since", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      result.current.trashItem("packing");
    });
    await act(async () => {
      await result.current.trashFolder("trips");
    });
    await act(async () => {
      result.current.restoreItem("packing");
    });

    expect(result.current.items.find((item) => item.id === "packing")!.folderId).toBe("");
    expect(result.current.deletedFolders.map(({ folder: gone }) => gone.id)).toEqual(["trips"]);
  });

  it("deletes for good what has been in Recently deleted for 30 days", async () => {
    const longAgo = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const recently = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const { result } = await renderTrove({
      ...data,
      items: [
        list("groceries", "Groceries", "", { deletedAt: longAgo }),
        list("packing", "Packing", "trips", { deletedAt: longAgo, deletedWithFolderId: "trips" }),
        list("tokyo", "Tokyo", "japan", { deletedAt: longAgo, deletedWithFolderId: "trips" }),
        list("today", "Today", "", { deletedAt: recently }),
      ],
    });

    await waitFor(() => expect(ids(result.current.deletedItems)).toEqual(["today"]));
    expect(ids(result.current.folders)).toEqual(["empty"]);
    expect(result.current.deletedFolders).toEqual([]);
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as TroveData;
    await waitFor(async () =>
      expect(ids((JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as TroveData).items)).toEqual(["today"]),
    );
    expect(stored).toBeDefined();
  });

  it("archives a list off Home and out of other lists' rules, and brings it back", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      result.current.updateItem("groceries", { pinned: true });
    });
    await act(async () => {
      expect(result.current.setItemArchived("groceries", true)).toBe(true);
    });

    expect(ids(result.current.items)).not.toContain("groceries");
    expect(result.current.archivedItems.map((item) => [item.id, item.pinned])).toEqual([["groceries", false]]);
    // Its lines are still there to read.
    expect(result.current.listEntries.filter((line) => line.listId === "groceries")).toHaveLength(2);

    await act(async () => {
      result.current.setItemArchived("groceries", false);
    });

    expect(ids(result.current.items)).toContain("groceries");
    expect(result.current.archivedItems).toEqual([]);
  });

  it("archives a folder with everything in it, and brings it back", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      expect(result.current.setFolderArchived("trips", true)).toBe(true);
    });

    expect(ids(result.current.folders)).toEqual(["empty"]);
    expect(ids(result.current.archivedItems)).toEqual(["packing", "tokyo"]);
    expect(result.current.archivedFolders.map(({ folder: kept, listCount }) => [kept.id, listCount])).toEqual([["trips", 2]]);
    // A folder with no lists has nothing to archive.
    expect(result.current.setFolderArchived("empty", true)).toBe(false);

    await act(async () => {
      result.current.setFolderArchived("trips", false);
    });

    expect(ids(result.current.folders)).toEqual(["empty", "japan", "trips"]);
    expect(result.current.archivedItems).toEqual([]);
  });

  it("duplicates a list beside it with its own lines as they are", async () => {
    const { result } = await renderTrove();

    let copyId = "";
    await act(async () => {
      copyId = result.current.copyItem("groceries")!.id;
    });

    const copy = result.current.items.find((item) => item.id === copyId)!;
    expect(copy.title).toBe("Groceries copy");
    const lines = result.current.listEntries.filter((line) => line.listId === copyId);
    expect(lines.map((line) => [line.text, line.checked, line.indentLevel, line.dueDate])).toEqual([
      ["Milk", true, 0, "2026-02-01"],
      ["Bread", false, 1, undefined],
    ]);
    expect(lines.every((line) => !["g1", "g2"].includes(line.id))).toBe(true);

    await act(async () => {
      result.current.copyItem("groceries");
    });
    expect(result.current.items.map((item) => item.title)).toContain("Groceries copy 2");
  });

  it("saves a template off Home, and starts a fresh list from it", async () => {
    const { result } = await renderTrove();

    let templateId = "";
    await act(async () => {
      templateId = result.current.copyItem("groceries", { title: "Groceries", fresh: true, template: true })!.id;
    });

    expect(ids(result.current.items)).not.toContain(templateId);
    expect(result.current.templates.map((item) => item.title)).toEqual(["Groceries"]);
    const templateLines = result.current.listEntries.filter((line) => line.listId === templateId);
    expect(templateLines.map((line) => [line.checked, line.dueDate, line.completedAt])).toEqual([
      [false, undefined, undefined],
      [false, undefined, undefined],
    ]);

    let listId = "";
    await act(async () => {
      listId = result.current.copyItem(templateId, { title: "Groceries", fresh: true })!.id;
    });

    const made = result.current.items.find((item) => item.id === listId)!;
    expect(made.isTemplate).toBeUndefined();
    expect(made.folderId).toBe("");
    expect(result.current.listEntries.filter((line) => line.listId === listId).map((line) => line.text)).toEqual(["Milk", "Bread"]);
  });

  it("leaves lines shown from other lists out of a copy", async () => {
    const { result } = await renderTrove();

    let copyId = "";
    await act(async () => {
      copyId = result.current.copyItem("today")!.id;
    });

    expect(result.current.listEntries.filter((line) => line.listId === copyId)).toEqual([]);
  });

  it("makes a list from ready-made lines", async () => {
    const { result } = await renderTrove();

    let listId = "";
    await act(async () => {
      listId = result.current.createItemWithLines("Chores", [
        { text: "Kitchen", kind: "text", bold: true },
        { text: "Dishes" },
      ])!.id;
    });

    const lines = result.current.listEntries.filter((line) => line.listId === listId);
    expect(lines.map((line) => [line.text, line.kind, !!line.bold])).toEqual([
      ["Kitchen", "text", true],
      ["Dishes", "check", false],
    ]);
    expect(lines[0].position < lines[1].position).toBe(true);
  });

  it("leaves Recently deleted out of an export, and keeps the archive in", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      result.current.trashItem("groceries");
      result.current.setItemArchived("packing", true);
    });
    await act(async () => {
      await result.current.trashFolder("japan");
    });

    const exported = result.current.getExportData();
    expect(ids(exported.items)).toEqual(["packing", "today"]);
    expect(ids(exported.folders)).toEqual(["empty", "trips"]);
    expect(ids(exported.listEntries)).toEqual(["p1", "ref1"]);
  });
});

describe("TroveProvider repeating lines and lists that start over", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem("trove:tagBackfillDone:anonymous", "true");
    await AsyncStorage.setItem("trove:pinnedDefaultsDone:v2:anonymous", "true");
  });

  const pad = (value: number) => String(value).padStart(2, "0");
  const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  it("brings a repeating line back open, due the next time, when it is checked", async () => {
    const { result } = await renderTrove({
      ...data,
      listEntries: [entry("bins", "groceries", "Bins out", "a0", { dueDate: dayKey(today), dueTime: "07:00", repeat: "daily" })],
    });

    await act(async () => {
      expect(result.current.setEntriesChecked(["bins"], true)).toBe(1);
    });

    const bins = result.current.listEntries.find((line) => line.id === "bins")!;
    expect(bins.checked).toBe(false);
    expect(bins.dueDate).toBe(dayKey(tomorrow));
    expect(bins.dueTime).toBe("07:00");
    expect(bins.completedAt).toBeDefined();
  });

  it("does the same when a repeating line is checked by editing it", async () => {
    const { result } = await renderTrove({
      ...data,
      listEntries: [entry("bins", "groceries", "Bins out", "a0", { dueDate: dayKey(today), repeat: "daily" })],
    });

    await act(async () => {
      result.current.updateListEntry("bins", { checked: true });
    });

    expect(result.current.listEntries.find((line) => line.id === "bins")).toMatchObject({
      checked: false,
      dueDate: dayKey(tomorrow),
    });
  });

  it("drops a time from a line that loses its date", async () => {
    const { result } = await renderTrove({
      ...data,
      listEntries: [entry("bins", "groceries", "Bins out", "a0", { dueDate: dayKey(today), dueTime: "07:00" })],
    });

    await act(async () => {
      result.current.updateListEntry("bins", { dueDate: undefined });
    });

    expect(result.current.listEntries.find((line) => line.id === "bins")!.dueTime).toBeUndefined();
  });

  it("unchecks a list's own lines once a new day has begun since it last started over", async () => {
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12).toISOString();
    const { result } = await renderTrove({
      ...data,
      items: [
        list("chores", "Chores", "", { resetRule: "daily", resetAt: yesterday }),
        list("groceries", "Groceries"),
      ],
      listEntries: [
        entry("c1", "chores", "Dishes", "a0", { checked: true, completedAt: yesterday }),
        entry("c2", "chores", "Laundry", "a1"),
        entry("g1", "groceries", "Milk", "a0", { checked: true }),
      ],
    });

    await waitFor(() => expect(result.current.listEntries.find((line) => line.id === "c1")!.checked).toBe(false));
    expect(result.current.listEntries.find((line) => line.id === "g1")!.checked).toBe(true);
    const chores = result.current.items.find((item) => item.id === "chores")!;
    expect(Date.parse(chores.resetAt!)).toBeGreaterThan(Date.parse(yesterday));
  });
});
