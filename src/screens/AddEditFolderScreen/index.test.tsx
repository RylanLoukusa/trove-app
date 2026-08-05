import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AddEditFolderScreen } from "./index";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import type { Folder } from "../../types/models";
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

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "AddEditFolder">["navigation"];

const createFolder = jest.fn();
const updateFolder = jest.fn();
const canManageFolder = jest.fn().mockReturnValue(true);

const renderNewFolder = async (folders: Folder[] = []) => {
  mockUseTrove.mockReturnValue({ folders, createFolder, updateFolder, canManageFolder });
  const route = { params: { parentFolderId: null } } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "AddEditFolder"
  >["route"];
  await renderScreen(<AddEditFolderScreen navigation={navigation} route={route} />);
};

const renderEditFolder = async (folders: Folder[]) => {
  mockUseTrove.mockReturnValue({ folders, createFolder, updateFolder, canManageFolder });
  const route = { params: { folderId: folders[0].id } } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "AddEditFolder"
  >["route"];
  await renderScreen(<AddEditFolderScreen navigation={navigation} route={route} />);
};

describe("AddEditFolderScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    canManageFolder.mockReturnValue(true);
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

  it("creates a new folder with the entered name and navigates to it", async () => {
    createFolder.mockReturnValue(makeFolder({ id: "new-folder", name: "Groceries" }));
    await renderNewFolder();

    await fireEvent.changeText(screen.getByPlaceholderText("Weekend Ideas"), "Groceries");
    await fireEvent.press(screen.getByText("Save folder"));

    expect(createFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Groceries", parentFolderId: null }),
    );
    expect(navigation.replace).toHaveBeenCalledWith("Folder", { folderId: "new-folder" });
  });

  it("pre-fills the form when editing an existing folder", async () => {
    await renderEditFolder([makeFolder({ id: "recipes", name: "Recipes", purpose: "Dinner ideas" })]);

    expect(screen.getByDisplayValue("Recipes")).toBeTruthy();
    expect(screen.getByDisplayValue("Dinner ideas")).toBeTruthy();
    expect(screen.getByText("Edit folder")).toBeTruthy();
  });

  it("saves edits to an existing folder and goes back", async () => {
    await renderEditFolder([makeFolder({ id: "recipes", name: "Recipes" })]);

    await fireEvent.changeText(screen.getByDisplayValue("Recipes"), "Recipes Updated");
    await fireEvent.press(screen.getByText("Save folder"));

    expect(updateFolder).toHaveBeenCalledWith(
      "recipes",
      expect.objectContaining({ name: "Recipes Updated" }),
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("blocks editing when the user cannot manage the folder", async () => {
    canManageFolder.mockReturnValue(false);
    await renderEditFolder([makeFolder({ id: "recipes", name: "Recipes" })]);

    await fireEvent.press(screen.getByText("Save folder"));

    expect(updateFolder).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "Cannot edit folder",
      "Only the folder owner can edit this folder.",
    );
  });

  it("updates the icon when an emoji is selected", async () => {
    await renderNewFolder();

    await fireEvent.press(screen.getByLabelText("Choose folder icon"));
    await fireEvent.press(screen.getByLabelText("Use 👍 as folder icon"));
    await fireEvent.press(screen.getByText("Save folder"));

    expect(createFolder).toHaveBeenCalledWith(expect.objectContaining({ icon: "👍" }));
  });

  it("updates the color when a swatch is selected", async () => {
    await renderNewFolder();

    await fireEvent.press(screen.getByLabelText("Use folder color #7EBEA6"));
    await fireEvent.press(screen.getByText("Save folder"));

    expect(createFolder).toHaveBeenCalledWith(expect.objectContaining({ color: "#7EBEA6" }));
  });
});
