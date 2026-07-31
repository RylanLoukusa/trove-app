import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PickSomethingScreen } from "./index";
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

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "PickSomething">["navigation"];

const renderPickSomething = async (folders: Folder[], items: SavedItem[]) => {
  mockUseTrove.mockReturnValue({ folders, isReady: true, items });
  await renderScreen(<PickSomethingScreen navigation={navigation} route={{ params: undefined } as never} />);
};

describe("PickSomethingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows an empty state when there are no waiting items", async () => {
    await renderPickSomething([makeFolder({ id: "recipes", name: "Recipes" })], []);

    expect(screen.getByText("Nothing waiting here.")).toBeTruthy();
  });

  it("picks the only eligible waiting item", async () => {
    const folders = [makeFolder({ id: "recipes", name: "Recipes" })];
    const items = [
      makeItem({ id: "done-item", folderId: "recipes", title: "Already done", status: "done" }),
      makeItem({ id: "pasta", folderId: "recipes", title: "Pasta recipe", status: "waiting" }),
    ];

    await renderPickSomething(folders, items);

    expect(screen.getByText("Pasta recipe")).toBeTruthy();
    expect(screen.queryByText("Already done")).toBeNull();
  });

  it("narrows the pool to high-priority items only", async () => {
    const folders = [makeFolder({ id: "recipes", name: "Recipes" })];
    const items = [
      makeItem({ id: "low", folderId: "recipes", title: "Low priority idea", priority: "low" }),
    ];

    await renderPickSomething(folders, items);
    expect(screen.getByText("Low priority idea")).toBeTruthy();

    await fireEvent.press(screen.getByText("High priority only"));
    await fireEvent.press(screen.getByText("Pick for me"));

    expect(screen.getByText("Nothing waiting here.")).toBeTruthy();
  });

  it("narrows the pool to a specific folder", async () => {
    const folders = [
      makeFolder({ id: "recipes", name: "Recipes" }),
      makeFolder({ id: "travel", name: "Travel" }),
    ];
    const items = [makeItem({ id: "pasta", folderId: "recipes", title: "Pasta recipe" })];

    await renderPickSomething(folders, items);
    expect(screen.getByText("Pasta recipe")).toBeTruthy();

    await fireEvent.press(screen.getByText("Travel"));
    await fireEvent.press(screen.getByText("Pick for me"));

    expect(screen.getByText("Nothing waiting here.")).toBeTruthy();
  });
});
