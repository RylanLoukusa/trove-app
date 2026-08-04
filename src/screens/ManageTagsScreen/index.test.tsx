import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ManageTagsScreen } from "./index";
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
  id: "group-1",
  name: "Group",
  selectionMode: "multi",
  allowInlineCreate: true,
  isSystem: false,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makeOption = (overrides: Partial<TagOption>): TagOption => ({
  id: "option-1",
  groupId: "group-1",
  name: "Option",
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "ManageTags">["navigation"];

const updateTagGroup = jest.fn();

const route = { params: undefined } as unknown as NativeStackScreenProps<RootStackParamList, "ManageTags">["route"];

const renderManageTags = async (tagGroups: TagGroup[], tagOptions: TagOption[] = []) => {
  mockUseTrove.mockReturnValue({ tagGroups, tagOptions, updateTagGroup });
  await renderScreen(<ManageTagsScreen navigation={navigation} route={route} />);
};

describe("ManageTagsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows an empty state when there are no groups", async () => {
    await renderManageTags([]);

    expect(screen.getByText("No tag groups yet.")).toBeTruthy();
  });

  it("lists groups with their selection mode and option count", async () => {
    await renderManageTags(
      [makeGroup({ id: "status", name: "Status", selectionMode: "single", sortOrder: 0 })],
      [makeOption({ id: "o1", groupId: "status" }), makeOption({ id: "o2", groupId: "status" })],
    );

    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Single-select · 2 options")).toBeTruthy();
  });

  it("shows a Default badge for system groups", async () => {
    await renderManageTags([makeGroup({ id: "status", name: "Status", isSystem: true })]);

    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("navigates to the group when a row is pressed", async () => {
    await renderManageTags([makeGroup({ id: "status", name: "Status" })]);

    await fireEvent.press(screen.getByText("Status"));

    expect(navigation.navigate).toHaveBeenCalledWith("AddEditTagGroup", { groupId: "status" });
  });

  it("swaps sortOrder when moving a group down", async () => {
    await renderManageTags([
      makeGroup({ id: "status", name: "Status", sortOrder: 0 }),
      makeGroup({ id: "priority", name: "Priority", sortOrder: 1 }),
    ]);

    await fireEvent.press(screen.getByLabelText("Move Status down"));

    expect(updateTagGroup).toHaveBeenCalledWith("status", { sortOrder: 1 });
    expect(updateTagGroup).toHaveBeenCalledWith("priority", { sortOrder: 0 });
  });

  it("disables moving the first group up and the last group down", async () => {
    await renderManageTags([
      makeGroup({ id: "status", name: "Status", sortOrder: 0 }),
      makeGroup({ id: "priority", name: "Priority", sortOrder: 1 }),
    ]);

    expect(screen.getByLabelText("Move Status up").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("Move Priority down").props.accessibilityState.disabled).toBe(true);
  });

  it("navigates to a blank create screen when adding a group", async () => {
    await renderManageTags([]);

    await fireEvent.press(screen.getByText("Add group"));

    expect(navigation.navigate).toHaveBeenCalledWith("AddEditTagGroup");
  });
});
