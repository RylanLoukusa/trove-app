import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ListEntriesView } from "./ListEntriesView";
import { renderScreen } from "../test-utils/renderScreen";
import type { ListEntry, TagOption } from "../types/models";

// Stand-in for the swipe gesture: a button that "completes" the swipe.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const React = jest.requireActual("react");
  const { Pressable, Text, View } = jest.requireActual("react-native");
  const MockSwipeable = React.forwardRef(
    (
      {
        children,
        onSwipeableOpen,
        renderLeftActions,
        renderRightActions,
      }: {
        children: React.ReactNode;
        onSwipeableOpen: (direction: string) => void;
        renderLeftActions?: () => React.ReactNode;
        renderRightActions?: () => React.ReactNode;
      },
      _ref: unknown,
    ) => (
      <View>
        {!!renderLeftActions && (
          <Pressable accessibilityLabel="Simulate swipe" onPress={() => onSwipeableOpen("right")}>
            <Text>swipe</Text>
          </Pressable>
        )}
        {children}
        {renderRightActions?.()}
      </View>
    ),
  );
  return { __esModule: true, default: MockSwipeable };
});

const high: TagOption = { id: "high", groupId: "priority", name: "High", color: "#D98A8A", sortOrder: 2, createdAt: "", updatedAt: "" };
const low: TagOption = { ...high, id: "low", name: "Low", sortOrder: 0 };

const entry = (id: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "list-1",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: id,
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const handlers = {
  onToggleEntry: jest.fn(),
  onUpdateEntry: jest.fn(),
  onMoveEntry: jest.fn(),
  onInsertEntries: jest.fn((_after: string | null, lines: unknown[]) => lines.map((_, index) => `new-${index}`)),
  onDeleteEntry: jest.fn(),
};

const renderList = (entries: ListEntry[], canEdit = true) =>
  renderScreen(
    <ListEntriesView listId="list-1" entries={entries} priorityOptions={[low, high]} canEdit={canEdit} {...handlers} />,
  );

const openDetails = async (text: string) => {
  await fireEvent(screen.getByLabelText(text), "focus");
  await fireEvent.press(screen.getByLabelText("Line details"));
};

const visibleTexts = () =>
  screen.getAllByTestId("list-line-input").map((input) => input.props.value);

describe("ListEntriesView", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("puts completed items at the bottom by default and shows progress", async () => {
    await renderList([entry("Florist", { checked: true }), entry("Cake")]);

    expect(visibleTexts()).toEqual(["Cake", "Florist"]);
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
  });

  it("sorts by priority when chosen and remembers it for the list", async () => {
    await renderList([entry("a", { text: "Cake" }), entry("b", { text: "Florist", tagOptionIds: ["high"] })]);

    await fireEvent.press(screen.getByLabelText("Sort by My order"));
    await fireEvent.press(screen.getByText("Priority"));

    expect(visibleTexts()).toEqual(["Florist", "Cake"]);
    expect(screen.getByText("High")).toBeTruthy();
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem("trove:listView:list-1"))!)).toMatchObject({ sortMode: "priority" }),
    );
    // Dragging still works; dropping a line switches back to your own order.
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(2);
  });

  it("hides completed items and offers to show them again", async () => {
    await renderList([entry("Florist", { checked: true }), entry("Cake")]);

    await fireEvent.press(screen.getByLabelText("Completed items: Move to bottom"));
    await fireEvent.press(screen.getByText("Hide"));

    expect(visibleTexts()).toEqual(["Cake"]);
    await fireEvent.press(screen.getByText("1 completed item hidden · Show"));
    expect(visibleTexts()).toEqual(["Cake", "Florist"]);
  });

  it("adds an item from the new item line with Return and keeps typing there", async () => {
    await renderList([entry("Cake")]);

    await fireEvent.changeText(screen.getByLabelText("Add an item to this list"), "  Venue \n");

    expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Venue", checked: false, indentLevel: 0 }]);
    expect(screen.getByLabelText("Add an item to this list").props.value).toBe("");
  });

  it("adds one line per row when several lines are pasted, with undo", async () => {
    await renderList([entry("Cake")]);

    await fireEvent.changeText(screen.getByLabelText("Add an item to this list"), "- Milk\n- Eggs\n- [x] Bread");

    expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [
      { text: "Milk", checked: false, indentLevel: 0 },
      { text: "Eggs", checked: false, indentLevel: 0 },
      { text: "Bread", checked: true, indentLevel: 0 },
    ]);
    expect(screen.getByText("Added 3 items")).toBeTruthy();
    await fireEvent.press(screen.getByText("Undo"));
    expect(handlers.onDeleteEntry.mock.calls.map((call) => call[0])).toEqual(["new-0", "new-1", "new-2"]);
  });

  it("edits a line's text in place", async () => {
    await renderList([entry("Cake")]);

    await fireEvent(screen.getByLabelText("Cake"), "focus");
    await fireEvent.changeText(screen.getByLabelText("Cake"), "Carrot cake");
    await fireEvent(screen.getByLabelText("Cake"), "blur");

    expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Cake", { text: "Carrot cake" });
  });

  it("starts a new line right below on Return, with the same indent", async () => {
    await renderList([entry("Cake", { indentLevel: 1 }), entry("Venue")]);

    await fireEvent(screen.getByLabelText("Cake"), "focus");
    await fireEvent.changeText(screen.getByLabelText("Cake"), "Cake\n");

    expect(handlers.onInsertEntries).toHaveBeenCalledWith("Cake", [
      { text: "", checked: false, indentLevel: 1, kind: "check" },
    ]);
  });

  it("deletes a line that is left empty", async () => {
    await renderList([entry("Cake")]);

    await fireEvent(screen.getByLabelText("Cake"), "focus");
    await fireEvent.changeText(screen.getByLabelText("Cake"), "");
    await fireEvent(screen.getByLabelText("Cake"), "blur");

    expect(handlers.onDeleteEntry).toHaveBeenCalledWith("Cake");
    expect(handlers.onUpdateEntry).not.toHaveBeenCalled();
  });

  it("sets priority and indent from the keyboard bar", async () => {
    await renderList([entry("Cake"), entry("Venue")]);

    await fireEvent(screen.getByLabelText("Venue"), "focus");
    await fireEvent.press(screen.getByLabelText("Priority: none. Tap to change"));
    expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Venue", { tagOptionIds: ["low"] });

    await fireEvent.press(screen.getByLabelText("Indent line"));
    expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Venue", { indentLevel: 1 });

    await fireEvent.press(screen.getByLabelText("Set due date"));
    await fireEvent.press(screen.getByText("Tomorrow"));
    expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Venue", { dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it("checks an item off", async () => {
    const cake = entry("Cake");
    await renderList([cake]);

    await fireEvent.press(screen.getByLabelText("Mark checklist item complete"));

    expect(handlers.onToggleEntry).toHaveBeenCalledWith(cake);
  });

  it("sets a due date and priority from the item sheet", async () => {
    await renderList([entry("Cake")]);

    await openDetails("Cake");
    await fireEvent.press(screen.getByText("Tomorrow"));
    await fireEvent.press(screen.getByText("High"));
    await fireEvent.changeText(screen.getByLabelText("Notes"), "Chocolate");
    await fireEvent.press(screen.getByText("Done"));

    expect(handlers.onUpdateEntry).toHaveBeenCalledWith(
      "Cake",
      expect.objectContaining({ dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), tagOptionIds: ["high"], notes: "Chocolate" }),
    );
  });

  it("deletes an item from its sheet", async () => {
    await renderList([entry("Cake")]);

    await openDetails("Cake");
    await fireEvent.press(screen.getByText("Delete item"));

    expect(handlers.onDeleteEntry).toHaveBeenCalledWith("Cake");
  });

  it("shows where a focus-list line comes from and only removes it from the focus list", async () => {
    await renderScreen(
      <ListEntriesView
        listId="today"
        entries={[entry("today>a", { listId: "today", text: "Cake", refEntryId: "a" })]}
        priorityOptions={[]}
        canEdit
        captions={{ "today>a": "Wedding" }}
        referenceSources={{ "today>a": "Wedding" }}
        {...handlers}
      />,
    );

    expect(screen.getByText("Wedding")).toBeTruthy();
    await openDetails("Cake");
    expect(screen.getByText("From Wedding. Changes here show up there too.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Remove from this list"));

    expect(handlers.onDeleteEntry).toHaveBeenCalledWith("today>a");
  });

  it("adds a line to a focus list from its sheet", async () => {
    const onToggleFocusList = jest.fn();
    await renderScreen(
      <ListEntriesView
        listId="list-1"
        entries={[entry("Cake")]}
        priorityOptions={[]}
        canEdit
        captions={{ Cake: "In Today" }}
        focusLists={[
          { id: "today", title: "Today" },
          { id: "weekend", title: "Weekend plans" },
        ]}
        focusMembership={{ Cake: ["today"] }}
        onToggleFocusList={onToggleFocusList}
        {...handlers}
      />,
    );

    expect(screen.getByText("In Today")).toBeTruthy();
    await openDetails("Cake");
    expect(screen.getByRole("button", { name: "Today", selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByText("Weekend plans"));

    expect(onToggleFocusList).toHaveBeenCalledWith("Cake", "weekend");
  });

  it("checks a line off by swiping it", async () => {
    const cake = entry("Cake");
    await renderList([cake]);

    await fireEvent.press(screen.getByLabelText("Simulate swipe"));

    expect(handlers.onToggleEntry).toHaveBeenCalledWith(cake);
  });

  it("moves a line to another list from its swipe actions, with undo", async () => {
    const undo = jest.fn();
    const onMoveEntries = jest.fn(() => ({ listTitle: "Groceries", undo }));
    await renderScreen(
      <ListEntriesView
        listId="list-1"
        entries={[entry("Cake")]}
        priorityOptions={[]}
        canEdit
        moveTargets={[
          { id: "groceries", title: "Groceries", folderLabel: "Home" },
          { id: "party", title: "Party", folderLabel: "Events" },
        ]}
        onMoveEntries={onMoveEntries}
        {...handlers}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Move"));
    await fireEvent.press(screen.getByLabelText("Move to Groceries"));

    expect(onMoveEntries).toHaveBeenCalledWith(["Cake"], "groceries");
    expect(screen.getByText("Moved to Groceries")).toBeTruthy();
    await fireEvent.press(screen.getByText("Undo"));
    expect(undo).toHaveBeenCalled();
  });

  it("deletes a line from its swipe actions and can put it back", async () => {
    const cake = entry("Cake");
    const onRestoreEntries = jest.fn();
    await renderScreen(
      <ListEntriesView listId="list-1" entries={[cake]} priorityOptions={[]} canEdit onRestoreEntries={onRestoreEntries} {...handlers} />,
    );

    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(handlers.onDeleteEntry).toHaveBeenCalledWith("Cake");
    await fireEvent.press(screen.getByText("Undo"));
    expect(onRestoreEntries).toHaveBeenCalledWith([cake]);
  });

  it("adds a line to the only focus list in one swipe", async () => {
    const onToggleFocusList = jest.fn();
    await renderScreen(
      <ListEntriesView
        listId="list-1"
        entries={[entry("Cake")]}
        priorityOptions={[]}
        canEdit
        focusLists={[{ id: "today", title: "Today" }]}
        focusMembership={{}}
        onToggleFocusList={onToggleFocusList}
        {...handlers}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Focus"));

    expect(onToggleFocusList).toHaveBeenCalledWith("Cake", "today");
    expect(screen.getByText("Added to Today")).toBeTruthy();
  });

  it("selects several lines and moves them together", async () => {
    const onMoveEntries = jest.fn(() => ({ listTitle: "Party", undo: jest.fn() }));
    await renderScreen(
      <ListEntriesView
        listId="list-1"
        entries={[entry("Cake"), entry("Venue"), entry("Band")]}
        priorityOptions={[]}
        canEdit
        moveTargets={[{ id: "party", title: "Party", folderLabel: "Events" }]}
        onMoveEntries={onMoveEntries}
        {...handlers}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Select lines"));
    await fireEvent.press(screen.getByLabelText("Select Cake"));
    await fireEvent.press(screen.getByLabelText("Select Band"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    await fireEvent.press(screen.getByText("Move"));
    await fireEvent.press(screen.getByLabelText("Move to Party"));

    expect(onMoveEntries).toHaveBeenCalledWith(["Cake", "Band"], "party");
    expect(screen.getByText("Moved 2 items to Party")).toBeTruthy();
    expect(screen.queryByText("2 selected")).toBeNull();
  });

  it("checks off selected lines together", async () => {
    await renderList([entry("Cake"), entry("Venue")]);

    await fireEvent.press(screen.getByLabelText("Select lines"));
    await fireEvent.press(screen.getByLabelText("Select Cake"));
    await fireEvent.press(screen.getByLabelText("Select Venue"));
    await fireEvent.press(screen.getByText("Check"));

    expect(handlers.onToggleEntry).toHaveBeenCalledTimes(2);
  });

  it("is read-only without edit access", async () => {
    await renderList([entry("Cake")], false);

    expect(screen.queryByLabelText("Add an item to this list")).toBeNull();
    expect(screen.queryByLabelText("Drag to reorder")).toBeNull();
    expect(screen.queryByLabelText("Simulate swipe")).toBeNull();
  });
});
