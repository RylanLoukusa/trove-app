import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FolderScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
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

jest.mock("../../onboarding/OnboardingTourContext", () => ({
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
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "Folder">["navigation"];

const updateItem = jest.fn();
const deleteFolder = jest.fn();
const canManageFolder = jest.fn().mockReturnValue(true);
const canEditFolderContent = jest.fn().mockReturnValue(true);
const canEditItem = jest.fn().mockReturnValue(true);

const renderFolderScreen = async (folders: Folder[], items: SavedItem[], folderId = "recipes") => {
  mockUseAuth.mockReturnValue({ session: null });
  mockUseTrove.mockReturnValue({
    folders,
    isReady: true,
    items,
    tagOptions: [],
    updateItem,
    deleteFolder,
    canManageFolder,
    canEditFolderContent,
    canEditItem,
  });
  const route = { params: { folderId } } as unknown as NativeStackScreenProps<RootStackParamList, "Folder">["route"];
  await renderScreen(<FolderScreen navigation={navigation} route={route} />);
};

describe("FolderScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    canManageFolder.mockReturnValue(true);
    canEditFolderContent.mockReturnValue(true);
    canEditItem.mockReturnValue(true);
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseEntitlement.mockReturnValue({
      isPro: true,
      isLoading: false,
      presentPaywall: jest.fn(),
      restorePurchases: jest.fn(),
      setDevIsPro: jest.fn(),
    });
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

  it("shows a not-found state for a missing folder", async () => {
    await renderFolderScreen([], [], "missing-folder");

    expect(screen.getByText("Folder not found")).toBeTruthy();
  });

  it("shows the folder's items and subfolders", async () => {
    const folders = [
      makeFolder({ id: "recipes", name: "Recipes" }),
      makeFolder({ id: "desserts", name: "Desserts", parentFolderId: "recipes" }),
    ];
    const items = [makeItem({ id: "pasta", folderId: "recipes", title: "Pasta recipe" })];

    await renderFolderScreen(folders, items);

    expect(screen.getByText("Pasta recipe")).toBeTruthy();
    expect(screen.getByText("Desserts")).toBeTruthy();
  });

  it("toggles a checklist item's checked state", async () => {
    const folders = [makeFolder({ id: "recipes", name: "Recipes" })];
    const items = [
      makeItem({
        id: "shopping",
        folderId: "recipes",
        title: "Shopping list",
        type: "list",
        listItems: [{ id: "li-1", kind: "check", text: "Eggs", checked: false }],
      }),
    ];

    await renderFolderScreen(folders, items);

    await fireEvent.press(screen.getByLabelText("Mark checklist item complete"));

    expect(updateItem).toHaveBeenCalledWith(
      "shopping",
      expect.objectContaining({
        listItems: [{ id: "li-1", kind: "check", text: "Eggs", checked: true }],
      }),
    );
  });

  it("blocks toggling a checklist item without edit access", async () => {
    canEditItem.mockReturnValue(false);
    const folders = [makeFolder({ id: "recipes", name: "Recipes" })];
    const items = [
      makeItem({
        id: "shopping",
        folderId: "recipes",
        title: "Shopping list",
        type: "list",
        listItems: [{ id: "li-1", kind: "check", text: "Eggs", checked: false }],
      }),
    ];

    await renderFolderScreen(folders, items);
    await fireEvent.press(screen.getByLabelText("Mark checklist item complete"));

    expect(updateItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Cannot edit item", "You do not have permission to edit this item.");
  });

  it("disables adding an item without folder edit access", async () => {
    canEditFolderContent.mockReturnValue(false);
    await renderFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], []);

    await fireEvent.press(screen.getByText("View only"));

    expect(navigation.navigate).not.toHaveBeenCalledWith("AddEditItem", expect.anything());
  });

  it("deletes the folder after confirming and returns home", async () => {
    deleteFolder.mockResolvedValue({ ok: true });
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], []);
    await fireEvent.press(screen.getByLabelText("More folder actions"));

    const menuButtons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    menuButtons.find((button) => button.text === "Delete folder")?.onPress?.();

    expect(deleteFolder).toHaveBeenCalledWith("recipes");
  });
});
