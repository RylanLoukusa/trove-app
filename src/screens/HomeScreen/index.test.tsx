import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen, within } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { HomeScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { useOnboardingTour, WELCOME_NOTE } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import type { SyncSnapshot } from "../../sync/syncStatus";
import type { Folder, ListEntry, SavedItem, SavedListItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";
import { UNTITLED_LIST_TITLE } from "../../utils/listEntries";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../entitlements/EntitlementContext", () => ({
  useEntitlement: jest.fn(),
}));

jest.mock("../../onboarding/OnboardingTourContext", () => ({
  ...jest.requireActual("../../onboarding/OnboardingTourContext"),
  useOnboardingTour: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;
const mockUseEntitlement = useEntitlement as jest.Mock;
const mockUseOnboardingTour = useOnboardingTour as jest.Mock;

const makeFolder = (overrides: Partial<Folder>): Folder => ({
  id: "folder-1",
  name: "Folder",
  parentFolderId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const line = (id: string, text: string, overrides: Partial<SavedListItem> = {}): SavedListItem => ({
  id,
  kind: "check",
  text,
  checked: false,
  indentLevel: 0,
  ...overrides,
});

const makeList = (overrides: Partial<SavedItem>): SavedItem => ({
  id: "list-1",
  folderId: "",
  title: "List",
  type: "list",
  tagOptionIds: [],
  listItems: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeEntry = (id: string, listId: string, updatedAt: string): ListEntry => ({
  id,
  listId,
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: "V",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
});

const folders: Folder[] = [
  makeFolder({ id: "trips", name: "Trips", icon: "✈️" }),
  makeFolder({ id: "home", name: "Home" }),
  makeFolder({ id: "japan", name: "Japan", parentFolderId: "trips" }),
];

const groceries = makeList({
  id: "groceries",
  title: "Groceries",
  updatedAt: "2026-03-01T10:00:00.000Z",
  listItems: [line("g1", "Milk", { checked: true }), line("g2", "Eggs"), line("g3", "Fruit", { kind: "bullet" })],
});
const packing = makeList({
  id: "packing",
  title: "Packing",
  folderId: "japan",
  updatedAt: "2026-03-03T10:00:00.000Z",
  listItems: [line("p1", "Passport")],
});
const chores = makeList({ id: "chores", title: "Chores", folderId: "home", updatedAt: "2026-03-02T10:00:00.000Z" });
const itinerary = makeList({ id: "itinerary", title: "Itinerary", folderId: "trips", updatedAt: "2026-02-01T10:00:00.000Z" });
const unnamed = makeList({
  id: "unnamed",
  title: UNTITLED_LIST_TITLE,
  updatedAt: "2026-01-15T10:00:00.000Z",
  listItems: [line("u1", "Call the plumber", { kind: "text" }), line("u2", "Ask about the leak", { kind: "text" })],
});

const lists: SavedItem[] = [groceries, packing, chores, itinerary, unnamed];

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(false),
} as unknown as NativeStackScreenProps<RootStackParamList, "Home">["navigation"];

const signedInSession = { user: { id: "u1", email: "a@b.com", app_metadata: {} } } as unknown as Session;
const signOut = jest.fn();
const syncToRemote = jest.fn();
const createItem = jest.fn();
const updateItem = jest.fn();
const deleteItem = jest.fn();
const canEditItem = jest.fn();
const presentPaywall = jest.fn();
const maybeStart = jest.fn();
const dismissWelcome = jest.fn();

const syncedSnapshot: SyncSnapshot = { retryCount: 0, status: "synced" };

type Setup = {
  session?: Session | null;
  syncSnapshot?: SyncSnapshot;
  isPro?: boolean;
  isEntitlementLoading?: boolean;
  isReady?: boolean;
  showWelcome?: boolean;
  trove?: { folders?: Folder[]; items?: SavedItem[]; listEntries?: ListEntry[] };
};

const renderHomeScreen = async ({
  session = signedInSession,
  syncSnapshot = syncedSnapshot,
  isPro = false,
  isEntitlementLoading = false,
  isReady = true,
  showWelcome = false,
  trove = {},
}: Setup = {}) => {
  mockUseAuth.mockReturnValue({ session, signOut });
  mockUseTrove.mockReturnValue({
    folders: trove.folders ?? folders,
    isReady,
    items: trove.items ?? lists,
    listEntries: trove.listEntries ?? [],
    syncSnapshot,
    syncToRemote,
    createItem,
    updateItem,
    deleteItem,
    canEditItem,
  });
  mockUseEntitlement.mockReturnValue({
    isPro,
    isLoading: isEntitlementLoading,
    presentPaywall,
    restorePurchases: jest.fn(),
    setDevIsPro: jest.fn(),
  });
  mockUseOnboardingTour.mockReturnValue({ showWelcome, dismissWelcome, maybeStart });
  await renderScreen(<HomeScreen navigation={navigation} route={{} as never} />);
};

// The list rows in the order they are shown.
const listRowTitles = () =>
  screen.getAllByHintText("Hold for more actions").map((row) => row.props.accessibilityLabel as string);

describe("HomeScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    canEditItem.mockReturnValue(true);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  describe("lists", () => {
    it("shows every list, wherever it is kept, with the most recently changed first", async () => {
      await renderHomeScreen();

      expect(listRowTitles()).toEqual(["Packing", "Chores", "Groceries", "Itinerary", "Call the plumber"]);
    });

    it("counts an edit to a line as a change to its list", async () => {
      await renderHomeScreen({
        trove: { listEntries: [makeEntry("u1", "unnamed", "2026-03-09T10:00:00.000Z")] },
      });

      expect(listRowTitles()[0]).toBe("Call the plumber");
    });

    it("previews a list's lines and how many are checked off", async () => {
      await renderHomeScreen();

      const row = within(screen.getByLabelText("Groceries"));
      expect(row.getByText("Milk, Eggs, Fruit")).toBeTruthy();
      expect(row.getByLabelText("1 of 2 done")).toBeTruthy();
    });

    it("shows an unnamed list by its first line and previews the rest", async () => {
      await renderHomeScreen();

      const row = within(screen.getByLabelText("Call the plumber"));
      expect(row.getByText("Ask about the leak")).toBeTruthy();
      expect(row.queryByText(UNTITLED_LIST_TITLE)).toBeNull();
      expect(row.queryByLabelText(/done$/)).toBeNull();
    });

    it("says which folder a list is kept in", async () => {
      await renderHomeScreen();

      expect(within(screen.getByLabelText("Packing")).getByText("📁 Japan")).toBeTruthy();
      expect(within(screen.getByLabelText("Itinerary")).getByText("✈️ Trips")).toBeTruthy();
      expect(within(screen.getByLabelText("Groceries")).queryByText(/📁/)).toBeNull();
    });

    it("opens a list when its row is pressed", async () => {
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("Packing"));

      expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "packing" });
    });

    it("says so when there are no lists yet", async () => {
      await renderHomeScreen({ trove: { items: [] } });

      expect(screen.getByText("No lists yet")).toBeTruthy();
      expect(screen.getByText("Tap the pencil to start one.")).toBeTruthy();
    });
  });

  describe("starting a list", () => {
    it("creates a list with one tap and opens it ready to type", async () => {
      createItem.mockReturnValue(makeList({ id: "new-list", title: UNTITLED_LIST_TITLE }));
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("New list"));

      expect(createItem).toHaveBeenCalledTimes(1);
      expect(createItem).toHaveBeenCalledWith({ folderId: "", title: UNTITLED_LIST_TITLE, type: "list", tagOptionIds: [] });
      expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "new-list", isNew: true });
    });

    it("stays on Home when the list could not be created", async () => {
      createItem.mockReturnValue(undefined);
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("New list"));

      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  describe("folders", () => {
    it("shows the top folders with how many lists each holds, counting its subfolders", async () => {
      await renderHomeScreen();

      expect(screen.getByLabelText("Trips, 2 lists")).toBeTruthy();
      expect(screen.getByLabelText("Home, 1 list")).toBeTruthy();
      expect(screen.queryByLabelText(/^Japan,/)).toBeNull();
    });

    it("opens a folder when its chip is pressed", async () => {
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("Trips, 2 lists"));

      expect(navigation.navigate).toHaveBeenCalledWith("Folder", { folderId: "trips" });
    });

    it("starts a new top-level folder", async () => {
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("New folder"));

      expect(navigation.navigate).toHaveBeenCalledWith("AddEditFolder", { parentFolderId: null });
    });

    it("explains folders when there are none", async () => {
      await renderHomeScreen({ trove: { folders: [], items: [groceries] } });

      expect(screen.getByText("No folders yet. Folders keep related lists together.")).toBeTruthy();
      expect(listRowTitles()).toEqual(["Groceries"]);
    });
  });

  it("opens search", async () => {
    await renderHomeScreen();

    await fireEvent.press(screen.getByLabelText("Search"));

    expect(navigation.navigate).toHaveBeenCalledWith("Search");
  });

  it("holds back the lists and the new-list button until saved data has loaded", async () => {
    await renderHomeScreen({ isReady: false, showWelcome: true });

    expect(screen.getByText("Trove")).toBeTruthy();
    expect(screen.queryByLabelText("New list")).toBeNull();
    expect(screen.queryByText("Lists")).toBeNull();
    expect(screen.queryByText("No lists yet")).toBeNull();
    expect(screen.queryByText(WELCOME_NOTE.title)).toBeNull();
  });

  describe("holding a list", () => {
    it("offers to move or delete it", async () => {
      await renderHomeScreen();

      await fireEvent(screen.getByLabelText("Packing"), "longPress");

      expect(screen.getByLabelText("Move to folder")).toBeTruthy();
      expect(within(screen.getByLabelText("Move to folder")).getByText("Trips > Japan")).toBeTruthy();
      expect(screen.getByLabelText("Delete list")).toBeTruthy();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it("deletes the list only after it is confirmed", async () => {
      deleteItem.mockResolvedValue({ ok: true });
      await renderHomeScreen();

      await fireEvent(screen.getByLabelText("Groceries"), "longPress");
      await fireEvent.press(screen.getByLabelText("Delete list"));

      expect(deleteItem).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith("Delete this list?", expect.any(String), expect.any(Array));
      const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
      expect(buttons.map((button) => button.text)).toEqual(["Cancel", "Delete"]);

      buttons[1].onPress?.();

      expect(deleteItem).toHaveBeenCalledWith("groceries");
    });

    it("offers nothing for a list this person can only view", async () => {
      canEditItem.mockReturnValue(false);
      await renderHomeScreen();

      await fireEvent(screen.getByLabelText("Packing"), "longPress");

      expect(screen.queryByLabelText("Delete list")).toBeNull();
    });
  });

  describe("welcome note", () => {
    it("checks for it when Home is shown", async () => {
      await renderHomeScreen();

      expect(maybeStart).toHaveBeenCalled();
      expect(screen.queryByText(WELCOME_NOTE.title)).toBeNull();
    });

    it("shows once and goes away with Got it", async () => {
      await renderHomeScreen({ showWelcome: true });

      expect(screen.getByText(WELCOME_NOTE.title)).toBeTruthy();
      expect(screen.getByText(WELCOME_NOTE.body)).toBeTruthy();

      await fireEvent.press(screen.getByLabelText("Got it"));

      expect(dismissWelcome).toHaveBeenCalledTimes(1);
    });
  });

  describe("upgrade", () => {
    it("offers Pro to someone who doesn't have it", async () => {
      await renderHomeScreen({ isPro: false });

      await fireEvent.press(screen.getByLabelText("Upgrade to Trove Pro"));

      expect(presentPaywall).toHaveBeenCalledWith("general");
    });

    it("doesn't offer Pro to someone who has it", async () => {
      await renderHomeScreen({ isPro: true });

      expect(screen.queryByLabelText("Upgrade to Trove Pro")).toBeNull();
    });

    it("doesn't offer Pro before it is known whether this person has it", async () => {
      await renderHomeScreen({ isPro: false, isEntitlementLoading: true });

      expect(screen.queryByLabelText("Upgrade to Trove Pro")).toBeNull();
    });
  });

  describe("sync status", () => {
    it("does not show when signed out", async () => {
      await renderHomeScreen({ session: null, isPro: true });

      expect(screen.queryByText("Saved")).toBeNull();
    });

    it("does not show for non-Pro users", async () => {
      await renderHomeScreen({ isPro: false });

      expect(screen.queryByText("Saved")).toBeNull();
    });

    it("shows quietly when everything is saved", async () => {
      await renderHomeScreen({ isPro: true });

      await fireEvent.press(screen.getByText("Saved"));

      expect(syncToRemote).not.toHaveBeenCalled();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it("retries a failed sync on press", async () => {
      syncToRemote.mockResolvedValue({ ok: true });
      await renderHomeScreen({ syncSnapshot: { retryCount: 1, status: "failed", lastError: "Something broke" }, isPro: true });

      await fireEvent.press(screen.getByText("Sync failed"));

      expect(syncToRemote).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("alerts when retrying a failed sync fails again", async () => {
      syncToRemote.mockResolvedValue({ ok: false, error: "Still offline" });
      await renderHomeScreen({ syncSnapshot: { retryCount: 2, status: "failed" }, isPro: true });

      await fireEvent.press(screen.getByText("Sync failed"));

      expect(alertSpy).toHaveBeenCalledWith("Sync failed", "Still offline");
    });

    it("opens the conflict screen instead of retrying when conflicted", async () => {
      await renderHomeScreen({ syncSnapshot: { retryCount: 0, status: "conflicted" }, isPro: true });

      await fireEvent.press(screen.getByText("Sync conflict"));

      expect(navigation.navigate).toHaveBeenCalledWith("SyncConflict");
      expect(syncToRemote).not.toHaveBeenCalled();
    });
  });

  describe("menu", () => {
    it("stays closed until it is opened", async () => {
      await renderHomeScreen();

      expect(screen.queryByLabelText("Settings")).toBeNull();
    });

    it("offers Profile, Settings and Log out when signed in", async () => {
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("Open menu"));
      expect(screen.getByLabelText("Profile")).toBeTruthy();
      expect(screen.queryByLabelText("Log in")).toBeNull();

      await fireEvent.press(screen.getByLabelText("Settings"));
      expect(navigation.navigate).toHaveBeenCalledWith("Settings");
      expect(screen.queryByLabelText("Settings")).toBeNull();

      await fireEvent.press(screen.getByLabelText("Open menu"));
      await fireEvent.press(screen.getByLabelText("Profile"));
      expect(navigation.navigate).toHaveBeenCalledWith("Profile");

      await fireEvent.press(screen.getByLabelText("Open menu"));
      await fireEvent.press(screen.getByLabelText("Log out"));
      expect(signOut).toHaveBeenCalledTimes(1);
    });

    it("offers Settings and Log in when signed out", async () => {
      await renderHomeScreen({ session: null });

      await fireEvent.press(screen.getByLabelText("Open menu"));
      expect(screen.queryByLabelText("Profile")).toBeNull();
      expect(screen.queryByLabelText("Log out")).toBeNull();

      await fireEvent.press(screen.getByLabelText("Log in"));
      expect(navigation.navigate).toHaveBeenCalledWith("Login");
      expect(signOut).not.toHaveBeenCalled();
    });

    it("closes without doing anything when the backdrop is pressed", async () => {
      await renderHomeScreen();

      await fireEvent.press(screen.getByLabelText("Open menu"));
      await fireEvent.press(screen.getByLabelText("Close menu"));

      expect(screen.queryByLabelText("Settings")).toBeNull();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });
});
