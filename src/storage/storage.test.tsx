import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React, { ReactNode } from "react";

import { TroveProvider, useTrove } from "./storage";
import type { TroveData } from "../types/models";

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

// Data saved before list entries existed: lines embedded on the item.
const legacyData = {
  folders: [
    {
      id: "folder-1",
      name: "Wedding",
      parentFolderId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  items: [
    {
      id: "list-1",
      folderId: "folder-1",
      title: "To do",
      type: "list",
      tagOptionIds: [],
      listItems: [
        { id: "a", kind: "check", text: "Book florist", checked: false },
        { id: "b", kind: "check", text: "Order cake", checked: false },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ],
  tagGroups: [],
  tagOptions: [],
};

const wrapper = ({ children }: { children: ReactNode }) => <TroveProvider>{children}</TroveProvider>;

const renderTrove = async () => {
  const hook = await renderHook(() => useTrove(), { wrapper });
  await waitFor(() => expect(hook.result.current.isReady).toBe(true));
  return hook;
};

const storedData = async (): Promise<TroveData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);

describe("TroveProvider list entries", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));
    // Skip the one-time tag seeding so it doesn't add groups to the fixture.
    await AsyncStorage.setItem("trove:tagBackfillDone:anonymous", "true");
  });

  it("migrates embedded list lines into entries and still exposes them as listItems", async () => {
    const { result } = await renderTrove();

    expect(result.current.listEntries.map((entry) => entry.id)).toEqual(["list-1~a", "list-1~b"]);
    expect(result.current.items[0].listItems?.map((line) => line.text)).toEqual(["Book florist", "Order cake"]);

    await waitFor(async () => {
      const stored = await storedData();
      expect(stored.listEntries).toHaveLength(2);
      expect(stored.items[0]).not.toHaveProperty("listItems");
    });
  });

  it("checking a line updates only that entry, not the list item", async () => {
    const { result } = await renderTrove();
    const itemBefore = result.current.items[0];
    const [first, second] = result.current.listEntries;

    await act(async () => {
      result.current.updateListEntry(first.id, { checked: true });
    });

    const [nextFirst, nextSecond] = result.current.listEntries;
    expect(nextFirst).toMatchObject({ checked: true });
    expect(nextFirst.completedAt).toBeDefined();
    expect(nextFirst.updatedAt).not.toBe(first.updatedAt);
    expect(nextSecond).toBe(second);
    expect(result.current.items[0].updatedAt).toBe(itemBefore.updatedAt);
    expect(result.current.items[0].listItems?.[0].checked).toBe(true);
  });

  it("saving an edited list through updateItem reorders by moving one entry", async () => {
    const { result } = await renderTrove();
    const lines = result.current.items[0].listItems!;

    await act(async () => {
      result.current.updateItem("list-1", {
        listItems: [lines[1], lines[0], { id: "new-line", kind: "check", text: "Venue", checked: false }],
      });
    });

    expect(result.current.items[0].listItems?.map((line) => line.text)).toEqual(["Order cake", "Book florist", "Venue"]);
    expect(result.current.items[0].updatedAt).toBe("2026-01-02T00:00:00.000Z");
    const changed = result.current.listEntries.filter((entry) => entry.updatedAt !== "2026-01-02T00:00:00.000Z");
    // Swapping two lines repositions exactly one of them, plus the new line.
    expect(changed).toHaveLength(2);
    expect(changed.map((entry) => entry.id)).toContain("new-line");
  });

  it("renaming the list bumps the item but leaves entries alone", async () => {
    const { result } = await renderTrove();
    const entriesBefore = result.current.listEntries;

    await act(async () => {
      result.current.updateItem("list-1", { title: "Wedding to do", listItems: result.current.items[0].listItems });
    });

    expect(result.current.items[0].title).toBe("Wedding to do");
    expect(result.current.items[0].updatedAt).not.toBe("2026-01-02T00:00:00.000Z");
    expect(result.current.listEntries).toEqual(entriesBefore);
  });

  it("deleting the list deletes its entries", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      await result.current.deleteItem("list-1");
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.listEntries).toHaveLength(0);
  });

  it("creating a list stores its lines as entries", async () => {
    const { result } = await renderTrove();

    let createdId = "";
    await act(async () => {
      createdId =
        result.current.createItem({
          folderId: "folder-1",
          title: "Apartment",
          type: "list",
          tagOptionIds: [],
          listItems: [
            { id: "x", kind: "check", text: "Hang shelves", checked: false },
            { id: "y", kind: "bullet", text: "Measure couch" },
          ],
        })?.id ?? "";
    });

    const entries = result.current.listEntries.filter((entry) => entry.listId === createdId);
    expect(entries.map((entry) => entry.text)).toEqual(["Hang shelves", "Measure couch"]);
    expect(entries[0].position < entries[1].position).toBe(true);
    expect(result.current.items.find((item) => item.id === createdId)?.listItems).toHaveLength(2);
  });
});

describe("TroveProvider list entry actions", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));
    await AsyncStorage.setItem("trove:tagBackfillDone:anonymous", "true");
  });

  it("adds a line to the end of a list", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      result.current.createListEntry("list-1", { text: "  Send invites ", dueDate: "2026-12-01" });
    });

    const lines = result.current.items[0].listItems!;
    expect(lines.map((line) => line.text)).toEqual(["Book florist", "Order cake", "Send invites"]);
    expect(result.current.listEntries.find((entry) => entry.text === "Send invites")).toMatchObject({
      dueDate: "2026-12-01",
      kind: "check",
    });
  });

  it("inserts lines right after a line, in order, keeping indent and checked state", async () => {
    const { result } = await renderTrove();
    const [florist] = result.current.items[0].listItems!;

    await act(async () => {
      result.current.insertListEntries("list-1", florist.id, [
        { text: " Roses ", indentLevel: 1, checked: false },
        { text: "Tulips", indentLevel: 9, checked: true },
      ]);
    });

    const lines = result.current.items[0].listItems!;
    expect(lines.map((line) => line.text)).toEqual(["Book florist", "Roses", "Tulips", "Order cake"]);
    expect(lines.map((line) => line.indentLevel)).toEqual([0, 1, 3, 0]);
    expect(lines[2].checked).toBe(true);
  });

  it("adds pasted lines at the end when there's no line to follow", async () => {
    const { result } = await renderTrove();

    await act(async () => {
      result.current.insertListEntries("list-1", null, [{ text: "Venue" }, { text: "Band" }]);
    });

    expect(result.current.items[0].listItems!.map((line) => line.text)).toEqual(["Book florist", "Order cake", "Venue", "Band"]);
  });

  it("moves a line between two others by changing only its position", async () => {
    const { result } = await renderTrove();
    await act(async () => {
      result.current.createListEntry("list-1", { text: "Venue" });
    });
    const [florist, cake, venue] = result.current.items[0].listItems!;
    const before = result.current.listEntries;

    await act(async () => {
      result.current.moveListEntry(venue.id, florist.id, cake.id);
    });

    expect(result.current.items[0].listItems!.map((line) => line.text)).toEqual(["Book florist", "Venue", "Order cake"]);
    const changed = result.current.listEntries.filter((entry, index) => entry !== before[index]);
    expect(changed.map((entry) => entry.id)).toEqual([venue.id]);
  });

  it("moves a line to the top", async () => {
    const { result } = await renderTrove();
    const [florist, cake] = result.current.items[0].listItems!;

    await act(async () => {
      result.current.moveListEntry(cake.id, null, florist.id);
    });

    expect(result.current.items[0].listItems!.map((line) => line.text)).toEqual(["Order cake", "Book florist"]);
  });

  it("deletes a single line and keeps the rest", async () => {
    const { result } = await renderTrove();
    const [florist] = result.current.items[0].listItems!;

    await act(async () => {
      result.current.deleteListEntry(florist.id);
    });

    expect(result.current.items[0].listItems!.map((line) => line.text)).toEqual(["Order cake"]);
  });

  it("sets a due date, notes and priority on a line", async () => {
    const { result } = await renderTrove();
    const [florist] = result.current.items[0].listItems!;

    await act(async () => {
      result.current.updateListEntry(florist.id, { dueDate: "2026-12-01", notes: "Ask about peonies", tagOptionIds: ["high"] });
    });

    expect(result.current.listEntries.find((entry) => entry.id === florist.id)).toMatchObject({
      dueDate: "2026-12-01",
      notes: "Ask about peonies",
      tagOptionIds: ["high"],
    });
  });
});

describe("TroveProvider focus lists", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));
    await AsyncStorage.setItem("trove:tagBackfillDone:anonymous", "true");
  });

  const createToday = async (result: { current: ReturnType<typeof useTrove> }) => {
    let id = "";
    await act(async () => {
      id = result.current.createItem({ folderId: "folder-1", title: "Today", type: "list", listMode: "focus", tagOptionIds: [] })!.id;
    });
    return id;
  };
  const today = (result: { current: ReturnType<typeof useTrove> }, id: string) =>
    result.current.items.find((item) => item.id === id)!;

  it("pulls lines in from other lists without moving them", async () => {
    const { result } = await renderTrove();
    const todayId = await createToday(result);

    await act(async () => {
      expect(result.current.addToFocusList(todayId, ["list-1~b", "list-1~a", "list-1~b"])).toBe(2);
    });
    // Adding again, or adding a focus-list line, does nothing.
    await act(async () => {
      expect(result.current.addToFocusList(todayId, ["list-1~a", `${todayId}>list-1~a`])).toBe(0);
    });

    expect(today(result, todayId).listItems?.map((line) => line.text)).toEqual(["Order cake", "Book florist"]);
    expect(result.current.items.find((item) => item.id === "list-1")?.listItems).toHaveLength(2);
  });

  it("checking a pulled-in line checks the original", async () => {
    const { result } = await renderTrove();
    const todayId = await createToday(result);
    await act(async () => {
      result.current.addToFocusList(todayId, ["list-1~a"]);
    });

    // Through the focus list's own line id, as the folder screen does.
    await act(async () => {
      result.current.updateListEntry(`${todayId}>list-1~a`, { checked: true });
    });

    expect(today(result, todayId).listItems?.[0]).toMatchObject({ text: "Book florist", checked: true });
    expect(result.current.listEntries.find((entry) => entry.id === "list-1~a")?.checked).toBe(true);
  });

  it("removing from the focus list keeps the original, deleting the original removes it everywhere", async () => {
    const { result } = await renderTrove();
    const todayId = await createToday(result);
    await act(async () => {
      result.current.addToFocusList(todayId, ["list-1~a", "list-1~b"]);
    });

    await act(async () => {
      result.current.removeFromFocusList(todayId, "list-1~a");
    });
    expect(today(result, todayId).listItems?.map((line) => line.text)).toEqual(["Order cake"]);
    expect(result.current.listEntries.some((entry) => entry.id === "list-1~a")).toBe(true);

    await act(async () => {
      result.current.deleteListEntry("list-1~b");
    });
    expect(today(result, todayId).listItems).toEqual([]);
    expect(result.current.listEntries.filter((entry) => entry.listId === todayId)).toHaveLength(0);
  });

  it("deleting a source list takes its lines out of focus lists", async () => {
    const { result } = await renderTrove();
    const todayId = await createToday(result);
    await act(async () => {
      result.current.addToFocusList(todayId, ["list-1~a"]);
      result.current.createListEntry(todayId, { text: "Call mom" });
    });

    await act(async () => {
      await result.current.deleteItem("list-1");
    });

    expect(today(result, todayId).listItems?.map((line) => line.text)).toEqual(["Call mom"]);
  });

  it("clears done lines, then everything, without touching the originals", async () => {
    const { result } = await renderTrove();
    const todayId = await createToday(result);
    await act(async () => {
      result.current.addToFocusList(todayId, ["list-1~a", "list-1~b"]);
    });
    await act(async () => {
      result.current.createListEntry(todayId, { text: "Call mom" });
    });
    await act(async () => {
      result.current.updateListEntry("list-1~a", { checked: true });
    });

    await act(async () => {
      expect(result.current.clearFocusList(todayId, "done")).toBe(1);
    });
    expect(today(result, todayId).listItems?.map((line) => line.text)).toEqual(["Order cake", "Call mom"]);

    await act(async () => {
      expect(result.current.clearFocusList(todayId, "all")).toBe(2);
    });
    expect(today(result, todayId).listItems).toEqual([]);
    expect(result.current.items.find((item) => item.id === "list-1")?.listItems).toHaveLength(2);
  });

  it("ignores whole-list rewrites for focus lists", async () => {
    const { result } = await renderTrove();
    const todayId = await createToday(result);
    await act(async () => {
      result.current.addToFocusList(todayId, ["list-1~a"]);
    });
    const before = result.current.listEntries;

    await act(async () => {
      result.current.updateItem(todayId, { title: "Today!", listItems: [] });
    });

    expect(today(result, todayId).title).toBe("Today!");
    expect(result.current.listEntries).toEqual(before);
  });
});
