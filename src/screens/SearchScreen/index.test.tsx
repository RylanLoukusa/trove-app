import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SearchScreen } from "./index";
import { useTrove } from "../../storage/storage";
import type { Folder, SavedItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

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

const makeItem = (overrides: Partial<SavedItem>): SavedItem => ({
  id: "item-1",
  folderId: "folder-1",
  title: "Item",
  type: "link",
  tags: [],
  status: "waiting",
  priority: "medium",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const folders: Folder[] = [
  makeFolder({ id: "recipes", name: "Recipes" }),
  makeFolder({ id: "travel", name: "Travel plans" }),
];

const items: SavedItem[] = [
  makeItem({ id: "pasta", folderId: "recipes", title: "Pasta recipe" }),
  makeItem({ id: "flights", folderId: "travel", title: "Flight bookings" }),
];

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "Search">["navigation"];

const renderSearchScreen = async (routeParams?: { query?: string }) => {
  mockUseTrove.mockReturnValue({ folders, isReady: true, items });
  const route = { params: routeParams } as NativeStackScreenProps<RootStackParamList, "Search">["route"];
  await renderScreen(<SearchScreen navigation={navigation} route={route} />);
};

describe("SearchScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows recent folders and items when there is no query", async () => {
    await renderSearchScreen();

    expect(screen.getAllByText("Recipes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Travel plans").length).toBeGreaterThan(0);
    expect(screen.getByText("Pasta recipe")).toBeTruthy();
    expect(screen.getByText("Flight bookings")).toBeTruthy();
  });

  it("filters results down to matches for the typed query", async () => {
    await renderSearchScreen();

    await fireEvent.changeText(screen.getByPlaceholderText("Folders, titles, tags, URLs..."), "pasta");

    expect(screen.getByText("Pasta recipe")).toBeTruthy();
    expect(screen.queryByText("Flight bookings")).toBeNull();
    expect(screen.queryByText("Travel plans")).toBeNull();
  });

  it("shows an empty state when nothing matches the query", async () => {
    await renderSearchScreen();

    await fireEvent.changeText(screen.getByPlaceholderText("Folders, titles, tags, URLs..."), "nonexistent thing");

    expect(screen.getByText("No matches found.")).toBeTruthy();
  });

  it("restricts results to folders only when the Folders filter is selected", async () => {
    await renderSearchScreen();

    await fireEvent.press(screen.getByText(/^Folders \d/));

    expect(screen.getByText("Recipes")).toBeTruthy();
    expect(screen.queryByText("Pasta recipe")).toBeNull();
  });

  it("clears the query when Clear search is pressed", async () => {
    await renderSearchScreen();

    await fireEvent.changeText(screen.getByPlaceholderText("Folders, titles, tags, URLs..."), "pasta");
    expect(screen.queryByText("Flight bookings")).toBeNull();

    await fireEvent.press(screen.getByText("Clear search"));

    expect(screen.getByText("Flight bookings")).toBeTruthy();
  });

  it("pre-fills the query from route params", async () => {
    await renderSearchScreen({ query: "flight" });

    expect(screen.getByText("Flight bookings")).toBeTruthy();
    expect(screen.queryByText("Pasta recipe")).toBeNull();
  });
});
