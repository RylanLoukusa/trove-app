import React from "react";
import { fireEvent, screen, within } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SearchScreen } from "./index";
import { useTrove } from "../../storage/storage";
import type { Folder, ListEntry, SavedItem, SavedListItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";
import { UNTITLED_LIST_TITLE } from "../../utils/listEntries";

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

const mockUseTrove = useTrove as jest.Mock;

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

const folders: Folder[] = [
  makeFolder({ id: "garden", name: "Garden", icon: "🌱", purpose: "What to plant, and when" }),
  makeFolder({ id: "trips", name: "Trips" }),
];

const lists: SavedItem[] = [
  makeList({
    id: "groceries",
    title: "Groceries",
    updatedAt: "2026-03-01T10:00:00.000Z",
    listItems: [line("g1", "Milk", { checked: true }), line("g2", "Garden salad kit"), line("g3", "Bread")],
  }),
  makeList({
    id: "beds",
    title: "Garden beds",
    folderId: "garden",
    updatedAt: "2026-03-03T10:00:00.000Z",
    listItems: [line("b1", "Tomatoes", { kind: "bullet" })],
  }),
  makeList({
    id: "packing",
    title: "Packing",
    folderId: "trips",
    updatedAt: "2026-03-02T10:00:00.000Z",
    listItems: [line("p1", "Gardening gloves for Mum", { kind: "text" })],
  }),
  makeList({
    id: "unnamed",
    title: UNTITLED_LIST_TITLE,
    updatedAt: "2026-01-15T10:00:00.000Z",
    listItems: [line("u1", "Call the plumber")],
  }),
];

type Navigation = NativeStackScreenProps<RootStackParamList, "Search">["navigation"];
type Route = NativeStackScreenProps<RootStackParamList, "Search">["route"];

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(),
  getState: jest.fn(),
};

type Setup = {
  query?: string;
  isReady?: boolean;
  items?: SavedItem[];
  listEntries?: ListEntry[];
};

const renderSearchScreen = async ({ query, isReady = true, items = lists, listEntries = [] }: Setup = {}) => {
  mockUseTrove.mockReturnValue({ folders, isReady, items, listEntries });
  const route = { key: "search-key", name: "Search", params: query === undefined ? undefined : { query } };
  navigation.getState.mockReturnValue({ routes: [{ key: "home-key", name: "Home" }, route] });
  await renderScreen(<SearchScreen navigation={navigation as unknown as Navigation} route={route as unknown as Route} />);
};

const search = async (text: string) => {
  await fireEvent.changeText(screen.getByLabelText("Search"), text);
};

// Rows that open a list, in the order shown.
const rowLabels = () =>
  screen
    .getAllByRole("button")
    .map((row) => row.props.accessibilityLabel as string)
    .filter((label) => !["Go back", "Clear search"].includes(label));

describe("SearchScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    navigation.canGoBack.mockReturnValue(true);
  });

  describe("before anything is typed", () => {
    it("offers the lists changed most recently", async () => {
      await renderSearchScreen();

      expect(screen.getByText("Recent")).toBeTruthy();
      expect(rowLabels()).toEqual(["Garden beds", "Packing", "Groceries", "Call the plumber"]);
      expect(screen.queryByLabelText("Clear search")).toBeNull();
    });

    it("keeps the recent lists to a handful", async () => {
      const many = Array.from({ length: 12 }, (_, index) =>
        makeList({ id: `list-${index}`, title: `List ${index}`, updatedAt: `2026-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` }),
      );
      await renderSearchScreen({ items: many });

      expect(rowLabels()).toHaveLength(8);
      expect(rowLabels()[0]).toBe("List 11");
    });

    it("opens a recent list", async () => {
      await renderSearchScreen();

      await fireEvent.press(screen.getByLabelText("Packing"));

      expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "packing" });
    });

    it("explains itself when there are no lists yet", async () => {
      await renderSearchScreen({ items: [] });

      expect(screen.getByText("Your lists and their lines show up here as you type.")).toBeTruthy();
      expect(screen.queryByText("Recent")).toBeNull();
    });

    it("shows nothing until saved data has loaded", async () => {
      await renderSearchScreen({ isReady: false });

      expect(screen.queryByText("Recent")).toBeNull();
      expect(screen.getByLabelText("Search")).toBeTruthy();
    });
  });

  describe("searching", () => {
    it("finds folders, lists and single lines at once", async () => {
      await renderSearchScreen();

      await search("garden");

      expect(screen.getByText("Folders")).toBeTruthy();
      expect(screen.getByText("Lists")).toBeTruthy();
      expect(screen.getByText("Lines")).toBeTruthy();
      expect(rowLabels()).toEqual([
        "Garden, 1 list",
        "Garden beds",
        "Garden salad kit, on Groceries",
        "Gardening gloves for Mum, on Packing",
      ]);
      expect(screen.queryByText("Recent")).toBeNull();
    });

    it("says which folder a found list is kept in", async () => {
      await renderSearchScreen();

      await search("garden beds");

      expect(within(screen.getByLabelText("Garden beds")).getByText("🌱 Garden")).toBeTruthy();
    });

    it("shows a found line with the match picked out and the list it is on", async () => {
      await renderSearchScreen();

      await search("salad");

      const row = within(screen.getByLabelText("Garden salad kit, on Groceries"));
      expect(row.getByText("salad")).toBeTruthy();
      expect(row.getByText("Groceries")).toBeTruthy();
      expect(screen.queryByText("Folders")).toBeNull();
      expect(screen.queryByText("Lists")).toBeNull();
    });

    it("opens the list a found line is on", async () => {
      await renderSearchScreen();

      await search("salad");
      await fireEvent.press(screen.getByLabelText("Garden salad kit, on Groceries"));

      expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "groceries" });
    });

    it("opens a found folder", async () => {
      await renderSearchScreen();

      await search("plant");
      await fireEvent.press(screen.getByLabelText("Garden, 1 list"));

      expect(navigation.navigate).toHaveBeenCalledWith("Folder", { folderId: "garden" });
    });

    it("finds an unnamed list by the line it is shown as", async () => {
      await renderSearchScreen();

      await search("plumber");

      expect(rowLabels()).toEqual(["Call the plumber"]);
      expect(screen.queryByText("Lines")).toBeNull();
    });

    it("says so when nothing matches", async () => {
      await renderSearchScreen();

      await search("  zebra ");

      expect(screen.getByText("Nothing matches “zebra”.")).toBeTruthy();
      expect(rowLabels()).toEqual([]);
    });

    it("goes back to the recent lists when the search is cleared", async () => {
      await renderSearchScreen();

      await search("zebra");
      await fireEvent.press(screen.getByLabelText("Clear search"));

      expect(screen.getByText("Recent")).toBeTruthy();
      expect(screen.getByLabelText("Search").props.value).toBe("");
    });

    it("starts with a search that was passed in", async () => {
      await renderSearchScreen({ query: "bread" });

      expect(screen.getByLabelText("Search").props.value).toBe("bread");
      expect(rowLabels()).toEqual(["Bread, on Groceries"]);
    });
  });

  describe("going back", () => {
    it("names the screen it returns to", async () => {
      await renderSearchScreen();

      expect(within(screen.getByLabelText("Go back")).getByText("Trove")).toBeTruthy();

      await fireEvent.press(screen.getByLabelText("Go back"));
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("goes Home when there is nothing to go back to", async () => {
      navigation.canGoBack.mockReturnValue(false);
      await renderSearchScreen();

      await fireEvent.press(screen.getByLabelText("Go back"));

      expect(navigation.navigate).toHaveBeenCalledWith("Home");
    });
  });
});
