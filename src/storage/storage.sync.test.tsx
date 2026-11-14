import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React, { ReactNode } from "react";

import { TroveProvider, useTrove } from "./storage";
import { saveSyncBaseline } from "../sync/syncBaseline";
import { pullTroveDataForUser, pushTroveDataForUser } from "../sync/troveSync";
import type { ListEntry, SavedItem, TroveData } from "../types/models";

jest.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ session: { user: { id: "me" } }, isAuthReady: true }),
}));

// Sync doesn't depend on Pro.
jest.mock("../entitlements/EntitlementContext", () => ({
  useEntitlement: () => ({ isPro: false, isLoading: false }),
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
  pushTroveDataForUser: jest.fn(),
  subscribeTroveRealtimeForUser: jest.fn(() => ({ unsubscribe: jest.fn() })),
}));

const mockPull = pullTroveDataForUser as jest.Mock;
const mockPush = pushTroveDataForUser as jest.Mock;

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

// On the phone: a list made while this account's lists stayed on the phone.
const onDevice = data([list("mine", "me")], [line("milk", "mine")]);
// On the server: a list another phone made, one this phone deleted after it
// last saw it there, and one a friend shares with them.
const onServer = data(
  [list("other-phone", "me"), list("deleted-here", "me"), list("party", "friend")],
  [line("balloons", "party")],
);

const wrapper = ({ children }: { children: ReactNode }) => <TroveProvider>{children}</TroveProvider>;
const titles = (items: SavedItem[]) => items.map((item) => item.title).sort();
const pushedTitles = (call: number) => titles((mockPush.mock.calls[call][2] as TroveData).items);

describe("TroveProvider syncing every account", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem("trove:tagBackfillDone:me", "true");
    await AsyncStorage.setItem("trove:data:v1:user:me", JSON.stringify(onDevice));
    await saveSyncBaseline("me", {
      folders: {},
      items: { "deleted-here": stamp },
      listEntries: {},
      tagGroups: {},
      tagOptions: {},
    });
    mockPull.mockResolvedValue({ kind: "applied", data: onServer, remoteUpdatedAt: "2026-03-02T00:00:00.000Z" });
    mockPush.mockResolvedValue({ ok: true });
  });

  it("uploads what's on the phone the first time, with what only the server had", async () => {
    const { result } = await renderHook(() => useTrove(), { wrapper });

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(pushedTitles(0)).toEqual(["mine", "other-phone", "party"]);
    await waitFor(() =>
      expect(titles(result.current.items)).toEqual(["This week", "Today", "mine", "other-phone", "party"]),
    );
    expect(result.current.listEntries.map((entry) => entry.id).sort()).toEqual(["balloons", "milk"]);
    expect(await AsyncStorage.getItem("trove:ownDataUploaded:v1:me")).toBe("true");
  });

  it("sends up the pinned Today and This week right after", async () => {
    await renderHook(() => useTrove(), { wrapper });

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(pushedTitles(1)).toEqual(["This week", "Today", "mine", "other-phone", "party"]);
  });

  it("takes the server's copy once the phone's lists are up there", async () => {
    await AsyncStorage.setItem("trove:ownDataUploaded:v1:me", "true");

    const { result } = await renderHook(() => useTrove(), { wrapper });

    await waitFor(() =>
      expect(titles(result.current.items)).toEqual(["This week", "Today", "deleted-here", "other-phone", "party"]),
    );
  });

  it("keeps the phone's lists through a later pull if the upload didn't go through", async () => {
    mockPush.mockResolvedValue({ ok: false, error: "Offline" });
    const { result } = await renderHook(() => useTrove(), { wrapper });
    await waitFor(() => expect(titles(result.current.items)).toContain("Today"));

    await act(async () => {
      await result.current.refreshFromRemote({ force: true });
    });

    expect(titles(result.current.items)).toEqual(["This week", "Today", "mine", "other-phone", "party"]);
    expect(await AsyncStorage.getItem("trove:ownDataUploaded:v1:me")).toBeNull();
  });
});
