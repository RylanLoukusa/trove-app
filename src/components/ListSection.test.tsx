import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen } from "@testing-library/react-native";

import { ListSection } from "./ListSection";
import { useTrove } from "../storage/storage";
import { renderScreen } from "../test-utils/renderScreen";
import type { ListEntry, SavedItem } from "../types/models";
import { toDateKey } from "../utils/listView";

// Keeps the props the list view was last rendered with, to drive a drag.
const mockLastViewProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("./ListEntriesView", () => {
  const actual = jest.requireActual("./ListEntriesView");
  return {
    ListEntriesView: (props: Record<string, unknown>) => {
      mockLastViewProps.current = props;
      return actual.ListEntriesView(props);
    },
  };
});

jest.mock("../storage/storage", () => ({
  useTrove: jest.fn(),
}));

const mockUseTrove = useTrove as jest.Mock;

const dayOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const list = (overrides: Partial<SavedItem>): SavedItem => ({
  id: "wedding",
  folderId: "folder-1",
  title: "Wedding",
  type: "list",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const line = (id: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "wedding",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: "V",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const actions = {
  relocateListEntries: jest.fn(() => []),
  restoreListEntries: jest.fn(),
  updateItem: jest.fn(),
  updateListEntry: jest.fn(),
  insertListEntries: jest.fn(() => []),
  moveListEntry: jest.fn(),
  deleteListEntry: jest.fn(),
  addToFocusList: jest.fn(),
  positionListEntry: jest.fn(),
  removeFromFocusList: jest.fn(),
  clearFocusList: jest.fn(),
  canEditItem: () => true,
};

const today = list({ id: "today", title: "Today", listMode: "focus", focusRule: "due_today" });

const setup = (focus: SavedItem, entries: ListEntry[]) => {
  mockUseTrove.mockReturnValue({
    folders: [],
    items: [list({}), focus],
    listEntries: entries,
    tagGroups: [],
    tagOptions: [],
    ...actions,
  });
  return renderScreen(<ListSection item={focus} />);
};

const shownTexts = () =>
  screen.getAllByTestId("list-line-input").map((input) => input.props.value);

describe("ListSection smart focus lists", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  const entries = [
    line("Overdue florist", { dueDate: toDateKey(dayOffset(-1)), position: "A" }),
    line("Cake next month", { dueDate: toDateKey(dayOffset(30)), position: "B" }),
    line("Venue today", { dueDate: toDateKey(dayOffset(0)), position: "C" }),
    line("Done yesterday", {
      dueDate: toDateKey(dayOffset(-2)),
      checked: true,
      completedAt: dayOffset(-1).toISOString(),
      position: "D",
    }),
    line("Pinned", { position: "E" }),
    line("today>Pinned", { listId: "today", text: "", refEntryId: "Pinned", position: "V" }),
  ];

  it("pulls in lines due today or overdue after the pinned ones", async () => {
    await setup(today, entries);

    expect(shownTexts()).toEqual(["Pinned", "Overdue florist", "Venue today"]);
    expect(screen.getByLabelText("Rule: Due today or overdue")).toBeTruthy();
  });

  it("pins a pulled-in line when it's dragged into place", async () => {
    await setup(today, entries);

    const onMoveEntry = mockLastViewProps.current!.onMoveEntry as (id: string, after: null, before: string) => void;
    onMoveEntry("today>Venue today", null, "today>Pinned");

    expect(actions.addToFocusList).toHaveBeenCalledWith("today", ["Venue today"], expect.any(String));
    const [, , position] = actions.addToFocusList.mock.calls[0];
    expect(position < "V").toBe(true);
  });

  it("changes the rule", async () => {
    await setup(today, entries);

    await fireEvent.press(screen.getByLabelText("Rule: Due today or overdue"));
    await fireEvent.press(screen.getByText("No rule"));

    expect(actions.updateItem).toHaveBeenCalledWith("today", { focusRule: undefined });
  });

  it("has no rule lines without a rule", async () => {
    await setup({ ...today, focusRule: undefined }, entries);

    expect(shownTexts()).toEqual(["Pinned"]);
    expect(screen.getByLabelText("Add a rule")).toBeTruthy();
  });
});
