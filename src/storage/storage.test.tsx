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
