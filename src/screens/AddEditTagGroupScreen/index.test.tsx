import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AddEditTagGroupScreen } from "./index";
import { useTrove } from "../../storage/storage";
import type { TagGroup, TagOption } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

const mockUseTrove = useTrove as jest.Mock;

const now = "2026-01-01T00:00:00.000Z";

const makeGroup = (overrides: Partial<TagGroup>): TagGroup => ({
  id: "status",
  name: "Status",
  selectionMode: "single",
  allowInlineCreate: true,
  isSystem: false,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makeOption = (overrides: Partial<TagOption>): TagOption => ({
  id: "option-1",
  groupId: "status",
  name: "Waiting",
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "AddEditTagGroup">["navigation"];

const updateTagGroup = jest.fn();
const deleteTagGroup = jest.fn();
const createTagOption = jest.fn();
const updateTagOption = jest.fn();
const deleteTagOption = jest.fn();

const renderGroup = async (groupId: string, tagGroups: TagGroup[], tagOptions: TagOption[] = []) => {
  mockUseTrove.mockReturnValue({
    tagGroups,
    tagOptions,
    updateTagGroup,
    deleteTagGroup,
    createTagOption,
    updateTagOption,
    deleteTagOption,
  });
  const route = { params: { groupId } } as unknown as NativeStackScreenProps<RootStackParamList, "AddEditTagGroup">["route"];
  await renderScreen(<AddEditTagGroupScreen navigation={navigation} route={route} />);
};

describe("AddEditTagGroupScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows a not-found state for a missing group", async () => {
    await renderGroup("missing", []);

    expect(screen.getByText("Tag group not found")).toBeTruthy();
  });

  it("renames the group as you type", async () => {
    await renderGroup("status", [makeGroup({})]);

    await fireEvent.changeText(screen.getByDisplayValue("Status"), "Progress");

    expect(updateTagGroup).toHaveBeenCalledWith("status", { name: "Progress" });
  });

  it("changes selection mode", async () => {
    await renderGroup("status", [makeGroup({ selectionMode: "single" })]);

    await fireEvent.press(screen.getByText("Single-select"));
    await fireEvent.press(screen.getByText("Multi-select"));

    expect(updateTagGroup).toHaveBeenCalledWith("status", { selectionMode: "multi" });
  });

  it("lists the group's options and adds a new one", async () => {
    await renderGroup("status", [makeGroup({})], [makeOption({ id: "o1", name: "Waiting" })]);

    expect(screen.getByDisplayValue("Waiting")).toBeTruthy();

    await fireEvent.press(screen.getByText("Add option"));

    expect(createTagOption).toHaveBeenCalledWith({ groupId: "status", name: "New option", sortOrder: 1 });
  });

  it("reorders options with the up/down buttons", async () => {
    await renderGroup(
      "status",
      [makeGroup({})],
      [makeOption({ id: "o1", name: "Waiting", sortOrder: 0 }), makeOption({ id: "o2", name: "Done", sortOrder: 1 })],
    );

    await fireEvent.press(screen.getByLabelText("Move Done up"));

    expect(updateTagOption).toHaveBeenCalledWith("o2", { sortOrder: 0 });
    expect(updateTagOption).toHaveBeenCalledWith("o1", { sortOrder: 1 });
  });

  it("deletes an option after confirming", async () => {
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderGroup("status", [makeGroup({})], [makeOption({ id: "o1", name: "Waiting" })]);

    await fireEvent.press(screen.getByLabelText("Delete Waiting"));

    expect(deleteTagOption).toHaveBeenCalledWith("o1");
  });

  it("deletes the group after confirming and goes back", async () => {
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderGroup("status", [makeGroup({})]);

    await fireEvent.press(screen.getByText("Delete group"));

    expect(deleteTagGroup).toHaveBeenCalledWith("status");
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
