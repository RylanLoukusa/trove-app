import React, { createRef, forwardRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Keyboard, Text } from "react-native";
import { act, fireEvent, screen, within } from "@testing-library/react-native";

import { ListEntriesView, ListEntriesViewHandle, targetIndexFor } from "./ListEntriesView";
import { renderScreen } from "../test-utils/renderScreen";
import type { ListEntry, TagOption } from "../types/models";
import { MAX_ENTRY_INDENT } from "../utils/listEntries";
import { defaultListViewSettings, ListViewSettings } from "../utils/listView";

// Stand-in for the swipe gesture: a button that "completes" the swipe to the
// right, and the left-swipe buttons always showing.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const React = jest.requireActual("react");
  const { Pressable, Text, View } = jest.requireActual("react-native");
  const MockSwipeable = React.forwardRef(
    (
      {
        children,
        enabled,
        onSwipeableOpen,
        renderLeftActions,
        renderRightActions,
      }: {
        children: React.ReactNode;
        enabled?: boolean;
        onSwipeableOpen: (direction: string) => void;
        renderLeftActions?: () => React.ReactNode;
        renderRightActions?: () => React.ReactNode;
      },
      _ref: unknown,
    ) => (
      <View>
        {enabled !== false && !!renderLeftActions && (
          <Pressable accessibilityLabel="Simulate swipe" onPress={() => onSwipeableOpen("right")}>
            <Text>swipe</Text>
          </Pressable>
        )}
        {children}
        {enabled !== false && renderRightActions?.()}
      </View>
    ),
  );
  return { __esModule: true, default: MockSwipeable };
});

const high: TagOption = { id: "high", groupId: "priority", name: "High", color: "#D98A8A", sortOrder: 2, createdAt: "", updatedAt: "" };
const low: TagOption = { ...high, id: "low", name: "Low", sortOrder: 0 };

// Lines are named by their text, and sit in the order they are listed.
let nextPosition = 0;
const entry = (id: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "list-1",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: `V${String(++nextPosition).padStart(4, "0")}`,
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
const onChangeSettings = jest.fn();
const onChangeSelecting = jest.fn();

type ViewProps = React.ComponentProps<typeof ListEntriesView>;
type HarnessProps = Partial<Omit<ViewProps, "settings" | "selecting" | "onChangeSettings" | "onChangeSelecting">> & {
  entries: ListEntry[];
  settings?: Partial<ListViewSettings>;
  selecting?: boolean;
};

// The page above the editor owns how the list is sorted and whether lines are
// being selected; this stands in for it.
const Harness = forwardRef<ListEntriesViewHandle, HarnessProps>(function Harness(
  { settings: initialSettings, selecting: initialSelecting = false, ...props },
  ref,
) {
  const [settings, setSettings] = useState<ListViewSettings>({ ...defaultListViewSettings, ...initialSettings });
  const [selecting, setSelecting] = useState(initialSelecting);
  return (
    <ListEntriesView
      ref={ref}
      priorityOptions={[low, high]}
      canEdit
      {...handlers}
      {...props}
      settings={settings}
      onChangeSettings={(updates) => {
        onChangeSettings(updates);
        setSettings((current) => ({ ...current, ...updates }));
      }}
      selecting={selecting}
      onChangeSelecting={(next) => {
        onChangeSelecting(next);
        setSelecting(next);
      }}
    />
  );
});

const renderList = (entries: ListEntry[], props: Omit<HarnessProps, "entries"> = {}) =>
  renderScreen(<Harness entries={entries} {...props} />);

const ADD_LINE = "Add a line to this list";

const focus = async (label: string) => {
  await fireEvent(screen.getByLabelText(label), "focus");
};

const openDetails = async (text: string) => {
  await focus(text);
  await fireEvent.press(screen.getByLabelText("Line details"));
};

const visibleTexts = () => screen.queryAllByTestId("list-line-input").map((input) => input.props.value as string);

const barState = (label: string) => screen.getByLabelText(label).props.accessibilityState as { selected: boolean; disabled: boolean };

const today = { id: "today", title: "Today", folderLabel: "Trove" };
const weekend = { id: "weekend", title: "Weekend", folderLabel: "Trove" };
const groceries = { id: "groceries", title: "Groceries", folderLabel: "Home" };
const party = { id: "party", title: "Party", folderLabel: "Events" };

describe("ListEntriesView", () => {
  let dismissKeyboard: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    nextPosition = 0;
    await AsyncStorage.clear();
    dismissKeyboard = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  });

  afterEach(() => {
    dismissKeyboard.mockRestore();
  });

  describe("showing a list", () => {
    it("shows every line in order and leaves checked lines where they are", async () => {
      await renderList([entry("Florist", { checked: true }), entry("Cake"), entry("Venue")]);

      expect(visibleTexts()).toEqual(["Florist", "Cake", "Venue"]);
    });

    it("gives checklist lines a checkbox and leaves bullets and plain lines without one", async () => {
      await renderList([
        entry("Produce", { kind: "text", bold: true }),
        entry("Apples", { kind: "check" }),
        entry("Something sweet", { kind: "bullet" }),
      ]);

      expect(screen.getAllByRole("checkbox")).toHaveLength(1);
      expect(screen.getByLabelText("Produce")).toHaveStyle({ fontWeight: "700" });
      expect(screen.getByLabelText("Apples")).not.toHaveStyle({ fontWeight: "700" });
    });

    it("moves checked lines to the bottom when the list is set that way", async () => {
      await renderList([entry("Florist", { checked: true }), entry("Cake")], { settings: { completedMode: "bottom" } });

      expect(visibleTexts()).toEqual(["Cake", "Florist"]);
    });

    it("hides checked lines when the list is set that way, and offers to show them", async () => {
      await renderList([entry("Florist", { checked: true }), entry("Cake"), entry("Band", { checked: true })], {
        settings: { completedMode: "hide" },
      });

      expect(visibleTexts()).toEqual(["Cake"]);

      await fireEvent.press(screen.getByText("2 completed lines hidden · Show"));

      expect(onChangeSettings).toHaveBeenCalledWith({ completedMode: "inline" });
      expect(visibleTexts()).toEqual(["Florist", "Cake", "Band"]);
    });

    it("says everything is done when every line is hidden", async () => {
      await renderList([entry("Florist", { checked: true })], { settings: { completedMode: "hide" } });

      expect(screen.getByText("Everything here is done.")).toBeTruthy();
      expect(screen.getByText("1 completed line hidden · Show")).toBeTruthy();
    });

    it("sorts by priority when the list is set that way", async () => {
      await renderList([entry("Cake"), entry("Florist", { tagOptionIds: ["high"] })], { settings: { sortMode: "priority" } });

      expect(visibleTexts()).toEqual(["Florist", "Cake"]);
      expect(screen.getByText("High")).toBeTruthy();
    });

    it("shows a line's due date, priority, notes and where it also shows", async () => {
      await renderList([entry("Cake", { dueDate: "2020-01-05", tagOptionIds: ["low"], notes: "Chocolate" })], {
        captions: { Cake: "Also on Today" },
      });

      const details = within(screen.getByLabelText("Details for Cake"));
      expect(details.getByText("Also on Today")).toBeTruthy();
      expect(details.getByText(/^Overdue/)).toBeTruthy();
      expect(details.getByText("Low")).toBeTruthy();
      expect(details.getByText("Chocolate")).toBeTruthy();
    });

    it("draws what the page puts above and below the lines", async () => {
      await renderList([entry("Cake")], { header: <Text>Wedding</Text>, footer: <Text>2 people can edit</Text> });

      expect(screen.getByText("Wedding")).toBeTruthy();
      expect(screen.getByText("2 people can edit")).toBeTruthy();
    });
  });

  describe("adding lines", () => {
    it("invites typing on an empty list", async () => {
      await renderList([]);

      expect(screen.getByPlaceholderText("Start typing")).toBeTruthy();
      expect(screen.queryByText("Nothing on this list yet.")).toBeNull();
    });

    it("adds a line with Return and keeps the cursor there for the next one", async () => {
      await renderList([entry("Cake")]);

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "  Venue \n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Venue", checked: false, indentLevel: 0, kind: "check" }]);
      expect(screen.getByLabelText(ADD_LINE).props.value).toBe("");
    });

    it("carries on like the last line: same mark, same indent", async () => {
      await renderList([entry("Cake"), entry("Chocolate", { kind: "bullet", indentLevel: 2 })]);

      expect(screen.getByPlaceholderText("New item")).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Vanilla\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Vanilla", checked: false, indentLevel: 2, kind: "bullet" }]);
    });

    it("carries on plain after a plain line", async () => {
      await renderList([entry("Dear diary", { kind: "text" })]);

      expect(screen.getByPlaceholderText("New line")).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "More\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "More", checked: false, indentLevel: 0, kind: "text" }]);
    });

    it("goes back to the marks around a heading, not the heading's own look", async () => {
      await renderList([entry("Milk", { kind: "bullet" }), entry("Later", { kind: "text", bold: true })]);

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Eggs\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Eggs", checked: false, indentLevel: 0, kind: "bullet" }]);
    });

    it("starts a checklist under a heading that is the only line", async () => {
      await renderList([entry("Groceries", { kind: "text", bold: true })]);

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Eggs\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Eggs", checked: false, indentLevel: 0, kind: "check" }]);
    });

    it("adds one line per row when several are pasted, and can undo the paste", async () => {
      await renderList([entry("Cake")]);

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "- Milk\n  - Eggs\n- [x] Bread");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [
        { text: "Milk", checked: false, indentLevel: 0, kind: "check" },
        { text: "Eggs", checked: false, indentLevel: 1, kind: "check" },
        { text: "Bread", checked: true, indentLevel: 0, kind: "check" },
      ]);
      expect(screen.getByText("Added 3 lines")).toBeTruthy();

      await fireEvent.press(screen.getByText("Undo"));

      expect(handlers.onDeleteEntry.mock.calls.map((call) => call[0])).toEqual(["new-0", "new-1", "new-2"]);
      expect(screen.queryByText("Added 3 lines")).toBeNull();
    });

    it("saves what is in the bottom line when the cursor leaves it", async () => {
      await renderList([entry("Cake")]);

      await focus(ADD_LINE);
      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Venue");
      expect(handlers.onInsertEntries).not.toHaveBeenCalled();
      await fireEvent(screen.getByLabelText(ADD_LINE), "blur");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Venue", checked: false, indentLevel: 0, kind: "check" }]);
      expect(screen.getByLabelText(ADD_LINE).props.value).toBe("");
    });

    it("steps the bottom line back out a level on Return when it is empty, then puts the keyboard away", async () => {
      await renderList([entry("Cake"), entry("Chocolate", { indentLevel: 1 })]);

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "\n");
      expect(dismissKeyboard).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "\n");
      expect(dismissKeyboard).toHaveBeenCalledTimes(1);
      expect(handlers.onInsertEntries).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Venue\n");
      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Venue", checked: false, indentLevel: 0, kind: "check" }]);
    });

    it("steps the empty bottom line back out a level on Backspace", async () => {
      await renderList([entry("Cake"), entry("Chocolate", { indentLevel: 2 })]);

      await fireEvent(screen.getByLabelText(ADD_LINE), "keyPress", { nativeEvent: { key: "Backspace" } });
      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Venue\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Venue", checked: false, indentLevel: 1, kind: "check" }]);
    });
  });

  describe("typing in a line", () => {
    it("saves an edit when the cursor leaves the line", async () => {
      await renderList([entry("Cake")]);

      await focus("Cake");
      await fireEvent.changeText(screen.getByLabelText("Cake"), "Carrot cake ");
      await fireEvent(screen.getByLabelText("Cake"), "blur");

      expect(handlers.onUpdateEntry).toHaveBeenCalledTimes(1);
      expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Cake", { text: "Carrot cake" });
    });

    it("saves nothing when the text did not change", async () => {
      await renderList([entry("Cake")]);

      await focus("Cake");
      await fireEvent(screen.getByLabelText("Cake"), "blur");

      expect(handlers.onUpdateEntry).not.toHaveBeenCalled();
      expect(handlers.onDeleteEntry).not.toHaveBeenCalled();
    });

    it("saves a half-typed edit when the page is left", async () => {
      await renderList([entry("Cake")]);

      await focus("Cake");
      await fireEvent.changeText(screen.getByLabelText("Cake"), "Carrot cake");
      expect(handlers.onUpdateEntry).not.toHaveBeenCalled();
      await screen.unmount();

      expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Cake", { text: "Carrot cake" });
    });

    it("starts a new line right below on Return, marked and indented the same", async () => {
      await renderList([entry("Cake", { kind: "bullet", indentLevel: 1 }), entry("Venue")]);

      await focus("Cake");
      await fireEvent.changeText(screen.getByLabelText("Cake"), "Cake\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith("Cake", [{ text: "", checked: false, indentLevel: 1, kind: "bullet" }]);
      expect(handlers.onUpdateEntry).not.toHaveBeenCalled();
    });

    it("splits a line in two when Return is pressed in the middle of it", async () => {
      await renderList([entry("Milk and eggs")]);

      await focus("Milk and eggs");
      await fireEvent.changeText(screen.getByLabelText("Milk and eggs"), "Milk \nand eggs");

      expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Milk and eggs", { text: "Milk" });
      expect(handlers.onInsertEntries).toHaveBeenCalledWith("Milk and eggs", [
        { text: "and eggs", checked: false, indentLevel: 0, kind: "check" },
      ]);
      expect(visibleTexts()).toEqual(["Milk"]);
    });

    it("starts items, not more headings, after a heading", async () => {
      await renderList([entry("Apples", { kind: "bullet" }), entry("Later", { kind: "text", bold: true })]);

      await focus("Later");
      await fireEvent.changeText(screen.getByLabelText("Later"), "Later\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith("Later", [{ text: "", checked: false, indentLevel: 0, kind: "bullet" }]);
    });

    it("adds pasted rows under the line, nested from where it sits", async () => {
      await renderList([entry("Party", { kind: "bullet", indentLevel: 1 })]);

      await focus("Party");
      await fireEvent.changeText(screen.getByLabelText("Party"), "Party\nballoons\n  candles\ncake");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith("Party", [
        { text: "balloons", checked: false, indentLevel: 1, kind: "bullet" },
        { text: "candles", checked: false, indentLevel: 2, kind: "bullet" },
        { text: "cake", checked: false, indentLevel: 1, kind: "bullet" },
      ]);
      expect(screen.getByText("Added 3 lines")).toBeTruthy();
    });

    it("steps an empty line back out a level on Return, and puts the keyboard away at the left edge", async () => {
      await renderList([entry("Cake"), entry("", { id: "blank", indentLevel: 1 }), entry("", { id: "edge" })]);

      const [, indented, atEdge] = screen.getAllByTestId("list-line-input");
      await fireEvent(indented, "focus");
      await fireEvent.changeText(indented, "\n");
      expect(handlers.onUpdateEntry).toHaveBeenCalledWith("blank", { indentLevel: 0 });
      expect(dismissKeyboard).not.toHaveBeenCalled();

      await fireEvent(atEdge, "focus");
      await fireEvent.changeText(atEdge, "\n");
      expect(dismissKeyboard).toHaveBeenCalledTimes(1);
      expect(handlers.onInsertEntries).not.toHaveBeenCalled();
    });

    it("steps an empty line back out a level on Backspace", async () => {
      await renderList([entry("Cake"), entry("", { id: "blank", indentLevel: 2 })]);

      const blank = screen.getAllByTestId("list-line-input")[1];
      await fireEvent(blank, "focus");
      await fireEvent(blank, "keyPress", { nativeEvent: { key: "Backspace" } });

      expect(handlers.onUpdateEntry).toHaveBeenCalledWith("blank", { indentLevel: 1 });
      expect(handlers.onDeleteEntry).not.toHaveBeenCalled();
    });

    it("deletes a line that is left empty", async () => {
      await renderList([entry("Cake")]);

      await focus("Cake");
      await fireEvent.changeText(screen.getByLabelText("Cake"), "");
      await fireEvent(screen.getByLabelText("Cake"), "blur");

      expect(handlers.onDeleteEntry).toHaveBeenCalledWith("Cake");
      expect(handlers.onUpdateEntry).not.toHaveBeenCalled();
    });

    it("keeps a line pulled in from another list even when it is left empty here", async () => {
      await renderList([entry("Cake", { id: "today>a", refEntryId: "a" })], { referenceSources: { "today>a": "Wedding" } });

      await focus("Cake");
      await fireEvent.changeText(screen.getByLabelText("Cake"), "");
      await fireEvent(screen.getByLabelText("Cake"), "blur");

      expect(handlers.onDeleteEntry).not.toHaveBeenCalled();
      expect(visibleTexts()).toEqual(["Cake"]);
    });
  });

  describe("the bar above the keyboard", () => {
    it("is only there while a line has the cursor", async () => {
      await renderList([entry("Cake")]);
      expect(screen.queryByLabelText("Bold")).toBeNull();

      await focus("Cake");
      expect(screen.getByLabelText("Bold")).toBeTruthy();

      await fireEvent(screen.getByLabelText("Cake"), "blur");
      expect(screen.queryByLabelText("Bold")).toBeNull();
    });

    it("shows how the line is marked", async () => {
      await renderList([entry("Cake", { bold: true }), entry("Icing", { kind: "bullet" })]);

      await focus("Cake");
      expect(barState("Checklist").selected).toBe(true);
      expect(barState("Bullets").selected).toBe(false);
      expect(barState("Bold").selected).toBe(true);

      await focus("Icing");
      expect(barState("Checklist").selected).toBe(false);
      expect(barState("Bullets").selected).toBe(true);
      expect(barState("Bold").selected).toBe(false);
    });

    it("turns a line into a bullet, a checklist item, or a plain line", async () => {
      await renderList([entry("Cake"), entry("Icing", { kind: "bullet" }), entry("Note", { kind: "text" })]);

      await focus("Cake");
      await fireEvent.press(screen.getByLabelText("Bullets"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Cake", { kind: "bullet" });

      await fireEvent.press(screen.getByLabelText("Checklist"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Cake", { kind: "text" });

      await focus("Icing");
      await fireEvent.press(screen.getByLabelText("Bullets"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Icing", { kind: "text" });

      await focus("Note");
      await fireEvent.press(screen.getByLabelText("Checklist"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Note", { kind: "check" });
    });

    it("makes a line bold and plain again", async () => {
      await renderList([entry("Cake"), entry("Produce", { kind: "text", bold: true })]);

      await focus("Cake");
      await fireEvent.press(screen.getByLabelText("Bold"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Cake", { bold: true });

      await focus("Produce");
      await fireEvent.press(screen.getByLabelText("Bold"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Produce", { bold: false });
    });

    it("indents and outdents a line, within the limits", async () => {
      await renderList([entry("Cake"), entry("Icing", { indentLevel: 2 }), entry("Deep", { indentLevel: MAX_ENTRY_INDENT })]);

      await focus("Cake");
      expect(barState("Outdent line").disabled).toBe(true);
      await fireEvent.press(screen.getByLabelText("Indent line"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Cake", { indentLevel: 1 });

      await focus("Icing");
      await fireEvent.press(screen.getByLabelText("Outdent line"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Icing", { indentLevel: 1 });
      await fireEvent.press(screen.getByLabelText("Indent line"));
      expect(handlers.onUpdateEntry).toHaveBeenLastCalledWith("Icing", { indentLevel: 3 });

      await focus("Deep");
      expect(barState("Indent line").disabled).toBe(true);
      expect(barState("Outdent line").disabled).toBe(false);
    });

    it("moves a line up or down one place", async () => {
      await renderList([entry("Cake"), entry("Venue"), entry("Band"), entry("Rings")]);

      await focus("Band");
      await fireEvent.press(screen.getByLabelText("Move line up"));
      expect(handlers.onMoveEntry).toHaveBeenLastCalledWith("Band", "Cake", "Venue");

      await fireEvent.press(screen.getByLabelText("Move line down"));
      expect(handlers.onMoveEntry).toHaveBeenLastCalledWith("Band", "Rings", null);

      await focus("Venue");
      await fireEvent.press(screen.getByLabelText("Move line up"));
      expect(handlers.onMoveEntry).toHaveBeenLastCalledWith("Venue", null, "Cake");
    });

    it("can't move the first line up or the last line down", async () => {
      await renderList([entry("Cake"), entry("Venue")]);

      await focus("Cake");
      expect(barState("Move line up").disabled).toBe(true);
      expect(barState("Move line down").disabled).toBe(false);

      await focus("Venue");
      expect(barState("Move line up").disabled).toBe(false);
      expect(barState("Move line down").disabled).toBe(true);
    });

    it("doesn't indent or move lines by hand while the list is sorted another way", async () => {
      await renderList([entry("Cake"), entry("Venue"), entry("Band")], { settings: { sortMode: "alpha" } });

      await focus("Cake");

      ["Indent line", "Outdent line", "Move line up", "Move line down"].forEach((label) => {
        expect(barState(label).disabled).toBe(true);
      });
      expect(barState("Bold").disabled).toBe(false);
    });

    it("sets how the next line will look when the cursor is in the bottom line", async () => {
      await renderList([entry("Cake")]);

      await focus(ADD_LINE);
      expect(barState("Checklist").selected).toBe(true);
      ["Move line up", "Move line down", "Send to another list", "Line details"].forEach((label) => {
        expect(barState(label).disabled).toBe(true);
      });

      await fireEvent.press(screen.getByLabelText("Bullets"));
      await fireEvent.press(screen.getByLabelText("Bold"));
      await fireEvent.press(screen.getByLabelText("Indent line"));
      expect(barState("Bullets").selected).toBe(true);
      expect(screen.getByLabelText(ADD_LINE)).toHaveStyle({ fontWeight: "700" });
      expect(handlers.onUpdateEntry).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Icing\n");
      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [
        { text: "Icing", checked: false, indentLevel: 1, kind: "bullet", bold: true },
      ]);
    });

    it("writes a heading with the marks turned off and Bold on", async () => {
      await renderList([]);

      await focus(ADD_LINE);
      await fireEvent.press(screen.getByLabelText("Checklist"));
      await fireEvent.press(screen.getByLabelText("Bold"));
      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Produce\n");

      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [
        { text: "Produce", checked: false, indentLevel: 0, kind: "text", bold: true },
      ]);
    });

    it("puts the keyboard away with Done", async () => {
      await renderList([entry("Cake")]);

      await focus("Cake");
      await fireEvent.press(screen.getByLabelText("Done"));

      expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    });
  });

  describe("line details", () => {
    it("sets a due date, priority and notes", async () => {
      await renderList([entry("Cake")]);

      await openDetails("Cake");
      expect(screen.getByText("Line details")).toBeTruthy();
      await fireEvent.press(screen.getByText("Tomorrow"));
      await fireEvent.press(screen.getByText("High"));
      await fireEvent.changeText(screen.getByLabelText("Notes"), "Chocolate");
      await fireEvent.press(screen.getByText("Done"));

      expect(handlers.onUpdateEntry).toHaveBeenCalledWith("Cake", {
        dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        tagOptionIds: ["high"],
        notes: "Chocolate",
      });
    });

    it("opens from the details shown under a line", async () => {
      await renderList([entry("Cake", { notes: "Chocolate" })]);

      await fireEvent.press(screen.getByLabelText("Details for Cake"));

      expect(screen.getByLabelText("Notes").props.value).toBe("Chocolate");
    });

    it("deletes the line", async () => {
      await renderList([entry("Cake")]);

      await openDetails("Cake");
      await fireEvent.press(screen.getByText("Delete line"));

      expect(handlers.onDeleteEntry).toHaveBeenCalledWith("Cake");
      expect(screen.queryByText("Line details")).toBeNull();
    });

    it("says where a pulled-in line comes from and only takes it off this list", async () => {
      await renderList([entry("Cake", { id: "today>a", listId: "today", refEntryId: "a" })], {
        captions: { "today>a": "Wedding" },
        referenceSources: { "today>a": "Wedding" },
      });

      expect(screen.getByText("Wedding")).toBeTruthy();
      await openDetails("Cake");
      expect(screen.getByText("From Wedding. Changes here show up there too.")).toBeTruthy();
      expect(screen.queryByText("Delete line")).toBeNull();
      await fireEvent.press(screen.getByText("Remove from this list"));

      expect(handlers.onDeleteEntry).toHaveBeenCalledWith("today>a");
    });

    it("can't remove a line that a list's rule pulled in", async () => {
      await renderList([entry("Cake", { id: "today>a", listId: "today", refEntryId: "a" })], {
        referenceSources: { "today>a": "Wedding" },
        ruleEntryIds: new Set(["today>a"]),
      });

      await openDetails("Cake");

      expect(screen.getByText(/It's here because it matches this list's rule\./)).toBeTruthy();
      expect(screen.queryByText("Remove from this list")).toBeNull();
      expect(screen.queryByText("Delete line")).toBeNull();
    });

    it("lists the other lists a line shows on and takes it off one", async () => {
      const onLinkEntries = jest.fn(() => ({ listTitle: "Today", count: 0, removed: true }));
      await renderList([entry("Cake")], {
        linkTargets: [today, weekend],
        linkedListIds: { Cake: ["today"] },
        onLinkEntries,
      });

      await openDetails("Cake");
      expect(screen.getByText("Also on")).toBeTruthy();
      expect(screen.queryByLabelText("Take off Weekend")).toBeNull();
      // "Today" is also one of the due dates on this sheet.
      expect(screen.getAllByText("Today")).toHaveLength(2);
      await fireEvent.press(screen.getByLabelText("Take off Today"));

      expect(onLinkEntries).toHaveBeenCalledWith(["Cake"], "today");
      expect(screen.getByText("Taken off Today")).toBeTruthy();
    });
  });

  describe("checking off", () => {
    it("checks a line off with its checkbox", async () => {
      const cake = entry("Cake");
      await renderList([cake]);

      await fireEvent.press(screen.getByLabelText("Mark checklist item complete"));

      expect(handlers.onToggleEntry).toHaveBeenCalledWith(cake);
    });

    it("offers to uncheck a line that is done", async () => {
      const cake = entry("Cake", { checked: true });
      await renderList([cake]);

      await fireEvent.press(screen.getByLabelText("Mark checklist item incomplete"));

      expect(handlers.onToggleEntry).toHaveBeenCalledWith(cake);
    });

    it("checks a line off by swiping it to the right", async () => {
      const cake = entry("Cake");
      await renderList([cake]);

      await fireEvent.press(screen.getByLabelText("Simulate swipe"));

      expect(handlers.onToggleEntry).toHaveBeenCalledWith(cake);
    });

    it("has nothing to check off on bullets and plain lines", async () => {
      await renderList([entry("Icing", { kind: "bullet" }), entry("Note", { kind: "text" })]);

      expect(screen.queryByLabelText("Simulate swipe")).toBeNull();
      expect(screen.queryByRole("checkbox")).toBeNull();
    });
  });

  describe("swiping a line to the left", () => {
    it("adds it to another list, where it shows as well, with undo", async () => {
      const undo = jest.fn();
      const onLinkEntries = jest.fn(() => ({ listTitle: "Today", count: 1, undo }));
      await renderList([entry("Cake")], { linkTargets: [today, weekend], onLinkEntries });

      await fireEvent.press(screen.getByLabelText("Add Cake to another list"));
      expect(screen.getByText('Add "Cake"')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("Add to Today"));

      expect(onLinkEntries).toHaveBeenCalledWith(["Cake"], "today");
      expect(screen.getByText("Added to Today")).toBeTruthy();
      await fireEvent.press(screen.getByText("Undo"));
      expect(undo).toHaveBeenCalledTimes(1);
    });

    it("takes a line off a list it is already on", async () => {
      const onLinkEntries = jest.fn(() => ({ listTitle: "Today", count: 0, removed: true }));
      await renderList([entry("Cake")], { linkTargets: [today, weekend], linkedListIds: { Cake: ["today"] }, onLinkEntries });

      await fireEvent.press(screen.getByLabelText("Add Cake to another list"));
      expect(screen.getByText("Already there. Tap to take it off")).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("Take off Today"));

      expect(onLinkEntries).toHaveBeenCalledWith(["Cake"], "today");
      expect(screen.getByText("Taken off Today")).toBeTruthy();
      expect(screen.queryByText("Undo")).toBeNull();
    });

    it("moves it to another list, with undo", async () => {
      const undo = jest.fn();
      const onMoveEntries = jest.fn(() => ({ listTitle: "Groceries", undo }));
      await renderList([entry("Cake")], { moveTargets: [groceries, party], onMoveEntries });

      await fireEvent.press(screen.getByLabelText("Move Cake to another list"));
      expect(screen.getByText('Move "Cake"')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("Move to Groceries"));

      expect(onMoveEntries).toHaveBeenCalledWith(["Cake"], "groceries");
      expect(screen.getByText("Moved to Groceries")).toBeTruthy();
      await fireEvent.press(screen.getByText("Undo"));
      expect(undo).toHaveBeenCalledTimes(1);
    });

    it("lets the choice between adding and moving be changed in the sheet", async () => {
      const onLinkEntries = jest.fn(() => ({ listTitle: "Today", count: 1 }));
      const onMoveEntries = jest.fn(() => ({ listTitle: "Groceries", undo: jest.fn() }));
      await renderList([entry("Cake")], { linkTargets: [today], onLinkEntries, moveTargets: [groceries, today], onMoveEntries });

      await fireEvent.press(screen.getByLabelText("Add Cake to another list"));
      expect(screen.queryByLabelText("Move to Groceries")).toBeNull();
      expect(screen.getByRole("button", { name: "Add to list" }).props.accessibilityState).toEqual({ selected: true });
      await fireEvent.press(screen.getByRole("button", { name: "Move" }));
      await fireEvent.press(screen.getByLabelText("Move to Groceries"));

      expect(onMoveEntries).toHaveBeenCalledWith(["Cake"], "groceries");
      expect(onLinkEntries).not.toHaveBeenCalled();
    });

    it("leaves things as they are when the sheet is cancelled", async () => {
      const onMoveEntries = jest.fn();
      await renderList([entry("Cake")], { moveTargets: [groceries], onMoveEntries });

      await fireEvent.press(screen.getByLabelText("Move Cake to another list"));
      await fireEvent.press(screen.getByText("Cancel"));

      expect(onMoveEntries).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Move to Groceries")).toBeNull();
    });

    it("deletes it and can put it back", async () => {
      const cake = entry("Cake");
      const onRestoreEntries = jest.fn();
      await renderList([cake, entry("Venue")], { onRestoreEntries });

      await fireEvent.press(screen.getByLabelText("Delete Cake"));
      expect(handlers.onDeleteEntry).toHaveBeenCalledWith("Cake");
      expect(screen.getByText("Deleted 1 line")).toBeTruthy();

      await fireEvent.press(screen.getByText("Undo"));
      expect(onRestoreEntries).toHaveBeenCalledWith([cake]);
    });

    it("only takes a pulled-in line off this list, and doesn't offer to add it elsewhere", async () => {
      const onLinkEntries = jest.fn();
      await renderList([entry("Cake", { id: "today>a", listId: "today", refEntryId: "a" })], {
        referenceSources: { "today>a": "Wedding" },
        linkTargets: [weekend],
        onLinkEntries,
        onRestoreEntries: jest.fn(),
      });

      expect(screen.queryByLabelText("Add Cake to another list")).toBeNull();
      expect(within(screen.getByLabelText("Remove Cake from this list")).getByText("Remove")).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("Remove Cake from this list"));

      expect(handlers.onDeleteEntry).toHaveBeenCalledWith("today>a");
      expect(screen.getByText("Deleted 1 line")).toBeTruthy();
      expect(screen.queryByText("Undo")).toBeNull();
    });

    it("offers no way to remove a line that a list's rule pulled in", async () => {
      await renderList([entry("Cake", { id: "today>a", listId: "today", refEntryId: "a" })], {
        referenceSources: { "today>a": "Wedding" },
        ruleEntryIds: new Set(["today>a"]),
      });

      expect(screen.queryByLabelText("Remove Cake from this list")).toBeNull();
      expect(screen.queryByLabelText("Delete Cake")).toBeNull();
    });
  });

  describe("selecting several lines", () => {
    const selectLines = async (...texts: string[]) => {
      for (const text of texts) {
        await fireEvent.press(screen.getByLabelText(`Select ${text}`));
      }
    };

    it("swaps typing for picking lines", async () => {
      await renderList([entry("Cake"), entry("Venue")], { selecting: true });

      expect(screen.getByText("Tap lines to select them")).toBeTruthy();
      expect(screen.queryByLabelText(ADD_LINE)).toBeNull();
      expect(visibleTexts()).toEqual([]);
      expect(screen.queryByLabelText("Delete Cake")).toBeNull();

      await selectLines("Cake", "Venue");
      expect(screen.getByText("2 selected")).toBeTruthy();
      expect(screen.getByLabelText("Select Cake").props.accessibilityState).toEqual({ checked: true });

      await selectLines("Venue");
      expect(screen.getByText("1 selected")).toBeTruthy();
    });

    it("moves the selected lines together", async () => {
      const onMoveEntries = jest.fn(() => ({ listTitle: "Party", undo: jest.fn() }));
      await renderList([entry("Cake"), entry("Venue"), entry("Band")], { selecting: true, moveTargets: [party], onMoveEntries });

      await selectLines("Cake", "Band");
      await fireEvent.press(screen.getByLabelText("Move"));
      expect(screen.getByText("Move 2 lines")).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("Move to Party"));

      expect(onMoveEntries).toHaveBeenCalledWith(["Cake", "Band"], "party");
      expect(screen.getByText("Moved 2 lines to Party")).toBeTruthy();
      expect(onChangeSelecting).toHaveBeenCalledWith(false);
      expect(screen.queryByText("2 selected")).toBeNull();
    });

    it("adds the selected lines to another list, leaving out ones that are only pulled in here", async () => {
      const onLinkEntries = jest.fn(() => ({ listTitle: "Today", count: 2 }));
      await renderList(
        [entry("Cake"), entry("Venue"), entry("Borrowed", { id: "list-1>x", refEntryId: "x" })],
        { selecting: true, linkTargets: [today], onLinkEntries, referenceSources: { "list-1>x": "Wedding" } },
      );

      await selectLines("Cake", "Venue", "Borrowed");
      await fireEvent.press(screen.getByLabelText("Add to"));
      await fireEvent.press(screen.getByLabelText("Add to Today"));

      expect(onLinkEntries).toHaveBeenCalledWith(["Cake", "Venue"], "today");
      expect(screen.getByText("Added 2 lines to Today")).toBeTruthy();
      expect(onChangeSelecting).toHaveBeenCalledWith(false);
    });

    it("says so when the lines were already on that list", async () => {
      const onLinkEntries = jest.fn(() => ({ listTitle: "Today", count: 0 }));
      await renderList([entry("Cake"), entry("Venue")], { selecting: true, linkTargets: [today], onLinkEntries });

      await selectLines("Cake", "Venue");
      await fireEvent.press(screen.getByLabelText("Add to"));
      await fireEvent.press(screen.getByLabelText("Add to Today"));

      expect(screen.getByText("Already on Today")).toBeTruthy();
    });

    it("checks the selected lines off in one go", async () => {
      const onSetChecked = jest.fn();
      await renderList([entry("Cake"), entry("Venue", { checked: true }), entry("Note", { kind: "text" })], {
        selecting: true,
        onSetChecked,
      });

      await selectLines("Cake", "Venue", "Note");
      await fireEvent.press(screen.getByLabelText("Check"));

      expect(onSetChecked).toHaveBeenCalledWith(["Cake"], true);
      expect(handlers.onToggleEntry).not.toHaveBeenCalled();
      expect(onChangeSelecting).toHaveBeenCalledWith(false);
    });

    it("unchecks them when everything selected is already done", async () => {
      const onSetChecked = jest.fn();
      await renderList([entry("Cake", { checked: true }), entry("Venue", { checked: true })], { selecting: true, onSetChecked });

      await selectLines("Cake", "Venue");
      expect(screen.queryByLabelText("Check")).toBeNull();
      await fireEvent.press(screen.getByLabelText("Uncheck"));

      expect(onSetChecked).toHaveBeenCalledWith(["Cake", "Venue"], false);
    });

    it("deletes the selected lines and can put them back", async () => {
      const cake = entry("Cake");
      const band = entry("Band");
      const onRestoreEntries = jest.fn();
      await renderList([cake, entry("Venue"), band], { selecting: true, onRestoreEntries });

      await selectLines("Cake", "Band");
      await fireEvent.press(screen.getByLabelText("Delete"));

      expect(handlers.onDeleteEntry.mock.calls.map((call) => call[0])).toEqual(["Cake", "Band"]);
      expect(screen.getByText("Deleted 2 lines")).toBeTruthy();
      expect(onChangeSelecting).toHaveBeenCalledWith(false);

      await fireEvent.press(screen.getByText("Undo"));
      expect(onRestoreEntries).toHaveBeenCalledWith([cake, band]);
    });

    it("does nothing until a line is selected", async () => {
      const onMoveEntries = jest.fn();
      await renderList([entry("Cake")], { selecting: true, moveTargets: [party], onMoveEntries });

      await fireEvent.press(screen.getByLabelText("Delete"));
      await fireEvent.press(screen.getByLabelText("Move"));
      await fireEvent.press(screen.getByLabelText("Check"));

      expect(handlers.onDeleteEntry).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Move to Party")).toBeNull();
      expect(onChangeSelecting).not.toHaveBeenCalled();
    });
  });

  describe("a list that can only be viewed", () => {
    it("shows the lines without any way to change them", async () => {
      await renderList([entry("Cake"), entry("Venue", { kind: "bullet" })], { canEdit: false, moveTargets: [party], onMoveEntries: jest.fn() });

      expect(screen.getByText("Cake")).toBeTruthy();
      expect(screen.getByText("Venue")).toBeTruthy();
      expect(visibleTexts()).toEqual([]);
      expect(screen.queryByLabelText(ADD_LINE)).toBeNull();
      expect(screen.queryByLabelText("Simulate swipe")).toBeNull();
      expect(screen.queryByLabelText("Delete Cake")).toBeNull();
      expect(screen.queryByLabelText("Move Cake to another list")).toBeNull();
      expect(screen.getByRole("checkbox").props.accessibilityState).toEqual({ checked: false, disabled: true });
    });

    it("says so when the list is empty", async () => {
      await renderList([], { canEdit: false, emptyText: "Nothing has been added yet." });

      expect(screen.getByText("Nothing has been added yet.")).toBeTruthy();
    });

    it("still shows a line's details, read-only", async () => {
      await renderList([entry("Cake", { notes: "Chocolate" })], { canEdit: false });

      await fireEvent.press(screen.getByLabelText("Cake"));

      expect(screen.getByText("Line")).toBeTruthy();
      expect(screen.getByLabelText("Notes").props.editable).toBe(false);
      expect(screen.queryByText("Delete line")).toBeNull();
    });
  });

  describe("what the page can ask of it", () => {
    it("saves what is still in the bottom line when asked", async () => {
      const ref = createRef<ListEntriesViewHandle>();
      await renderScreen(<Harness ref={ref} entries={[entry("Cake", { kind: "bullet" })]} />);

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), " Venue ");
      let saved = false;
      await act(async () => {
        saved = ref.current!.flush();
      });

      expect(saved).toBe(true);
      expect(handlers.onInsertEntries).toHaveBeenCalledWith(null, [{ text: "Venue", checked: false, indentLevel: 0, kind: "bullet" }]);
      expect(screen.getByLabelText(ADD_LINE).props.value).toBe("");
    });

    it("has nothing to save when the bottom line is empty", async () => {
      const ref = createRef<ListEntriesViewHandle>();
      await renderScreen(<Harness ref={ref} entries={[entry("Cake")]} />);

      let saved = true;
      await act(async () => {
        saved = ref.current!.flush();
      });

      expect(saved).toBe(false);
      expect(handlers.onInsertEntries).not.toHaveBeenCalled();
    });

    it("shows a message with an undo", async () => {
      const ref = createRef<ListEntriesViewHandle>();
      const undo = jest.fn();
      await renderScreen(<Harness ref={ref} entries={[entry("Cake")]} />);

      await act(async () => {
        ref.current!.showToast("Cleared 3 checked lines", undo);
      });
      expect(screen.getByText("Cleared 3 checked lines")).toBeTruthy();

      await fireEvent.press(screen.getByText("Undo"));
      expect(undo).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Cleared 3 checked lines")).toBeNull();
    });
  });
});

describe("targetIndexFor", () => {
  const even = [40, 40, 40, 40, 40];

  it("stays put until the line is dragged past half of its neighbour", () => {
    expect(targetIndexFor(2, 0, even)).toBe(2);
    expect(targetIndexFor(2, 19, even)).toBe(2);
    expect(targetIndexFor(2, -19, even)).toBe(2);
  });

  it("moves one place for each row it is dragged across", () => {
    expect(targetIndexFor(2, 21, even)).toBe(3);
    expect(targetIndexFor(2, 61, even)).toBe(4);
    expect(targetIndexFor(2, -21, even)).toBe(1);
    expect(targetIndexFor(2, -61, even)).toBe(0);
  });

  it("stops at the first and last line however far it is dragged", () => {
    expect(targetIndexFor(1, -5000, even)).toBe(0);
    expect(targetIndexFor(3, 5000, even)).toBe(4);
    expect(targetIndexFor(0, -30, even)).toBe(0);
    expect(targetIndexFor(4, 30, even)).toBe(4);
  });

  it("takes taller rows into account", () => {
    // The row below is three text rows tall, so it takes a longer drag to pass it.
    const mixed = [40, 120, 40];
    expect(targetIndexFor(0, 50, mixed)).toBe(0);
    expect(targetIndexFor(0, 61, mixed)).toBe(1);
    expect(targetIndexFor(0, 139, mixed)).toBe(1);
    expect(targetIndexFor(0, 141, mixed)).toBe(2);
    expect(targetIndexFor(2, -61, mixed)).toBe(1);
  });
});
