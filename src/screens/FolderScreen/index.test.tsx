import React from "react";
import { Alert, Share } from "react-native";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FolderScreen } from "./index";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import { useTrove } from "../../storage/storage";
import type { Folder, ListEntry, SavedItem, SavedListItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";
import { UNTITLED_LIST_TITLE } from "../../utils/listEntries";

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../collaboration/useFolderShareStatus", () => ({
  useFolderShareStatus: jest.fn(),
}));

jest.mock("../../components/CommentThread", () => {
  const { createElement } = require("react");
  const { Text } = require("react-native");
  return {
    CommentThread: ({ targetId, targetType }: { targetId: string; targetType: string }) =>
      createElement(Text, null, `Comments on ${targetType} ${targetId}`),
  };
});

const mockUseTrove = useTrove as jest.Mock;
const mockUseFolderShareStatus = useFolderShareStatus as jest.Mock;

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
  folderId: "trips",
  title: "List",
  type: "list",
  tagOptionIds: [],
  listItems: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const trips = makeFolder({ id: "trips", name: "Trips", icon: "✈️", purpose: "Places to go" });
const japan = makeFolder({ id: "japan", name: "Japan", parentFolderId: "trips" });
const italy = makeFolder({ id: "italy", name: "Italy", icon: "🍝", parentFolderId: "trips" });
const home = makeFolder({ id: "home", name: "Home" });
const folders = [trips, japan, italy, home];

const lists = [
  makeList({ id: "bucket", title: "Bucket list", updatedAt: "2026-02-01T10:00:00.000Z", listItems: [line("b1", "Kyoto", { checked: true }), line("b2", "Rome")] }),
  makeList({ id: "budget", title: "Budget", updatedAt: "2026-03-01T10:00:00.000Z" }),
  makeList({ id: "packing", title: "Packing", folderId: "japan" }),
  makeList({ id: "phrases", title: "Phrases", folderId: "japan" }),
  makeList({ id: "chores", title: "Chores", folderId: "home" }),
  makeList({ id: "groceries", title: "Groceries", folderId: "" }),
];

type Navigation = NativeStackScreenProps<RootStackParamList, "Folder">["navigation"];

const homeRoute = { key: "home-key", name: "Home" };
const folderRoute = (folderId: string) => ({ key: `folder-${folderId}`, name: "Folder", params: { folderId } });

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(),
  getState: jest.fn(),
};

const createItem = jest.fn();
const updateItem = jest.fn();
const deleteItem = jest.fn();
const deleteFolder = jest.fn();
const canManageFolder = jest.fn();
const canEditFolderContent = jest.fn();
const canEditItem = jest.fn();

type Setup = {
  folderId?: string;
  folders?: Folder[];
  items?: SavedItem[];
  listEntries?: ListEntry[];
  isReady?: boolean;
  // The screens under this one, bottom first.
  stack?: Array<{ key: string; name: string; params?: object }>;
};

const renderFolderScreen = async ({
  folderId = "trips",
  folders: currentFolders = folders,
  items = lists,
  listEntries = [],
  isReady = true,
  stack = [homeRoute],
}: Setup = {}) => {
  mockUseTrove.mockReturnValue({
    folders: currentFolders,
    isReady,
    items,
    listEntries,
    createItem,
    updateItem,
    deleteItem,
    deleteFolder,
    canManageFolder,
    canEditFolderContent,
    canEditItem,
  });
  const route = { key: `folder-${folderId}`, name: "Folder", params: { folderId } };
  navigation.getState.mockReturnValue({ routes: [...stack, route] });
  await renderScreen(
    <FolderScreen
      navigation={navigation as unknown as Navigation}
      route={route as unknown as NativeStackScreenProps<RootStackParamList, "Folder">["route"]}
    />,
  );
};

const listRowTitles = () =>
  screen.queryAllByHintText("Hold for more actions").map((row) => row.props.accessibilityLabel as string);

describe("FolderScreen", () => {
  let alertSpy: jest.SpyInstance;
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    navigation.canGoBack.mockReturnValue(true);
    canManageFolder.mockReturnValue(true);
    canEditFolderContent.mockReturnValue(true);
    canEditItem.mockReturnValue(true);
    mockUseFolderShareStatus.mockReturnValue({ isLoading: false, isShared: false });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    shareSpy.mockRestore();
  });

  describe("what a folder shows", () => {
    it("shows the folder's name and what it is for", async () => {
      await renderFolderScreen();

      expect(screen.getByRole("header", { name: "Trips" })).toBeTruthy();
      expect(screen.getByText("Places to go")).toBeTruthy();
    });

    it("lists what is kept directly in it, most recently changed first", async () => {
      await renderFolderScreen();

      expect(listRowTitles()).toEqual(["Budget", "Bucket list"]);
      expect(within(screen.getByLabelText("Bucket list")).getByLabelText("1 of 2 done")).toBeTruthy();
    });

    it("doesn't repeat the folder's own name under each list", async () => {
      await renderFolderScreen();

      expect(screen.queryByText("✈️ Trips")).toBeNull();
      expect(within(screen.getByLabelText("Budget")).getByText("No lines yet")).toBeTruthy();
    });

    it("shows its subfolders with how many lists each holds", async () => {
      await renderFolderScreen();

      expect(screen.getByLabelText("Japan, 2 lists")).toBeTruthy();
      expect(screen.getByLabelText("Italy, 0 lists")).toBeTruthy();
      expect(screen.queryByLabelText(/^Home,/)).toBeNull();
    });

    it("leaves the folders section out when there are no subfolders", async () => {
      await renderFolderScreen({ folderId: "japan", stack: [homeRoute, folderRoute("trips")] });

      expect(screen.queryByText("Folders")).toBeNull();
      expect(listRowTitles()).toEqual(["Packing", "Phrases"]);
    });

    it("says so when the folder has no lists", async () => {
      await renderFolderScreen({ folderId: "italy" });

      expect(screen.getByText("No lists here yet")).toBeTruthy();
      expect(screen.getByText("Tap the pencil to start one.")).toBeTruthy();
    });

    it("says the folder is gone when it no longer exists", async () => {
      await renderFolderScreen({ folderId: "deleted-elsewhere" });

      expect(screen.getByText("This folder isn't here any more.")).toBeTruthy();
      expect(screen.queryByLabelText("New list")).toBeNull();
      expect(screen.queryByLabelText("Folder options")).toBeNull();
    });

    it("waits for saved data before deciding the folder is gone", async () => {
      await renderFolderScreen({ isReady: false, folders: [], items: [] });

      expect(screen.queryByText("This folder isn't here any more.")).toBeNull();
      expect(screen.queryByLabelText("New list")).toBeNull();
    });
  });

  describe("getting around", () => {
    it("opens a list", async () => {
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Budget"));

      expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "budget" });
    });

    it("opens a subfolder on top of this one", async () => {
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Japan, 2 lists"));

      expect(navigation.push).toHaveBeenCalledWith("Folder", { folderId: "japan" });
    });

    it("names the screen that Back returns to", async () => {
      await renderFolderScreen();
      expect(within(screen.getByLabelText("Go back")).getByText("Trove")).toBeTruthy();
    });

    it("names the parent folder when it was opened from there", async () => {
      await renderFolderScreen({ folderId: "japan", stack: [homeRoute, folderRoute("trips")] });

      expect(within(screen.getByLabelText("Go back")).getByText("Trips")).toBeTruthy();

      await fireEvent.press(screen.getByLabelText("Go back"));
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("goes Home when there is nothing to go back to", async () => {
      navigation.canGoBack.mockReturnValue(false);
      await renderFolderScreen({ stack: [] });

      await fireEvent.press(screen.getByLabelText("Go back"));

      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith("Home");
    });
  });

  describe("starting a list", () => {
    it("creates a list in this folder with one tap and opens it ready to type", async () => {
      createItem.mockReturnValue(makeList({ id: "new-list", title: UNTITLED_LIST_TITLE }));
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("New list"));

      expect(createItem).toHaveBeenCalledWith({ folderId: "trips", title: UNTITLED_LIST_TITLE, type: "list", tagOptionIds: [] });
      expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "new-list", isNew: true });
    });

    it("stays put when the list could not be created", async () => {
      createItem.mockReturnValue(undefined);
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("New list"));

      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  describe("a folder someone else shared", () => {
    const shared = makeFolder({ id: "shared", name: "Wedding", accessRole: "viewer", ownerId: "someone-else" });

    beforeEach(() => {
      canManageFolder.mockReturnValue(false);
      canEditFolderContent.mockReturnValue(false);
    });

    it("says it is shared and view only, and offers no way to add a list", async () => {
      await renderFolderScreen({ folderId: "shared", folders: [shared], items: [] });

      expect(screen.getByText("Shared · Can view · View only")).toBeTruthy();
      expect(screen.getByText("Lists added to this folder show up here.")).toBeTruthy();
      expect(screen.queryByLabelText("New list")).toBeNull();
    });

    it("lets an editor add lists", async () => {
      canEditFolderContent.mockReturnValue(true);
      const editable = { ...shared, accessRole: "editor" as const };
      await renderFolderScreen({ folderId: "shared", folders: [editable], items: [] });

      expect(screen.getByText("Shared · Can edit")).toBeTruthy();
      expect(screen.getByLabelText("New list")).toBeTruthy();
    });

    it("only offers to see who has access and to send it as text", async () => {
      await renderFolderScreen({ folderId: "shared", folders: [shared], items: [] });

      await fireEvent.press(screen.getByLabelText("Folder options"));

      expect(screen.getByLabelText("See who has access")).toBeTruthy();
      expect(screen.getByLabelText("Send as text")).toBeTruthy();
      ["New subfolder", "Edit folder", "Share folder", "Delete folder"].forEach((label) => {
        expect(screen.queryByLabelText(label)).toBeNull();
      });

      await fireEvent.press(screen.getByLabelText("See who has access"));
      expect(navigation.navigate).toHaveBeenCalledWith("ShareFolder", { folderId: "shared" });
    });

    it("shows the folder's comments", async () => {
      await renderFolderScreen({ folderId: "shared", folders: [shared], items: [] });

      expect(screen.getByText("Comments on folder shared")).toBeTruthy();
    });
  });

  describe("comments", () => {
    it("are hidden on a folder that isn't shared", async () => {
      await renderFolderScreen();

      expect(screen.queryByText(/^Comments on/)).toBeNull();
      expect(mockUseFolderShareStatus).toHaveBeenCalledWith("trips");
    });

    it("show on a folder this person has shared with someone", async () => {
      mockUseFolderShareStatus.mockReturnValue({ isLoading: false, isShared: true });
      await renderFolderScreen();

      expect(screen.getByText("Comments on folder trips")).toBeTruthy();
    });
  });

  describe("folder options", () => {
    it("offers everything to the folder's owner", async () => {
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Folder options"));

      ["New subfolder", "Edit folder", "Share folder", "Send as text", "Delete folder"].forEach((label) => {
        expect(screen.getByLabelText(label)).toBeTruthy();
      });
      expect(screen.queryByLabelText("See who has access")).toBeNull();
    });

    it("starts a subfolder inside this folder", async () => {
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Folder options"));
      await fireEvent.press(screen.getByLabelText("New subfolder"));

      expect(navigation.navigate).toHaveBeenCalledWith("AddEditFolder", { parentFolderId: "trips" });
      expect(screen.queryByLabelText("New subfolder")).toBeNull();
    });

    it("doesn't offer a subfolder once folders are nested as deep as they go", async () => {
      const chain = ["a", "b", "c", "d", "e"].map((id, index, ids) =>
        makeFolder({ id, name: id.toUpperCase(), parentFolderId: index === 0 ? null : ids[index - 1] }),
      );
      await renderFolderScreen({ folderId: "e", folders: chain, items: [] });

      await fireEvent.press(screen.getByLabelText("Folder options"));

      expect(screen.queryByLabelText("New subfolder")).toBeNull();
      expect(screen.getByLabelText("Edit folder")).toBeTruthy();
    });

    it("opens the folder editor and sharing", async () => {
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Folder options"));
      await fireEvent.press(screen.getByLabelText("Edit folder"));
      expect(navigation.navigate).toHaveBeenCalledWith("AddEditFolder", { folderId: "trips" });

      await fireEvent.press(screen.getByLabelText("Folder options"));
      await fireEvent.press(screen.getByLabelText("Share folder"));
      expect(navigation.navigate).toHaveBeenCalledWith("ShareFolder", { folderId: "trips" });
    });

    it("sends the folder's contents as text", async () => {
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Folder options"));
      await fireEvent.press(screen.getByLabelText("Send as text"));

      await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
      expect(shareSpy.mock.calls[0][0].message).toBe(
        ["✈️ Trips", "Places to go", "Folders:\n- 🍝 Italy\n- 📁 Japan", "Lists:\n- Budget\n- Bucket list"].join("\n\n"),
      );
    });

    it("deletes the folder only after it is confirmed, then goes back", async () => {
      deleteFolder.mockResolvedValue({ ok: true });
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Folder options"));
      await fireEvent.press(screen.getByLabelText("Delete folder"));

      expect(deleteFolder).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        "Delete this folder?",
        "Its subfolders and every list inside them are deleted too.",
        expect.any(Array),
      );
      const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; style?: string; onPress?: () => void }>;
      expect(buttons.map((button) => button.text)).toEqual(["Cancel", "Delete"]);

      buttons[1].onPress?.();

      await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));
      expect(deleteFolder).toHaveBeenCalledWith("trips");
    });

    it("stays on the folder and says why when it could not be deleted", async () => {
      deleteFolder.mockResolvedValue({ ok: false, error: "You're offline." });
      await renderFolderScreen();

      await fireEvent.press(screen.getByLabelText("Folder options"));
      await fireEvent.press(screen.getByLabelText("Delete folder"));
      (alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>)[1].onPress?.();

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Could not delete folder", "You're offline."));
      expect(navigation.goBack).not.toHaveBeenCalled();
    });
  });

  describe("holding a list", () => {
    it("offers to move or delete it", async () => {
      await renderFolderScreen();

      await fireEvent(screen.getByLabelText("Budget"), "longPress");

      expect(within(screen.getByLabelText("Move to folder")).getByText("Trips")).toBeTruthy();
      expect(screen.getByLabelText("Delete list")).toBeTruthy();
    });

    it("offers nothing for a list this person can only view", async () => {
      canEditItem.mockReturnValue(false);
      await renderFolderScreen();

      await fireEvent(screen.getByLabelText("Budget"), "longPress");

      expect(screen.queryByLabelText("Delete list")).toBeNull();
    });
  });
});
