import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Keyboard } from "react-native";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ListScreen } from "./index";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import type { RootStackParamList } from "../../navigation/types";
import { TroveProvider, useTrove } from "../../storage/storage";
import { renderScreen } from "../../test-utils/renderScreen";
import type { Folder, ListEntry, SavedItem, TroveData } from "../../types/models";
import { legacyEntryPosition, sortEntries, UNTITLED_LIST_TITLE } from "../../utils/listEntries";
import { toDateKey } from "../../utils/listView";

// The page is run against the real store, so what a tap does is read back
// from saved data rather than from which function was called.
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ session: null, isAuthReady: true }),
}));

jest.mock("../../entitlements/EntitlementContext", () => ({
  useEntitlement: () => ({ isPro: false, isLoading: false }),
}));

jest.mock("../../lib/supabase", () => ({
  getSupabase: () => null,
}));

jest.mock("../../share/sharedImport", () => ({
  syncShareExtensionFolders: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../collaboration/useFolderShareStatus", () => ({
  useFolderShareStatus: jest.fn(),
}));

jest.mock("../../components/CommentThread", () => {
  const { createElement } = require("react");
  const { Text } = require("react-native");
  return {
    CommentThread: ({ targetId, targetType }: { targetId: string; targetType: string }) =>
      createElement(Text, null, `Comments on ${targetType} ${targetId}`),
  };
});

// Stand-in for the swipe gesture: the buttons a swipe to the left uncovers are
// always there to press.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const MockSwipeable = React.forwardRef(
    (
      {
        children,
        enabled,
        renderRightActions,
      }: { children: React.ReactNode; enabled?: boolean; renderRightActions?: () => React.ReactNode },
      _ref: unknown,
    ) => (
      <View>
        {children}
        {enabled !== false && renderRightActions?.()}
      </View>
    ),
  );
  return { __esModule: true, default: MockSwipeable };
});

// Keeps what the page last handed the editor, to stand in for a drag.
const mockEditorProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("../../components/ListEntriesView", () => {
  const { createElement, forwardRef } = jest.requireActual("react");
  const actual = jest.requireActual("../../components/ListEntriesView");
  return {
    ...actual,
    ListEntriesView: forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockEditorProps.current = props;
      return createElement(actual.ListEntriesView, { ...props, ref });
    }),
  };
});

const mockUseFolderShareStatus = useFolderShareStatus as jest.Mock;

const STORAGE_KEY = "trove:data:v1:anonymous";
const at = "2026-01-01T00:00:00.000Z";
const ADD_LINE = "Add a line to this list";

const folder = (id: string, name: string, overrides: Partial<Folder> = {}): Folder => ({
  id,
  name,
  parentFolderId: null,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

const list = (id: string, title: string, overrides: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title,
  type: "list",
  tagOptionIds: [],
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

// A line is named by its words, and lines sit in the order they are written.
let nextPosition = 0;
const line = (text: string, listId: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id: text,
  listId,
  kind: "check",
  text,
  checked: false,
  indentLevel: 0,
  position: legacyEntryPosition(nextPosition++),
  tagOptionIds: [],
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

// A line from another list, showing on `listId` as well.
const pulled = (sourceId: string, listId: string): ListEntry =>
  line("", listId, { id: `${listId}>${sourceId}`, refEntryId: sourceId });

const dayOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const save = async (data: Partial<TroveData>) => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ folders: [], items: [], listEntries: [], tagGroups: [], tagOptions: [], ...data }),
  );
};

// Three lists of the person's own. Nothing is shared and no list shows
// another list's lines.
const household = (): Partial<TroveData> => ({
  folders: [folder("house", "House"), folder("trips", "Trips")],
  items: [list("chores", "Chores"), list("today", "Today"), list("packing", "Packing", { folderId: "trips" })],
  listEntries: [
    line("Mow the lawn", "chores"),
    line("Clean gutters", "chores", { checked: true, completedAt: at }),
    line("Water plants", "chores"),
    line("Call mum", "today"),
    line("Passport", "packing"),
  ],
});

// Today also shows two of the chores, one of them already done.
const householdWithChoresOnToday = (): Partial<TroveData> => {
  const data = household();
  return {
    ...data,
    items: data.items!.map((item) => (item.id === "today" ? { ...item, listMode: "focus" as const } : item)),
    listEntries: [...data.listEntries!, pulled("Mow the lawn", "today"), pulled("Clean gutters", "today")],
  };
};

// Today adds lines by itself, and has one wedding line put there by hand.
const wedding = (todayOverrides: Partial<SavedItem> = {}): Partial<TroveData> => ({
  items: [
    list("wedding", "Wedding"),
    list("today", "Today", { listMode: "focus", focusRule: "due_today", ...todayOverrides }),
  ],
  listEntries: [
    line("Overdue florist", "wedding", { dueDate: toDateKey(dayOffset(-1)) }),
    line("Cake next month", "wedding", { dueDate: toDateKey(dayOffset(30)) }),
    line("Venue today", "wedding", { dueDate: toDateKey(dayOffset(0)) }),
    line("Done yesterday", "wedding", {
      dueDate: toDateKey(dayOffset(-2)),
      checked: true,
      completedAt: dayOffset(-1).toISOString(),
    }),
    line("Pinned", "wedding"),
    pulled("Pinned", "today"),
  ],
});

type Navigation = NativeStackScreenProps<RootStackParamList, "List">["navigation"];
type Route = NativeStackScreenProps<RootStackParamList, "List">["route"];

const leaveListeners = new Set<() => void>();
const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(),
  getState: jest.fn(),
  addListener: jest.fn((event: string, listener: () => void) => {
    if (event === "beforeRemove") leaveListeners.add(listener);
    return () => {
      leaveListeners.delete(listener);
    };
  }),
};

// The screen is closing, as after Back or a swipe from the edge.
const leave = async () => {
  await act(async () => {
    leaveListeners.forEach((listener) => listener());
  });
};

type TroveValue = ReturnType<typeof useTrove>;
const store: { current: TroveValue | null } = { current: null };
const Probe = () => {
  store.current = useTrove();
  return null;
};
const trove = () => store.current!;

type Opening = {
  isNew?: boolean;
  // The screen underneath, which Back returns to.
  from?: { name: string; params?: object };
};

const renderList = async (listId: string, { isNew, from = { name: "Home" } }: Opening = {}) => {
  const route = { key: "list-key", name: "List", params: isNew ? { listId, isNew } : { listId } };
  navigation.getState.mockReturnValue({ routes: [{ key: "under-key", ...from }, route] });
  await renderScreen(
    <TroveProvider>
      <Probe />
      <ListScreen navigation={navigation as unknown as Navigation} route={route as unknown as Route} />
    </TroveProvider>,
  );
};

const openList = async (listId: string, opening?: Opening) => {
  await renderList(listId, opening);
  await waitFor(() => expect(trove().isReady).toBe(true));
};

const savedList = (listId: string) => trove().items.find((item) => item.id === listId);
const savedLine = (id: string) => trove().listEntries.find((entry) => entry.id === id);
const linesOf = (listId: string) => sortEntries(trove().listEntries.filter((entry) => entry.listId === listId));
// The words of a list's own lines, in order.
const ownLines = (listId: string) =>
  linesOf(listId)
    .filter((entry) => !entry.refEntryId)
    .map((entry) => entry.text);
// The lines a list shows from other lists, in order.
const pulledInto = (listId: string) =>
  linesOf(listId)
    .filter((entry) => !!entry.refEntryId)
    .map((entry) => entry.refEntryId);

const shownLines = () => screen.queryAllByTestId("list-line-input").map((input) => input.props.value as string);
const title = () => screen.getByLabelText("List title");
const caption = (text: string) => screen.getByText(text);

const openMenu = async () => {
  await fireEvent.press(screen.getByLabelText("List options"));
};

// Opens the menu and picks one of its actions.
const choose = async (action: string) => {
  await openMenu();
  await fireEvent.press(screen.getByLabelText(action));
};

const menuActions = () => {
  const labels = screen.getAllByRole("button").map((button) => button.props.accessibilityLabel as string);
  return labels.slice(labels.indexOf("Close menu") + 1);
};

describe("ListScreen", () => {
  let alert: jest.SpyInstance;
  let dismissKeyboard: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    nextPosition = 0;
    leaveListeners.clear();
    store.current = null;
    mockEditorProps.current = null;
    navigation.canGoBack.mockReturnValue(true);
    mockUseFolderShareStatus.mockReturnValue({ isLoading: false, isShared: false });
    await AsyncStorage.clear();
    // Skip the one-time tag seeding so it doesn't add groups to the fixture.
    await AsyncStorage.setItem("trove:tagBackfillDone:anonymous", "true");
    await save(household());
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    dismissKeyboard = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  });

  afterEach(() => {
    alert.mockRestore();
    dismissKeyboard.mockRestore();
  });

  describe("opening a list", () => {
    it("shows its title, its lines in order and how many are done", async () => {
      await openList("chores");

      expect(title().props.value).toBe("Chores");
      expect(shownLines()).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
      expect(caption("1 of 3 done")).toBeTruthy();
      expect(within(screen.getByLabelText("Go back")).getByText("Trove")).toBeTruthy();
    });

    it("names the folder that Back returns to", async () => {
      await openList("packing", { from: { name: "Folder", params: { folderId: "trips" } } });

      expect(within(screen.getByLabelText("Go back")).getByText("Trips")).toBeTruthy();
    });

    it("counts nothing as done on a list with no checkboxes", async () => {
      await save({
        items: [list("ideas", "Ideas")],
        listEntries: [line("Paint the fence", "ideas", { kind: "bullet" }), line("Some day", "ideas", { kind: "text" })],
      });
      await openList("ideas");

      expect(shownLines()).toEqual(["Paint the fence", "Some day"]);
      expect(screen.queryByText(/done$/)).toBeNull();
    });

    it("leaves the title empty on a list that was never named", async () => {
      await save({ items: [list("unnamed", UNTITLED_LIST_TITLE)], listEntries: [line("Call the plumber", "unnamed")] });
      await openList("unnamed");

      expect(title().props.value).toBe("");
      expect(screen.getByPlaceholderText("Title")).toBeTruthy();
      expect(shownLines()).toEqual(["Call the plumber"]);
    });

    it("says so when the list isn't there", async () => {
      await openList("gone");

      expect(screen.getByText("This list isn't here any more.")).toBeTruthy();
      expect(screen.queryByLabelText("List title")).toBeNull();

      await fireEvent.press(screen.getByLabelText("Go back"));
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("waits for saved lists to load before saying a list is missing", async () => {
      const getItem = AsyncStorage.getItem as jest.Mock;
      const realGetItem = getItem.getMockImplementation();
      getItem.mockImplementation(() => new Promise(() => {}));
      try {
        await renderList("chores");

        expect(trove().isReady).toBe(false);
        expect(screen.queryByText("This list isn't here any more.")).toBeNull();
        expect(screen.queryByLabelText("List title")).toBeNull();
        expect(screen.getByLabelText("Go back")).toBeTruthy();
      } finally {
        getItem.mockImplementation(realGetItem);
      }
    });
  });

  describe("the title", () => {
    it("renames the list once the cursor leaves the title", async () => {
      await openList("chores");

      await fireEvent(title(), "focus");
      await fireEvent.changeText(title(), "  Weekend   chores ");
      expect(savedList("chores")!.title).toBe("Chores");
      await fireEvent(title(), "blur");

      expect(savedList("chores")!.title).toBe("Weekend chores");
      expect(title().props.value).toBe("Weekend chores");
    });

    it("renames the list on Return", async () => {
      await openList("chores");

      await fireEvent.changeText(title(), "Weekend");
      await fireEvent(title(), "submitEditing");

      expect(savedList("chores")!.title).toBe("Weekend");
    });

    it("takes a line break typed at the end of the title as Return", async () => {
      await openList("chores");

      await fireEvent.changeText(title(), "Weekend\n");

      expect(savedList("chores")!.title).toBe("Weekend");
      expect(title().props.value).toBe("Weekend");
    });

    it("keeps a title pasted over several lines on one line", async () => {
      await openList("chores");

      await fireEvent(title(), "focus");
      await fireEvent.changeText(title(), "Weekend\nchores");
      expect(title().props.value).toBe("Weekend chores");
      await fireEvent(title(), "blur");

      expect(savedList("chores")!.title).toBe("Weekend chores");
    });

    it("goes back to an unnamed list when the title is emptied", async () => {
      await openList("chores");

      await fireEvent(title(), "focus");
      await fireEvent.changeText(title(), "   ");
      await fireEvent(title(), "blur");

      expect(savedList("chores")!.title).toBe(UNTITLED_LIST_TITLE);
      expect(title().props.value).toBe("");
    });

    it("leaves the list alone when the title wasn't changed", async () => {
      await openList("chores");

      await fireEvent(title(), "focus");
      await fireEvent(title(), "blur");

      expect(savedList("chores")!.updatedAt).toBe(at);
    });

    it("starts a new list with the cursor in the title", async () => {
      await save({ items: [list("fresh", UNTITLED_LIST_TITLE)] });
      await openList("fresh", { isNew: true });

      expect(title().props.autoFocus).toBe(true);
      expect(screen.getByPlaceholderText("Start typing")).toBeTruthy();
    });

    it("doesn't take the cursor when an existing list is opened", async () => {
      await openList("chores");

      expect(title().props.autoFocus).toBe(false);
    });
  });

  describe("its lines", () => {
    it("adds a typed line to the end of the list", async () => {
      await openList("chores");

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Sweep the porch\n");

      expect(shownLines()).toEqual(["Mow the lawn", "Clean gutters", "Water plants", "Sweep the porch"]);
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants", "Sweep the porch"]);
      expect(caption("1 of 4 done")).toBeTruthy();
    });

    it("adds every line of a pasted list", async () => {
      await openList("today");

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "- Post letters\n- [x] Buy stamps");

      expect(ownLines("today")).toEqual(["Call mum", "Post letters", "Buy stamps"]);
      expect(caption("1 of 3 done")).toBeTruthy();
    });

    it("checks a line off", async () => {
      await openList("chores");

      await fireEvent.press(screen.getAllByRole("checkbox")[0]);

      expect(savedLine("Mow the lawn")!.checked).toBe(true);
      expect(caption("2 of 3 done")).toBeTruthy();
    });

    it("saves a change to a line's words", async () => {
      await openList("chores");

      await fireEvent(screen.getByLabelText("Mow the lawn"), "focus");
      await fireEvent.changeText(screen.getByLabelText("Mow the lawn"), "Mow the back lawn");
      await fireEvent(screen.getByLabelText("Mow the lawn"), "blur");

      expect(savedLine("Mow the lawn")!.text).toBe("Mow the back lawn");
      expect(shownLines()).toEqual(["Mow the back lawn", "Clean gutters", "Water plants"]);
    });

    it("deletes a line, and puts it back where it was on Undo", async () => {
      await openList("chores");

      await fireEvent.press(screen.getByLabelText("Delete Clean gutters"));
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Water plants"]);
      expect(caption("0 of 2 done")).toBeTruthy();

      await fireEvent.press(screen.getByText("Undo"));
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
    });

    it("moves a line to another list, and back on Undo", async () => {
      await openList("chores");

      await fireEvent.press(screen.getByLabelText("Move Water plants to another list"));
      await fireEvent.press(screen.getByLabelText("Move to Packing"));

      expect(screen.getByText("Moved to Packing")).toBeTruthy();
      expect(ownLines("packing")).toEqual(["Passport", "Water plants"]);
      expect(shownLines()).toEqual(["Mow the lawn", "Clean gutters"]);

      await fireEvent.press(screen.getByText("Undo"));
      expect(ownLines("packing")).toEqual(["Passport"]);
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
    });
  });

  describe("the menu", () => {
    it("offers everything that can be done with a list of your own", async () => {
      await openList("chores");
      await openMenu();

      expect(menuActions()).toEqual([
        "Select lines",
        "Add lines from another list",
        "Add lines automatically",
        "Sort",
        "Checked lines",
        "Uncheck all",
        "Clear checked lines",
        "Move to folder",
        "Delete list",
      ]);
      expect(dismissKeyboard).toHaveBeenCalled();
    });

    it("says how the list is set up at the moment", async () => {
      await openList("packing");
      await openMenu();

      expect(within(screen.getByLabelText("Add lines automatically")).getByText("Off")).toBeTruthy();
      expect(within(screen.getByLabelText("Sort")).getByText("My order")).toBeTruthy();
      expect(within(screen.getByLabelText("Checked lines")).getByText("Keep in place")).toBeTruthy();
      expect(within(screen.getByLabelText("Move to folder")).getByText("Trips")).toBeTruthy();
    });

    it("leaves out what there is nothing to do with", async () => {
      await save({ items: [list("empty", "Empty")] });
      await openList("empty");
      await openMenu();

      expect(menuActions()).toEqual(["Add lines automatically", "Sort", "Checked lines", "Move to folder", "Delete list"]);
    });

    it("closes when the page behind it is tapped", async () => {
      await openList("chores");
      await openMenu();

      await fireEvent.press(screen.getByLabelText("Close menu"));

      expect(screen.queryByLabelText("Delete list")).toBeNull();
    });

    it("sorts the lines, says so under the title and remembers it", async () => {
      await openList("chores");

      await choose("Sort");
      expect(screen.getByText("Sort by")).toBeTruthy();
      await fireEvent.press(screen.getByText("A to Z"));

      expect(shownLines()).toEqual(["Clean gutters", "Mow the lawn", "Water plants"]);
      expect(caption("1 of 3 done · Sorted A to Z")).toBeTruthy();
      expect(screen.queryByText("Sort by")).toBeNull();
      // The lines themselves stay in the order they were put in.
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
      await waitFor(async () =>
        expect(JSON.parse((await AsyncStorage.getItem("trove:listView:chores"))!)).toEqual({
          sortMode: "alpha",
          completedMode: "inline",
        }),
      );
    });

    it("opens a list the way it was last sorted", async () => {
      await AsyncStorage.setItem("trove:listView:chores", JSON.stringify({ sortMode: "alpha", completedMode: "bottom" }));
      await openList("chores");

      await waitFor(() => expect(shownLines()).toEqual(["Mow the lawn", "Water plants", "Clean gutters"]));
      expect(caption("1 of 3 done · Sorted A to Z")).toBeTruthy();
    });

    it("hides checked lines when asked to", async () => {
      await openList("chores");

      await choose("Checked lines");
      await fireEvent.press(screen.getByText("Hide"));

      expect(shownLines()).toEqual(["Mow the lawn", "Water plants"]);
      expect(screen.getByText("1 completed line hidden · Show")).toBeTruthy();

      await fireEvent.press(screen.getByText("1 completed line hidden · Show"));
      expect(shownLines()).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
    });

    it("unchecks every line at once, and checks them again on Undo", async () => {
      await openList("chores");

      await choose("Uncheck all");
      expect(caption("0 of 3 done")).toBeTruthy();
      expect(screen.getByText("Unchecked 1 line")).toBeTruthy();
      expect(savedLine("Clean gutters")!.checked).toBe(false);

      await fireEvent.press(screen.getByText("Undo"));
      expect(caption("1 of 3 done")).toBeTruthy();
      expect(savedLine("Clean gutters")!.checked).toBe(true);
    });

    it("clears checked lines off the list, and puts them back on Undo", async () => {
      await openList("chores");

      await choose("Clear checked lines");
      expect(screen.getByText("Cleared 1 line")).toBeTruthy();
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Water plants"]);

      await fireEvent.press(screen.getByText("Undo"));
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
    });

    it("selects lines until Done", async () => {
      await openList("chores");

      await choose("Select lines");
      expect(screen.getByText("Tap lines to select them")).toBeTruthy();
      expect(screen.queryByLabelText("List options")).toBeNull();
      expect(screen.queryByLabelText(ADD_LINE)).toBeNull();

      await fireEvent.press(screen.getByLabelText("Select Mow the lawn"));
      await fireEvent.press(screen.getByLabelText("Select Water plants"));
      expect(screen.getByText("2 selected")).toBeTruthy();

      await fireEvent.press(screen.getByLabelText("Done"));
      expect(screen.queryByText("2 selected")).toBeNull();
      expect(screen.getByLabelText("List options")).toBeTruthy();
    });

    it("moves the list into a folder", async () => {
      await openList("chores");

      await choose("Move to folder");
      expect(screen.getByText("Move to folder")).toBeTruthy();
      await fireEvent.press(screen.getByText("Trips"));

      expect(savedList("chores")!.folderId).toBe("trips");
      expect(screen.queryByText("Search folders...")).toBeNull();
    });

    it("moves the list back out of its folder", async () => {
      await openList("packing", { from: { name: "Search" } });

      await choose("Move to folder");
      await fireEvent.press(screen.getByText("Trove"));

      expect(savedList("packing")!.folderId).toBe("");
    });

    it("leaves the list where it is when its own folder is picked", async () => {
      await openList("packing", { from: { name: "Search" } });

      await choose("Move to folder");
      await fireEvent.press(screen.getByText("Trips"));

      expect(savedList("packing")!.updatedAt).toBe(at);
    });

    it("asks before deleting, and keeps the list on Cancel", async () => {
      await openList("chores");

      await choose("Delete list");

      expect(alert).toHaveBeenCalledWith(
        "Delete this list?",
        "Its lines are deleted too. Lines pulled in from other lists stay in those lists.",
        [expect.objectContaining({ text: "Cancel", style: "cancel" }), expect.objectContaining({ text: "Delete", style: "destructive" })],
      );
      expect(savedList("chores")).toBeDefined();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it("deletes the list and its lines once that's confirmed, and goes back", async () => {
      await openList("chores");

      await choose("Delete list");
      const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
      await act(async () => {
        buttons.find((button) => button.text === "Delete")!.onPress!();
      });
      await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));

      expect(savedList("chores")).toBeUndefined();
      expect(linesOf("chores")).toEqual([]);
      expect(ownLines("today")).toEqual(["Call mum"]);
      // The page is blank while it closes, not an apology for a missing list.
      expect(screen.queryByText("This list isn't here any more.")).toBeNull();
    });
  });

  describe("lines from other lists", () => {
    it("pulls a line in, says where it's from and leaves it in its own list", async () => {
      await openList("today");

      await choose("Add lines from another list");
      expect(screen.getByText("Add to Today")).toBeTruthy();
      // Lines that are already done aren't offered.
      expect(screen.queryByLabelText("Clean gutters, from Chores")).toBeNull();
      await fireEvent.press(screen.getByLabelText("Mow the lawn, from Chores"));

      expect(screen.getByLabelText("Mow the lawn, from Chores").props.accessibilityState).toEqual({ checked: true });
      await fireEvent.press(screen.getByText("Done"));

      expect(shownLines()).toEqual(["Call mum", "Mow the lawn"]);
      expect(within(screen.getByLabelText("Details for Mow the lawn")).getByText("Chores")).toBeTruthy();
      expect(pulledInto("today")).toEqual(["Mow the lawn"]);
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
      expect(savedList("today")!.listMode).toBe("focus");
    });

    it("takes a pulled line back off from the same place", async () => {
      await save(householdWithChoresOnToday());
      await openList("today");

      await choose("Add lines from another list");
      await fireEvent.press(screen.getByLabelText("Mow the lawn, from Chores"));
      await fireEvent.press(screen.getByText("Done"));

      expect(shownLines()).toEqual(["Call mum", "Clean gutters"]);
      expect(pulledInto("today")).toEqual(["Clean gutters"]);
      expect(ownLines("chores")).toContain("Mow the lawn");
    });

    it("checks off the original when a pulled line is checked here", async () => {
      await save(householdWithChoresOnToday());
      await openList("today");

      expect(shownLines()).toEqual(["Call mum", "Mow the lawn", "Clean gutters"]);
      expect(caption("1 of 3 done")).toBeTruthy();
      await fireEvent.press(screen.getAllByRole("checkbox")[1]);

      expect(savedLine("Mow the lawn")!.checked).toBe(true);
      expect(caption("2 of 3 done")).toBeTruthy();
    });

    it("changes the original when a pulled line is reworded here", async () => {
      await save(householdWithChoresOnToday());
      await openList("today");

      await fireEvent(screen.getByLabelText("Mow the lawn"), "focus");
      await fireEvent.changeText(screen.getByLabelText("Mow the lawn"), "Mow both lawns");
      await fireEvent(screen.getByLabelText("Mow the lawn"), "blur");

      expect(savedLine("Mow the lawn")!.text).toBe("Mow both lawns");
      expect(ownLines("chores")).toEqual(["Mow both lawns", "Clean gutters", "Water plants"]);
    });

    it("takes a pulled line off this list without deleting it", async () => {
      await save(householdWithChoresOnToday());
      await openList("today");

      await fireEvent.press(screen.getByLabelText("Remove Mow the lawn from this list"));

      expect(shownLines()).toEqual(["Call mum", "Clean gutters"]);
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);
    });

    it("clears finished lines without deleting the ones from other lists", async () => {
      await save(householdWithChoresOnToday());
      await openList("today");
      await fireEvent.press(screen.getAllByRole("checkbox")[0]);

      await choose("Clear checked lines");

      expect(screen.getByText("Cleared 2 lines")).toBeTruthy();
      expect(shownLines()).toEqual(["Mow the lawn"]);
      expect(ownLines("today")).toEqual([]);
      expect(ownLines("chores")).toEqual(["Mow the lawn", "Clean gutters", "Water plants"]);

      await fireEvent.press(screen.getByText("Undo"));
      expect(shownLines()).toEqual(["Call mum", "Mow the lawn", "Clean gutters"]);
    });

    it("unchecks the originals when everything is unchecked", async () => {
      await save(householdWithChoresOnToday());
      await openList("today");

      await choose("Uncheck all");

      expect(savedLine("Clean gutters")!.checked).toBe(false);
      expect(caption("0 of 3 done")).toBeTruthy();
    });

    it("says on a line's own list where else it shows", async () => {
      await save(householdWithChoresOnToday());
      await openList("chores");

      expect(within(screen.getByLabelText("Details for Mow the lawn")).getByText("On Today")).toBeTruthy();
      expect(screen.queryByLabelText("Details for Water plants")).toBeNull();
    });

    it("doesn't pull lines into a list whose own lines show somewhere else", async () => {
      await save(householdWithChoresOnToday());
      await openList("chores");
      await openMenu();

      expect(menuActions()).not.toContain("Add lines from another list");
      expect(menuActions()).not.toContain("Add lines automatically");
    });

    it("puts a line on another list from the line itself, and takes it off on Undo", async () => {
      await openList("chores");

      await fireEvent.press(screen.getByLabelText("Add Mow the lawn to another list"));
      await fireEvent.press(screen.getByLabelText("Add to Today"));

      expect(screen.getByText("Added to Today")).toBeTruthy();
      expect(pulledInto("today")).toEqual(["Mow the lawn"]);
      expect(within(screen.getByLabelText("Details for Mow the lawn")).getByText("On Today")).toBeTruthy();

      await fireEvent.press(screen.getByText("Undo"));
      expect(pulledInto("today")).toEqual([]);
    });

    it("only offers lists that can take another list's lines", async () => {
      await save(householdWithChoresOnToday());
      await openList("packing");

      await fireEvent.press(screen.getByLabelText("Add Passport to another list"));

      // Chores lends its lines to Today, so it can't borrow any.
      expect(screen.getByLabelText("Add to Today")).toBeTruthy();
      expect(screen.queryByLabelText("Add to Chores")).toBeNull();
    });
  });

  describe("lines a list adds by itself", () => {
    it("adds lines due today or overdue after the ones put there by hand", async () => {
      await save(wedding());
      await openList("today");

      expect(shownLines()).toEqual(["Pinned", "Overdue florist", "Venue today"]);
      expect(caption("0 of 3 done · Adds lines due today or overdue")).toBeTruthy();
      // Nothing is saved for them: they come and go with their due dates.
      expect(pulledInto("today")).toEqual(["Pinned"]);

      await openMenu();
      expect(within(screen.getByLabelText("Add lines automatically")).getByText("Due today or overdue")).toBeTruthy();
    });

    it("keeps a line it added where that line is dragged to", async () => {
      await save(wedding());
      await openList("today");

      const onMoveEntry = mockEditorProps.current!.onMoveEntry as (id: string, after: string | null, before: string | null) => void;
      await act(async () => {
        onMoveEntry("today>Venue today", null, "today>Pinned");
      });

      expect(pulledInto("today")).toEqual(["Venue today", "Pinned"]);
      expect(shownLines()).toEqual(["Venue today", "Pinned", "Overdue florist"]);
    });

    it("moves a line that was put there by hand like any other", async () => {
      await save({ ...wedding(), listEntries: [...wedding().listEntries!, pulled("Cake next month", "today")] });
      await openList("today");
      expect(shownLines().slice(0, 2)).toEqual(["Pinned", "Cake next month"]);

      const onMoveEntry = mockEditorProps.current!.onMoveEntry as (id: string, after: string | null, before: string | null) => void;
      await act(async () => {
        onMoveEntry("today>Cake next month", null, "today>Pinned");
      });

      expect(pulledInto("today")).toEqual(["Cake next month", "Pinned"]);
    });

    it("checks off the original of a line it added", async () => {
      await save(wedding());
      await openList("today");

      await fireEvent.press(screen.getAllByRole("checkbox")[2]);

      expect(savedLine("Venue today")!.checked).toBe(true);
    });

    it("can't delete a line it added, only the list's rule decides", async () => {
      await save(wedding());
      await openList("today");

      expect(screen.getByLabelText("Remove Pinned from this list")).toBeTruthy();
      expect(screen.queryByLabelText("Remove Venue today from this list")).toBeNull();
      expect(screen.queryByLabelText("Delete Venue today")).toBeNull();
    });

    it("stops adding lines when that is turned off", async () => {
      await save(wedding());
      await openList("today");

      await choose("Add lines automatically");
      await fireEvent.press(screen.getByText("Off"));

      expect(savedList("today")!.focusRule).toBeUndefined();
      expect(shownLines()).toEqual(["Pinned"]);
      expect(caption("0 of 1 done")).toBeTruthy();
    });

    it("starts adding lines when a rule is picked", async () => {
      await openList("today");

      await choose("Add lines automatically");
      expect(screen.getByText("Only lines you add yourself")).toBeTruthy();
      await fireEvent.press(screen.getByText("Due today or overdue"));

      expect(savedList("today")).toMatchObject({ listMode: "focus", focusRule: "due_today" });
      expect(caption("0 of 1 done · Adds lines due today or overdue")).toBeTruthy();
    });

    it("adds nothing without a rule", async () => {
      await save(wedding({ focusRule: undefined }));
      await openList("today");

      expect(shownLines()).toEqual(["Pinned"]);
    });

    it("still has room to type when its rule finds nothing", async () => {
      await save({
        items: [list("wedding", "Wedding"), list("today", "Today", { listMode: "focus", focusRule: "due_today" })],
        listEntries: [line("Cake next month", "wedding", { dueDate: toDateKey(dayOffset(30)) })],
      });
      await openList("today");

      expect(shownLines()).toEqual([]);
      expect(caption("Adds lines due today or overdue")).toBeTruthy();
      expect(screen.getByPlaceholderText("Start typing")).toBeTruthy();
    });
  });

  describe("leaving", () => {
    it("goes back", async () => {
      await openList("chores");

      await fireEvent.press(screen.getByLabelText("Go back"));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it("goes Home when there is nothing to go back to", async () => {
      navigation.canGoBack.mockReturnValue(false);
      await openList("chores");

      await fireEvent.press(screen.getByLabelText("Go back"));

      expect(navigation.navigate).toHaveBeenCalledWith("Home");
    });

    it("throws away a new list left with no title and no lines", async () => {
      await save({ items: [list("fresh", UNTITLED_LIST_TITLE), list("chores", "Chores")] });
      await openList("fresh", { isNew: true });

      await leave();

      await waitFor(() => expect(savedList("fresh")).toBeUndefined());
      expect(savedList("chores")).toBeDefined();
    });

    it("keeps a list that was given a title, saving it on the way out", async () => {
      await save({ items: [list("fresh", UNTITLED_LIST_TITLE)] });
      await openList("fresh", { isNew: true });

      await fireEvent(title(), "focus");
      await fireEvent.changeText(title(), "Birthday ideas");
      await leave();

      expect(savedList("fresh")!.title).toBe("Birthday ideas");
    });

    it("keeps a list for the line still being typed, saving that too", async () => {
      await save({ items: [list("fresh", UNTITLED_LIST_TITLE)] });
      await openList("fresh", { isNew: true });

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Balloons");
      await leave();

      expect(savedList("fresh")).toBeDefined();
      expect(ownLines("fresh")).toEqual(["Balloons"]);
    });

    it("keeps an unnamed list that has lines", async () => {
      await save({ items: [list("unnamed", UNTITLED_LIST_TITLE)], listEntries: [line("Call the plumber", "unnamed")] });
      await openList("unnamed");

      await leave();

      expect(savedList("unnamed")).toBeDefined();
    });

    it("keeps an empty list that shows lines from other lists", async () => {
      await save({
        items: [list("chores", "Chores"), list("later", UNTITLED_LIST_TITLE, { listMode: "focus" })],
        listEntries: [line("Mow the lawn", "chores"), pulled("Mow the lawn", "later")],
      });
      await openList("later");

      await leave();

      expect(savedList("later")).toBeDefined();
    });

    it("stops listening once the page has gone", async () => {
      await openList("chores");
      expect(leaveListeners.size).toBe(1);

      await screen.unmount();

      expect(leaveListeners.size).toBe(0);
    });
  });

  describe("a list someone else shared", () => {
    const sharedTo = (accessRole: "editor" | "viewer"): Partial<TroveData> => ({
      folders: [folder("family", "Family", { accessRole, ownerId: "someone-else" })],
      items: [list("party", "Party", { folderId: "family", accessRole, ownerId: "someone-else" })],
      listEntries: [line("Balloons", "party"), line("Cake", "party", { checked: true, completedAt: at })],
    });

    it("can be read but not changed by someone who can only view it", async () => {
      await save(sharedTo("viewer"));
      await openList("party");

      expect(screen.getByRole("header", { name: "Party" })).toBeTruthy();
      expect(screen.queryByLabelText("List title")).toBeNull();
      expect(caption("1 of 2 done · Shared · Can view · View only")).toBeTruthy();
      expect(shownLines()).toEqual([]);
      expect(screen.getByText("Balloons")).toBeTruthy();
      expect(screen.queryByLabelText(ADD_LINE)).toBeNull();

      await openMenu();
      expect(menuActions()).toEqual(["Sort", "Checked lines"]);
    });

    it("isn't thrown away for being empty when a viewer leaves it", async () => {
      await save({ ...sharedTo("viewer"), listEntries: [] });
      await openList("party");
      expect(screen.getByText("Nothing on this list yet.")).toBeTruthy();

      await leave();

      expect(savedList("party")).toBeDefined();
    });

    it("can be changed by someone who can edit it, and says it's shared", async () => {
      await save(sharedTo("editor"));
      await openList("party");

      expect(title().props.value).toBe("Party");
      expect(caption("1 of 2 done · Shared · Can edit")).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText(ADD_LINE), "Candles\n");
      expect(ownLines("party")).toEqual(["Balloons", "Cake", "Candles"]);
    });

    it("isn't thrown away for being empty when an editor leaves it", async () => {
      await save({ ...sharedTo("editor"), items: [list("party", UNTITLED_LIST_TITLE, { folderId: "family", accessRole: "editor", ownerId: "someone-else" })], listEntries: [] });
      await openList("party");

      await leave();

      expect(savedList("party")).toBeDefined();
    });

    it("has its comments underneath", async () => {
      await save(sharedTo("editor"));
      await openList("party");

      expect(screen.getByText("Comments on item party")).toBeTruthy();
    });

    it("has comments underneath when you shared its folder yourself", async () => {
      mockUseFolderShareStatus.mockReturnValue({ isLoading: false, isShared: true });
      await openList("packing");

      expect(mockUseFolderShareStatus).toHaveBeenCalledWith("trips");
      expect(screen.getByText("Comments on item packing")).toBeTruthy();
    });

    it("has no comments on a list that isn't shared", async () => {
      await openList("chores");

      expect(mockUseFolderShareStatus).toHaveBeenCalledWith(undefined);
      expect(screen.queryByText(/^Comments on/)).toBeNull();
    });
  });
});
