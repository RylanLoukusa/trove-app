import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React, { ReactNode } from "react";

import { TroveProvider, useTrove } from "./storage";
import { pullTroveDataForUser } from "../sync/troveSync";
import type { ListEntry, SavedItem, TroveData } from "../types/models";

const mockAuth = { session: { user: { id: "me" } }, isAuthReady: true };
const mockEntitlement = { isPro: false, isLoading: false };

jest.mock("../auth/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("../entitlements/EntitlementContext", () => ({
  useEntitlement: () => mockEntitlement,
}));

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({}),
}));

jest.mock("../share/sharedImport", () => ({
  syncShareExtensionFolders: jest.fn(() => Promise.resolve()),
}));

jest.mock("../sync/troveSync", () => ({
  ...jest.requireActual("../sync/troveSync"),
  clearStoredRemoteUpdatedAt: jest.fn(() => Promise.resolve()),
  ensureRemoteRowForUser: jest.fn(() => Promise.resolve({ created: true })),
  pullTroveDataForUser: jest.fn(),
  pushTroveDataForUser: jest.fn(() => Promise.resolve({ ok: true })),
  subscribeTroveRealtimeForUser: jest.fn(() => ({ unsubscribe: jest.fn() })),
}));

const mockPull = pullTroveDataForUser as jest.Mock;

const stamp = "2026-03-01T00:00:00.000Z";
const list = (id: string, ownerId: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title: id,
  type: "list",
  tagOptionIds: [],
  ownerId,
  accessRole: ownerId === "me" ? "owner" : "viewer",
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
const data = (items: SavedItem[], listEntries: ListEntry[] = []): TroveData => ({
  folders: [],
  items,
  listEntries,
  tagGroups: [],
  tagOptions: [],
});

// On the phone: a list made since the last time this account synced.
const onDevice = data([list("mine", "me")], [line("milk", "mine")]);
// On the server: an old list of theirs, and one a friend shares with them.
const onServer = data([list("old", "me"), list("party", "friend")], [line("balloons", "party")]);

const wrapper = ({ children }: { children: ReactNode }) => <TroveProvider>{children}</TroveProvider>;

const titles = (items: SavedItem[]) => items.map((item) => item.title).sort();

describe("TroveProvider pulling from the server", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockEntitlement.isPro = false;
    mockEntitlement.isLoading = false;
    await AsyncStorage.clear();
    await AsyncStorage.setItem("trove:tagBackfillDone:me", "true");
    await AsyncStorage.setItem("trove:data:v1:user:me", JSON.stringify(onDevice));
    mockPull.mockResolvedValue({ kind: "applied", data: onServer, remoteUpdatedAt: "2026-03-02T00:00:00.000Z" });
  });

  it("keeps what someone without Pro made on their phone, and adds what was shared with them", async () => {
    const { result } = await renderHook(() => useTrove(), { wrapper });

    await waitFor(() => expect(titles(result.current.items)).toEqual(["This week", "Today", "mine", "party"]));
    expect(result.current.listEntries.map((entry) => entry.id).sort()).toEqual(["balloons", "milk"]);
  });

  it("keeps the pinned Today and This week through a later pull", async () => {
    const { result } = await renderHook(() => useTrove(), { wrapper });
    await waitFor(() => expect(titles(result.current.items)).toContain("Today"));

    await act(async () => {
      await result.current.refreshFromRemote({ force: true });
    });

    expect(titles(result.current.items)).toEqual(["This week", "Today", "mine", "party"]);
    expect(result.current.items.filter((item) => item.pinned).map((item) => item.title).sort()).toEqual([
      "This week",
      "Today",
    ]);
  });

  it("takes the server's copy for an account whose lists sync", async () => {
    mockEntitlement.isPro = true;

    const { result } = await renderHook(() => useTrove(), { wrapper });

    await waitFor(() => expect(titles(result.current.items)).toEqual(["This week", "Today", "old", "party"]));
  });

  it("doesn't pull until it's known whether the account has Pro", async () => {
    mockEntitlement.isLoading = true;
    const { result, rerender } = await renderHook(() => useTrove(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.refreshFromRemote({ force: true });
    });
    expect(mockPull).not.toHaveBeenCalled();
    expect(titles(result.current.items)).toEqual(["mine"]);

    mockEntitlement.isLoading = false;
    await rerender({});

    await waitFor(() => expect(mockPull).toHaveBeenCalled());
    await waitFor(() => expect(titles(result.current.items)).toEqual(["This week", "Today", "mine", "party"]));
  });
});
