import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AddEditItemScreen } from "./index";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import type { Folder, SavedItem, TagGroup, TagOption } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../onboarding/OnboardingTourContext", () => ({
  useOnboardingTour: jest.fn(),
}));

const mockUseTrove = useTrove as jest.Mock;
const mockUseOnboardingTour = useOnboardingTour as jest.Mock;

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
  folderId: "recipes",
  title: "Item",
  type: "text",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "AddEditItem">["navigation"];

const folders: Folder[] = [makeFolder({ id: "recipes", name: "Recipes" })];
const createItem = jest.fn();
const updateItem = jest.fn();
const createTagOption = jest.fn();
const canEditFolderContent = jest.fn().mockReturnValue(true);
const canEditItem = jest.fn().mockReturnValue(true);

const renderNewItem = async (routeFolders: Folder[] = folders, items: SavedItem[] = []) => {
  mockUseTrove.mockReturnValue({
    folders: routeFolders,
    items,
    tagGroups: [],
    tagOptions: [],
    createItem,
    updateItem,
    createTagOption,
    canEditFolderContent,
    canEditItem,
  });
  const route = { params: undefined } as unknown as NativeStackScreenProps<RootStackParamList, "AddEditItem">["route"];
  await renderScreen(<AddEditItemScreen navigation={navigation} route={route} />);
};

const renderEditItem = async (items: SavedItem[]) => {
  mockUseTrove.mockReturnValue({
    folders,
    items,
    tagGroups: [],
    tagOptions: [],
    createItem,
    updateItem,
    createTagOption,
    canEditFolderContent,
    canEditItem,
  });
  const route = { params: { itemId: items[0].id } } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "AddEditItem"
  >["route"];
  await renderScreen(<AddEditItemScreen navigation={navigation} route={route} />);
};

describe("AddEditItemScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    canEditFolderContent.mockReturnValue(true);
    canEditItem.mockReturnValue(true);
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseOnboardingTour.mockReturnValue({
      currentStep: undefined,
      stepNumber: 0,
      totalSteps: 0,
      stepTargetFolderId: null,
      next: jest.fn(),
      skip: jest.fn(),
      advance: jest.fn(),
      reportFocus: jest.fn(),
      maybeStart: jest.fn(),
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("requires a title before saving", async () => {
    await renderNewItem();

    await fireEvent.press(screen.getByText("Save item"));

    expect(screen.getByText("Title is required.")).toBeTruthy();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("creates a new text item and opens its detail screen", async () => {
    createItem.mockReturnValue(makeItem({ id: "new-item", title: "Grocery list idea" }));
    await renderNewItem();

    await fireEvent.changeText(screen.getByPlaceholderText("What are you saving?"), "Grocery list idea");
    await fireEvent.press(screen.getByText("Note"));
    await fireEvent.press(screen.getByText("Save item"));

    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Grocery list idea", type: "text", folderId: "recipes" }),
    );
    expect(navigation.replace).toHaveBeenCalledWith("ItemDetail", { itemId: "new-item" });
  });

  it("requires a type before saving", async () => {
    await renderNewItem();

    await fireEvent.changeText(screen.getByPlaceholderText("What are you saving?"), "Grocery list idea");
    await fireEvent.press(screen.getByText("Save item"));

    expect(screen.getByText("Choose a type.")).toBeTruthy();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("saves a link item with the entered URL", async () => {
    createItem.mockReturnValue(makeItem({ id: "new-link", title: "Cool article" }));
    await renderNewItem();

    await fireEvent.changeText(screen.getByPlaceholderText("What are you saving?"), "Cool article");
    await fireEvent.press(screen.getByText("Link"));
    await fireEvent.changeText(screen.getByPlaceholderText("https://example.com"), "https://example.com/article");
    await fireEvent.press(screen.getByText("Save item"));

    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: "link", url: "https://example.com/article" }),
    );
  });

  it("blocks saving to a folder without edit access", async () => {
    canEditFolderContent.mockReturnValue(false);
    await renderNewItem();

    await fireEvent.changeText(screen.getByPlaceholderText("What are you saving?"), "Grocery list idea");
    await fireEvent.press(screen.getByText("Note"));
    await fireEvent.press(screen.getByText("Save item"));

    expect(createItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Cannot save item", "Choose a folder where you have edit access.");
  });

  it("pre-fills the form when editing and saves changes", async () => {
    await renderEditItem([makeItem({ id: "pasta", title: "Pasta recipe", type: "text", description: "So good" })]);

    expect(screen.getByDisplayValue("Pasta recipe")).toBeTruthy();
    expect(screen.getByText("Edit item")).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue("Pasta recipe"), "Pasta recipe v2");
    await fireEvent.press(screen.getByText("Save item"));

    expect(updateItem).toHaveBeenCalledWith("pasta", expect.objectContaining({ title: "Pasta recipe v2" }));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("blocks editing an item without permission", async () => {
    canEditItem.mockReturnValue(false);
    await renderEditItem([makeItem({ id: "pasta", title: "Pasta recipe" })]);

    await fireEvent.press(screen.getByText("Save item"));

    expect(updateItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Cannot edit item", "You do not have permission to edit this item.");
  });

  it("shows and saves selections for custom single-select and multi-select groups", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const roomGroup: TagGroup = {
      id: "room-group",
      name: "Room",
      selectionMode: "single",
      allowInlineCreate: false,
      isSystem: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const kitchenOption: TagOption = { id: "room-kitchen", groupId: "room-group", name: "Kitchen", sortOrder: 0, createdAt: now, updatedAt: now };
    const projectsGroup: TagGroup = {
      id: "projects-group",
      name: "Projects",
      selectionMode: "multi",
      allowInlineCreate: true,
      isSystem: false,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    createTagOption.mockReturnValue({
      id: "projects-website",
      groupId: "projects-group",
      name: "Website",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    createItem.mockReturnValue(makeItem({ id: "new-item", title: "New item" }));

    mockUseTrove.mockReturnValue({
      folders,
      items: [],
      tagGroups: [roomGroup, projectsGroup],
      tagOptions: [kitchenOption],
      createItem,
      updateItem,
      createTagOption,
      canEditFolderContent,
      canEditItem,
    });
    const route = { params: undefined } as unknown as NativeStackScreenProps<RootStackParamList, "AddEditItem">["route"];
    await renderScreen(<AddEditItemScreen navigation={navigation} route={route} />);

    await fireEvent.changeText(screen.getByPlaceholderText("What are you saving?"), "New item");
    await fireEvent.press(screen.getByText("Note"));
    await fireEvent.press(screen.getAllByText("+ Add")[0]);
    await fireEvent.press(screen.getByText("Kitchen"));

    await fireEvent.press(screen.getByText("+ Add"));
    await fireEvent.changeText(screen.getByPlaceholderText("Search projects..."), "Website");
    await fireEvent.press(screen.getByText("Create “Website”"));

    await fireEvent.press(screen.getByText("Save item"));

    expect(createTagOption).toHaveBeenCalledWith({ groupId: "projects-group", name: "Website" });
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ tagOptionIds: expect.arrayContaining(["room-kitchen", "projects-website"]) }),
    );
  });
});
