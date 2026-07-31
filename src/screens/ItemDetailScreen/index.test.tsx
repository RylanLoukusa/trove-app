import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ItemDetailScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useTrove } from "../../storage/storage";
import type { SavedItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;

const makeItem = (overrides: Partial<SavedItem>): SavedItem => ({
  id: "item-1",
  folderId: "recipes",
  title: "Item",
  type: "text",
  tags: [],
  status: "waiting",
  priority: "medium",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "ItemDetail">["navigation"];

const updateItem = jest.fn();
const deleteItem = jest.fn();
const canEditItem = jest.fn().mockReturnValue(true);

const renderItemDetail = async (items: SavedItem[], itemId = "pasta") => {
  mockUseAuth.mockReturnValue({ session: null });
  mockUseTrove.mockReturnValue({ folders: [], isReady: true, items, updateItem, deleteItem, canEditItem });
  const route = { params: { itemId } } as unknown as NativeStackScreenProps<RootStackParamList, "ItemDetail">["route"];
  await renderScreen(<ItemDetailScreen navigation={navigation} route={route} />);
};

describe("ItemDetailScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    canEditItem.mockReturnValue(true);
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows a not-found state for a missing item", async () => {
    await renderItemDetail([], "missing-item");

    expect(screen.getByText("Item not found")).toBeTruthy();
  });

  it("shows the item title and marks it done", async () => {
    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe" })]);

    expect(screen.getByText("Pasta recipe")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Mark as done"));

    expect(updateItem).toHaveBeenCalledWith("pasta", { status: "done" });
  });

  it("navigates to edit the item", async () => {
    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe" })]);

    await fireEvent.press(screen.getByLabelText("Edit item"));

    expect(navigation.navigate).toHaveBeenCalledWith("AddEditItem", { itemId: "pasta" });
  });

  it("hides edit actions without edit permission", async () => {
    canEditItem.mockReturnValue(false);
    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe" })]);

    expect(screen.queryByLabelText("Edit item")).toBeNull();
    expect(screen.queryByLabelText("Mark as done")).toBeNull();
    expect(screen.queryByLabelText("Delete item")).toBeNull();
  });

  it("deletes the item after confirming and goes home", async () => {
    deleteItem.mockResolvedValue({ ok: true });
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe" })]);
    await fireEvent.press(screen.getByLabelText("Delete item"));

    expect(deleteItem).toHaveBeenCalledWith("pasta");
    expect(navigation.navigate).toHaveBeenCalledWith("Home");
  });

  it("toggles a checklist item and completes the status when all are checked", async () => {
    const items = [
      makeItem({
        id: "shopping",
        title: "Shopping list",
        type: "list",
        listItems: [{ id: "li-1", kind: "check", text: "Eggs", checked: false }],
      }),
    ];

    await renderItemDetail(items, "shopping");
    await fireEvent.press(screen.getByLabelText("Mark checklist item complete"));

    expect(updateItem).toHaveBeenCalledWith(
      "shopping",
      expect.objectContaining({ status: "done" }),
    );
  });

  it("adds a new tag", async () => {
    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe", tags: ["dinner"] })]);

    await fireEvent.press(screen.getByLabelText("Add tag"));
    await fireEvent.changeText(screen.getByPlaceholderText("Add a tag"), "quick");
    await fireEvent(screen.getByPlaceholderText("Add a tag"), "submitEditing");

    expect(updateItem).toHaveBeenCalledWith("pasta", { tags: ["dinner", "quick"] });
  });

  it("navigates to search when a tag is pressed", async () => {
    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe", tags: ["dinner"] })]);

    await fireEvent.press(screen.getByText("dinner"));

    expect(navigation.navigate).toHaveBeenCalledWith("Search", { query: "dinner" });
  });
});
