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

const addListener = jest.fn();
const dispatch = jest.fn();
const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
  addListener,
  dispatch,
} as unknown as NativeStackScreenProps<RootStackParamList, "AddEditTagGroup">["navigation"];

const createTagGroup = jest.fn();
const updateTagGroup = jest.fn();
const deleteTagGroup = jest.fn();
const createTagOption = jest.fn();
const updateTagOption = jest.fn();
const deleteTagOption = jest.fn();

const renderWithParams = async (
  groupId: string | undefined,
  tagGroups: TagGroup[],
  tagOptions: TagOption[] = [],
) => {
  mockUseTrove.mockReturnValue({
    tagGroups,
    tagOptions,
    createTagGroup,
    updateTagGroup,
    deleteTagGroup,
    createTagOption,
    updateTagOption,
    deleteTagOption,
  });
  const route = { params: groupId ? { groupId } : undefined } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "AddEditTagGroup"
  >["route"];
  await renderScreen(<AddEditTagGroupScreen navigation={navigation} route={route} />);
};

const renderGroup = (groupId: string, tagGroups: TagGroup[], tagOptions: TagOption[] = []) =>
  renderWithParams(groupId, tagGroups, tagOptions);

const renderCreate = () => renderWithParams(undefined, []);

const getBeforeRemoveHandler = (): ((event: { preventDefault: () => void; data: { action: unknown } }) => void) => {
  const calls = addListener.mock.calls.filter(([event]) => event === "beforeRemove");
  const call = calls.at(-1);
  if (!call) throw new Error("beforeRemove listener was not registered");
  return call[1];
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

  describe("creating a new group", () => {
    it("shows Create Group as the title and button, with no Delete group button", async () => {
      await renderCreate();

      expect(screen.getAllByText("Create Group").length).toBeGreaterThan(0);
      expect(screen.queryByText("Edit group")).toBeNull();
      expect(screen.queryByText("Delete group")).toBeNull();
    });

    it("requires a name before creating", async () => {
      await renderCreate();

      await fireEvent.press(screen.getAllByText("Create Group").at(-1)!);

      expect(screen.getByText("Name is required.")).toBeTruthy();
      expect(createTagGroup).not.toHaveBeenCalled();
    });

    it("does not create anything until the button is pressed", async () => {
      await renderCreate();

      await fireEvent.changeText(screen.getByPlaceholderText("Group name"), "Room");
      await fireEvent.press(screen.getByText("Add option"));
      await fireEvent.changeText(screen.getByPlaceholderText("Option name"), "Kitchen");

      expect(createTagGroup).not.toHaveBeenCalled();
      expect(createTagOption).not.toHaveBeenCalled();
    });

    it("creates the group and its options on save", async () => {
      createTagGroup.mockReturnValue(makeGroup({ id: "new-group", name: "Room" }));
      await renderCreate();

      await fireEvent.changeText(screen.getByPlaceholderText("Group name"), "Room");
      await fireEvent.press(screen.getByText("Add option"));
      await fireEvent.changeText(screen.getByPlaceholderText("Option name"), "Kitchen");
      await fireEvent.press(screen.getAllByText("Create Group").at(-1)!);

      expect(createTagGroup).toHaveBeenCalledWith({
        name: "Room",
        selectionMode: "multi",
        allowInlineCreate: true,
        sortOrder: 0,
      });
      expect(createTagOption).toHaveBeenCalledWith({
        groupId: "new-group",
        name: "Kitchen",
        color: undefined,
        sortOrder: 0,
      });
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("skips blank option rows on save", async () => {
      createTagGroup.mockReturnValue(makeGroup({ id: "new-group", name: "Room" }));
      await renderCreate();

      await fireEvent.changeText(screen.getByPlaceholderText("Group name"), "Room");
      await fireEvent.press(screen.getByText("Add option"));
      await fireEvent.press(screen.getAllByText("Create Group").at(-1)!);

      expect(createTagOption).not.toHaveBeenCalled();
    });
  });

  describe("editing an existing group", () => {
    it("shows Edit group as the title and Save as the button", async () => {
      await renderGroup("status", [makeGroup({})]);

      expect(screen.getByText("Edit group")).toBeTruthy();
      expect(screen.getByText("Save")).toBeTruthy();
    });

    it("does not rename the group until Save is pressed", async () => {
      await renderGroup("status", [makeGroup({})]);

      await fireEvent.changeText(screen.getByDisplayValue("Status"), "Progress");

      expect(updateTagGroup).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByText("Save"));

      expect(updateTagGroup).toHaveBeenCalledWith("status", {
        name: "Progress",
        selectionMode: "single",
        allowInlineCreate: true,
      });
    });

    it("does not call updateTagGroup on save when nothing changed", async () => {
      await renderGroup("status", [makeGroup({})]);

      await fireEvent.press(screen.getByText("Save"));

      expect(updateTagGroup).not.toHaveBeenCalled();
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("stages a selection-mode change until Save is pressed", async () => {
      await renderGroup("status", [makeGroup({ selectionMode: "single" })]);

      await fireEvent.press(screen.getByText("Multi-select"));
      expect(updateTagGroup).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByText("Save"));

      expect(updateTagGroup).toHaveBeenCalledWith("status", expect.objectContaining({ selectionMode: "multi" }));
    });

    it("adds an option locally and creates it only on save", async () => {
      await renderGroup("status", [makeGroup({})], [makeOption({ id: "o1", name: "Waiting" })]);

      await fireEvent.press(screen.getByText("Add option"));
      expect(createTagOption).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getAllByPlaceholderText("Option name").at(-1)!, "Planned");
      await fireEvent.press(screen.getByText("Save"));

      expect(createTagOption).toHaveBeenCalledWith({ groupId: "status", name: "Planned", color: undefined, sortOrder: 1 });
    });

    it("reorders options locally and persists the new order on save", async () => {
      await renderGroup(
        "status",
        [makeGroup({})],
        [makeOption({ id: "o1", name: "Waiting", sortOrder: 0 }), makeOption({ id: "o2", name: "Done", sortOrder: 1 })],
      );

      await fireEvent.press(screen.getByLabelText("Move Done up"));
      expect(updateTagOption).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByText("Save"));

      expect(updateTagOption).toHaveBeenCalledWith("o2", { name: "Done", color: undefined, sortOrder: 0 });
      expect(updateTagOption).toHaveBeenCalledWith("o1", { name: "Waiting", color: undefined, sortOrder: 1 });
    });

    it("removes an option locally and deletes it only on save", async () => {
      await renderGroup("status", [makeGroup({})], [makeOption({ id: "o1", name: "Waiting" })]);

      await fireEvent.press(screen.getByLabelText("Delete Waiting"));
      expect(deleteTagOption).not.toHaveBeenCalled();
      expect(screen.queryByDisplayValue("Waiting")).toBeNull();

      await fireEvent.press(screen.getByText("Save"));

      expect(deleteTagOption).toHaveBeenCalledWith("o1");
    });

    it("deletes the group immediately after confirming", async () => {
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

  describe("unsaved-changes prompt on back navigation", () => {
    it("does not prompt when there are no unsaved changes", async () => {
      await renderGroup("status", [makeGroup({})]);

      const handler = getBeforeRemoveHandler();
      const preventDefault = jest.fn();
      handler({ preventDefault, data: { action: { type: "GO_BACK" } } });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("prompts and blocks navigation when there are unsaved changes", async () => {
      await renderGroup("status", [makeGroup({})]);
      await fireEvent.changeText(screen.getByDisplayValue("Status"), "Progress");

      const handler = getBeforeRemoveHandler();
      const preventDefault = jest.fn();
      const action = { type: "GO_BACK" };
      handler({ preventDefault, data: { action } });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it("discards changes and completes navigation when the user chooses Discard", async () => {
      await renderGroup("status", [makeGroup({})]);
      await fireEvent.changeText(screen.getByDisplayValue("Status"), "Progress");

      alertSpy.mockImplementation((_title, _message, buttons) => {
        const discard = Array.isArray(buttons)
          ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
          : undefined;
        discard?.onPress?.();
      });

      const action = { type: "GO_BACK" };
      getBeforeRemoveHandler()({ preventDefault: jest.fn(), data: { action } });

      expect(updateTagGroup).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith(action);
    });

    it("saves then completes navigation when the user chooses Save", async () => {
      await renderGroup("status", [makeGroup({})]);
      await fireEvent.changeText(screen.getByDisplayValue("Status"), "Progress");

      alertSpy.mockImplementation((_title, _message, buttons) => {
        const save = Array.isArray(buttons)
          ? (buttons as Array<{ text?: string; style?: string; onPress?: () => void }>).find(
              (button) => button.style !== "cancel" && button.style !== "destructive",
            )
          : undefined;
        save?.onPress?.();
      });

      const action = { type: "GO_BACK" };
      getBeforeRemoveHandler()({ preventDefault: jest.fn(), data: { action } });

      expect(updateTagGroup).toHaveBeenCalledWith("status", expect.objectContaining({ name: "Progress" }));
      expect(dispatch).toHaveBeenCalledWith(action);
    });
  });
});
