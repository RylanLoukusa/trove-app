import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ItemDetailScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import type { SavedItem, TagGroup, TagOption } from "../../types/models";
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

jest.mock("../../onboarding/OnboardingTourContext", () => ({
  useOnboardingTour: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;
const mockUseEntitlement = useEntitlement as jest.Mock;
const mockUseOnboardingTour = useOnboardingTour as jest.Mock;

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

const now = "2026-01-01T00:00:00.000Z";

const tagsGroup: TagGroup = {
  id: "tags-group",
  name: "Tags",
  selectionMode: "multi",
  allowInlineCreate: true,
  isSystem: true,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};

const roomGroup: TagGroup = {
  id: "room-group",
  name: "Room",
  selectionMode: "single",
  allowInlineCreate: false,
  isSystem: false,
  sortOrder: 1,
  createdAt: now,
  updatedAt: now,
};

const makeTagOption = (id: string, name: string, groupId: string = tagsGroup.id): TagOption => ({
  id,
  groupId,
  name,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
});

const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "ItemDetail">["navigation"];

const updateItem = jest.fn();
const deleteItem = jest.fn();
const createTagOption = jest.fn((input: { groupId: string; name: string }) => makeTagOption(`new-${input.name}`, input.name));
const canEditItem = jest.fn().mockReturnValue(true);

const renderItemDetail = async (
  items: SavedItem[],
  itemId = "pasta",
  extra: { tagGroups?: TagGroup[]; tagOptions?: TagOption[] } = {},
) => {
  mockUseAuth.mockReturnValue({ session: null });
  mockUseTrove.mockReturnValue({
    folders: [],
    isReady: true,
    items,
    tagGroups: extra.tagGroups ?? [],
    tagOptions: extra.tagOptions ?? [],
    updateItem,
    createTagOption,
    deleteItem,
    canEditItem,
  });
  mockUseEntitlement.mockReturnValue({
    isPro: false,
    isLoading: false,
    presentPaywall: jest.fn(),
    restorePurchases: jest.fn(),
    setDevIsPro: jest.fn(),
  });
  const route = { params: { itemId } } as unknown as NativeStackScreenProps<RootStackParamList, "ItemDetail">["route"];
  await renderScreen(<ItemDetailScreen navigation={navigation} route={route} />);
};

describe("ItemDetailScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("shows a not-found state for a missing item", async () => {
    await renderItemDetail([], "missing-item");

    expect(screen.getByText("Item not found")).toBeTruthy();
  });

  it("shows the item title", async () => {
    await renderItemDetail([makeItem({ id: "pasta", title: "Pasta recipe" })]);

    expect(screen.getByText("Pasta recipe")).toBeTruthy();
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

  it("toggles a checklist item's checked state", async () => {
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
      expect.objectContaining({
        listItems: [{ id: "li-1", kind: "check", text: "Eggs", checked: true }],
      }),
    );
  });

  it("adds a new tag via the picker, creating a tag option in the Tags group", async () => {
    const dinnerOption = makeTagOption("tag-dinner", "dinner");
    await renderItemDetail(
      [makeItem({ id: "pasta", title: "Pasta recipe", tagOptionIds: [dinnerOption.id] })],
      "pasta",
      { tagGroups: [tagsGroup], tagOptions: [dinnerOption] },
    );

    await fireEvent.press(screen.getByLabelText("Add tags"));
    await fireEvent.changeText(screen.getByPlaceholderText("Search tags..."), "quick");
    await fireEvent.press(screen.getByText("Create “quick”"));

    expect(createTagOption).toHaveBeenCalledWith({ groupId: tagsGroup.id, name: "quick" });
    expect(updateItem).toHaveBeenCalledWith("pasta", { tagOptionIds: [dinnerOption.id, "new-quick"] });
  });

  it("removes a tag by toggling it off in the picker", async () => {
    const dinnerOption = makeTagOption("tag-dinner", "dinner");
    await renderItemDetail(
      [makeItem({ id: "pasta", title: "Pasta recipe", tagOptionIds: [dinnerOption.id] })],
      "pasta",
      { tagGroups: [tagsGroup], tagOptions: [dinnerOption] },
    );

    await fireEvent.press(screen.getByLabelText("Add tags"));
    await fireEvent.press(screen.getAllByText("dinner").at(-1)!);

    expect(updateItem).toHaveBeenCalledWith("pasta", { tagOptionIds: [] });
  });

  it("navigates to search when a tag is pressed", async () => {
    const dinnerOption = makeTagOption("tag-dinner", "dinner");
    await renderItemDetail(
      [makeItem({ id: "pasta", title: "Pasta recipe", tagOptionIds: [dinnerOption.id] })],
      "pasta",
      { tagGroups: [tagsGroup], tagOptions: [dinnerOption] },
    );

    await fireEvent.press(screen.getByText("dinner"));

    expect(navigation.navigate).toHaveBeenCalledWith("Search", { query: "dinner" });
  });

  it("shows a pill for a custom single-select group and lets you change it via the sheet", async () => {
    const kitchenOption = makeTagOption("room-kitchen", "Kitchen", roomGroup.id);
    const gardenOption = makeTagOption("room-garden", "Garden", roomGroup.id);
    await renderItemDetail(
      [makeItem({ id: "pasta", title: "Pasta recipe", tagOptionIds: [kitchenOption.id] })],
      "pasta",
      { tagGroups: [roomGroup], tagOptions: [kitchenOption, gardenOption] },
    );

    expect(screen.getByText("Kitchen")).toBeTruthy();

    await fireEvent.press(screen.getByText("Kitchen"));
    await fireEvent.press(screen.getByText("Garden"));

    expect(updateItem).toHaveBeenCalledWith("pasta", { tagOptionIds: ["room-garden"] });
  });

  it("shows a section for a custom multi-select group and lets you create an option", async () => {
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
    await renderItemDetail(
      [makeItem({ id: "pasta", title: "Pasta recipe", tagOptionIds: [] })],
      "pasta",
      { tagGroups: [projectsGroup], tagOptions: [] },
    );

    expect(screen.getByText("Projects")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Add projects"));
    await fireEvent.changeText(screen.getByPlaceholderText("Search projects..."), "Website");
    await fireEvent.press(screen.getByText("Create “Website”"));

    expect(createTagOption).toHaveBeenCalledWith({ groupId: "projects-group", name: "Website" });
  });
});
