import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { HomeScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { useTrove } from "../../storage/storage";
import type { SyncSnapshot } from "../../sync/syncStatus";
import type { Folder, SavedItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../entitlements/EntitlementContext", () => ({
  useEntitlement: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;
const mockUseEntitlement = useEntitlement as jest.Mock;

const makeFolder = (overrides: Partial<Folder>): Folder => ({
  id: "folder-1",
  name: "Folder",
  parentFolderId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeItem = (overrides: Partial<SavedItem>): SavedItem => ({
  id: "item-1",
  folderId: "folder-1",
  title: "Item",
  type: "link",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const folders: Folder[] = [makeFolder({ id: "recipes", name: "Recipes" })];
const items: SavedItem[] = [makeItem({ id: "pasta", folderId: "recipes", title: "Pasta recipe" })];

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(false),
} as unknown as NativeStackScreenProps<RootStackParamList, "Home">["navigation"];

const signedInSession = { user: { id: "u1", email: "a@b.com", app_metadata: {} } } as unknown as Session;
const signOut = jest.fn();
const syncToRemote = jest.fn();

const syncedSnapshot: SyncSnapshot = { retryCount: 0, status: "synced" };

const renderHomeScreen = async (
  session: Session | null,
  syncSnapshot: SyncSnapshot = syncedSnapshot,
  isPro = false,
) => {
  mockUseAuth.mockReturnValue({ session, signOut });
  mockUseTrove.mockReturnValue({ folders, isReady: true, items, syncSnapshot, syncToRemote });
  mockUseEntitlement.mockReturnValue({
    isPro,
    isLoading: false,
    presentPaywall: jest.fn(),
    restorePurchases: jest.fn(),
    setDevIsPro: jest.fn(),
  });
  await renderScreen(<HomeScreen navigation={navigation} route={{} as never} />);
};

describe("HomeScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows folders", async () => {
    await renderHomeScreen(signedInSession);

    expect(screen.getAllByText("Recipes").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no folders", async () => {
    mockUseAuth.mockReturnValue({ session: signedInSession, signOut });
    mockUseTrove.mockReturnValue({ folders: [], isReady: true, items: [], syncSnapshot: syncedSnapshot, syncToRemote });
    mockUseEntitlement.mockReturnValue({
      isPro: false,
      isLoading: false,
      presentPaywall: jest.fn(),
      restorePurchases: jest.fn(),
      setDevIsPro: jest.fn(),
    });
    await renderScreen(<HomeScreen navigation={navigation} route={{} as never} />);

    expect(screen.getByText("No folders yet.")).toBeTruthy();
  });

  it("navigates to Add Item and New folder", async () => {
    await renderHomeScreen(signedInSession);

    await fireEvent.press(screen.getByText("Add Item"));
    expect(navigation.navigate).toHaveBeenCalledWith("AddEditItem");

    await fireEvent.press(screen.getByText("New folder"));
    expect(navigation.navigate).toHaveBeenCalledWith("AddEditFolder", { parentFolderId: null });
  });

  it("navigates into a folder when pressed", async () => {
    await renderHomeScreen(signedInSession);

    await fireEvent.press(screen.getAllByText("Recipes")[0]);
    expect(navigation.navigate).toHaveBeenCalledWith("Folder", { folderId: "recipes" });
  });

  it("opens the folder browser and navigates to the selected folder", async () => {
    await renderHomeScreen(signedInSession);

    await fireEvent.press(screen.getByText("Browse all"));
    expect(screen.getByText("All folders")).toBeTruthy();

    await fireEvent.press(screen.getAllByText("Recipes")[screen.getAllByText("Recipes").length - 1]);
    expect(navigation.navigate).toHaveBeenCalledWith("Folder", { folderId: "recipes" });
  });

  it("does not show a sync pill when signed out", async () => {
    await renderHomeScreen(null, syncedSnapshot, true);

    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("does not show a sync pill for non-Pro users", async () => {
    await renderHomeScreen(signedInSession, syncedSnapshot, false);

    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("shows the sync status and retries a failed sync on press", async () => {
    syncToRemote.mockResolvedValue({ ok: true });
    await renderHomeScreen(signedInSession, { retryCount: 1, status: "failed", lastError: "Something broke" }, true);

    const pill = screen.getByText("Sync failed");
    await fireEvent.press(pill);

    expect(syncToRemote).toHaveBeenCalledTimes(1);
  });

  it("alerts when retrying a failed sync fails again", async () => {
    syncToRemote.mockResolvedValue({ ok: false, error: "Still offline" });
    await renderHomeScreen(signedInSession, { retryCount: 2, status: "failed" }, true);

    await fireEvent.press(screen.getByText("Sync failed"));

    expect(alertSpy).toHaveBeenCalledWith("Sync failed", "Still offline");
  });

  it("navigates to the conflict screen instead of retrying when conflicted", async () => {
    await renderHomeScreen(signedInSession, { retryCount: 0, status: "conflicted" }, true);

    await fireEvent.press(screen.getByText("Sync conflict"));

    expect(navigation.navigate).toHaveBeenCalledWith("SyncConflict");
    expect(syncToRemote).not.toHaveBeenCalled();
  });

  it("opens a menu with Logout when signed in", async () => {
    await renderHomeScreen(signedInSession);

    await fireEvent.press(screen.getByLabelText("Open menu"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Menu",
      "Choose an action",
      expect.arrayContaining([expect.objectContaining({ text: "Logout" })]),
    );
  });

  it("opens a menu with Login when signed out", async () => {
    await renderHomeScreen(null);

    await fireEvent.press(screen.getByLabelText("Open menu"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Menu",
      "Choose an action",
      expect.arrayContaining([expect.objectContaining({ text: "Login" })]),
    );
  });
});
