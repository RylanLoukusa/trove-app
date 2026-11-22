import React, {
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { runOnJS, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bold,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  Tag,
  CircleCheck,
  CornerUpRight,
  FolderInput,
  Globe,
  ImagePlus,
  Info,
  Link2,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListPlus,
  Repeat,
  Trash2,
  UserRound,
  Undo2,
} from "lucide-react-native";

import { cardFieldsLabel, CollectionGrid } from "./CollectionGrid";
import { LineImageView, nextLineImageSize } from "./LineImages";
import { ListEntrySheet } from "./ListEntrySheet";
import { MenuAction, MenuSheet } from "./MenuSheet";
import {
  BulletMark,
  CheckMark,
  INDENT_WIDTH,
  LINE_FONT_SIZE,
  LINE_HEIGHT,
  LINE_PADDING_Y,
  LINE_ROW_HEIGHT,
  MARKER_WIDTH,
} from "./ListMarks";
import { ListTarget, SendMode, SendToListSheet, useRecentListTargets } from "./SendToListSheet";
import { spacing, ThemeColors, withAlpha } from "../theme/theme";
import { pickLineImages } from "../media/lineImages";
import { useThemeColors } from "../theme/ThemeContext";
import type { LineImage, LineImageSize, ListEntry, ListItemKind, TagOption } from "../types/models";
import { extractLinks } from "../utils/links";
import { formatTime, repeatLabels } from "../utils/schedule";
import { formatPrice, formatQuantity, formatRating, linkHost } from "../utils/fields";
import { parseSmartText, SmartFields } from "../utils/smartText";
import { assigneeLabel, ListPerson, personLabel } from "../collaboration/listPeople";
import { TIP_TEXT, useTip } from "../tips/TipsContext";
import { TipBubble } from "../tips/TipBubble";
import { collapsibleEnd, lineGroupEnd, MAX_ENTRY_INDENT, PastedLine, splitEnteredText, withLineImageSize } from "../utils/listEntries";
import {
  describeDueDate,
  quickDueDates,
  DueTone,
  entryPriority,
  listSortLabels,
  ListViewSettings,
  orderEntriesForView,
  TagSection,
} from "../utils/listView";

export type EntryUpdates = Partial<
  Pick<
    ListEntry,
    | "text"
    | "kind"
    | "bold"
    | "images"
    | "dueDate"
    | "dueTime"
    | "repeat"
    | "quantity"
    | "price"
    | "rating"
    | "link"
    | "assigneeId"
    | "assigneeName"
    | "notes"
    | "tagOptionIds"
    | "indentLevel"
  >
>;

// A line to add: its text, plus how it is marked when that is already known.
export type NewLine = PastedLine & { kind?: ListItemKind; bold?: boolean; images?: LineImage[] } & SmartFields;

export type ListEntriesViewHandle = {
  showToast: (message: string, undo?: () => void) => void;
  // Saves text still sitting in the bottom line. Returns whether it added a line.
  flush: () => boolean;
};

type LineFormat = { kind: ListItemKind; bold: boolean; indentLevel: number };

// Shared by every line's text box so iOS shows one bar above the keyboard.
const ADD_ROW_ID = "__add";
const COMMIT_DELAY_MS = 700;
// Space between the screen edge and a line; also where a line is held to drag it.
const GUTTER = 20;
const SELECT_BAR_HEIGHT = 76;
// The format bar: a row of 38pt buttons with 4pt above and below.
const KEYBOARD_BAR_HEIGHT = 46;

type Props = {
  entries: ListEntry[];
  priorityOptions: TagOption[];
  // Every tag group with its tags, for line details and what shows under a line.
  tagSections?: TagSection[];
  canEdit: boolean;
  // How the list is sorted and where finished lines go.
  settings: ListViewSettings;
  onChangeSettings: (updates: Partial<ListViewSettings>) => void;
  // Picking several lines to send, check off or delete together.
  selecting: boolean;
  onChangeSelecting: (selecting: boolean) => void;
  onToggleEntry: (entry: ListEntry) => void;
  onSetChecked?: (entryIds: string[], checked: boolean) => void;
  onUpdateEntry: (entryId: string, updates: EntryUpdates) => void;
  // Puts lines, in the order given, between two lines (null: the start or end).
  onReorderEntries: (entryIds: string[], afterEntryId: string | null, beforeEntryId: string | null) => void;
  // Adds lines right after a line (null: at the end) and returns their ids.
  onInsertEntries: (afterEntryId: string | null, lines: NewLine[]) => string[];
  onDeleteEntry: (entryId: string) => void;
  // Small line under an entry's text, such as the list a pulled-in line
  // comes from, or the lists a line also shows on.
  captions?: Record<string, string>;
  // Entries that are lines from another list: deleting one only takes it off
  // this list.
  referenceSources?: Record<string, string>;
  // Lines a list's rule pulled in; they can't be removed by hand.
  ruleEntryIds?: Set<string>;
  // Lists a line can also be shown on, the lists each line is already on, and
  // the action itself. Adding a single line to a list it is already on takes
  // it off again. Returns what happened, or null when nothing did.
  linkTargets?: ListTarget[];
  linkedListIds?: Record<string, string[]>;
  onLinkEntries?: (
    entryIds: string[],
    listId: string,
  ) => { listTitle: string; count: number; removed?: boolean; undo?: () => void } | null;
  // Lists a line can be moved to, and the move itself. Returns the target's
  // title and an undo, or null when nothing moved.
  moveTargets?: ListTarget[];
  onMoveEntries?: (entryIds: string[], listId: string) => { listTitle: string; undo: () => void } | null;
  // Puts deleted lines back (Undo).
  onRestoreEntries?: (entries: ListEntry[]) => void;
  // Drawn above and below the lines, inside the same scrolling page.
  header?: ReactNode;
  footer?: ReactNode;
  emptyText?: string;
  // Bump to put the cursor in the bottom line (e.g. after the list's title).
  focusAddSignal?: number;
  // "gallery" shows the lines as cards (a Collection) instead of rows.
  layout?: "lines" | "gallery";
  // Reads dates, times, priority, tags, price and quantity out of a typed
  // line (on unless turned off).
  smartText?: boolean;
  // On a shared list: the people a line can be given to, and who "Me" is.
  people?: ListPerson[];
  myUserId?: string;
};

// Index the dragged row should land on, given how far it has moved and the
// measured height of every row. Exported for its tests.
export const targetIndexFor = (startIndex: number, translationY: number, heights: number[]): number => {
  let index = startIndex;
  let remaining = translationY;
  if (remaining > 0) {
    while (index < heights.length - 1 && remaining > heights[index + 1] / 2) {
      remaining -= heights[index + 1];
      index += 1;
    }
  } else {
    while (index > 0 && -remaining > heights[index - 1] / 2) {
      remaining += heights[index - 1];
      index -= 1;
    }
  }
  return index;
};

// The lines being dragged together, from `start` up to (not including) `end`.
type DragBlock = { start: number; end: number };

// Row heights with the dragged lines counted as one row, so they move past
// other lines as a block. Exported for its tests.
export const blockHeights = (heights: number[], block: DragBlock): number[] => [
  ...heights.slice(0, block.start),
  heights.slice(block.start, block.end).reduce((total, height) => total + height, 0),
  ...heights.slice(block.end),
];

// A bold line with no marker reads as a heading.
const isHeading = (entry: Pick<ListEntry, "kind" | "bold">): boolean => entry.kind === "text" && !!entry.bold;

// How the line after `index` should be marked: like the line itself, except
// after a heading, where it follows the lines around the heading instead.
const kindAfter = (entries: ListEntry[], index: number): ListItemKind => {
  const line = entries[index];
  if (!line) return "check";
  if (!isHeading(line)) return line.kind;
  for (let i = index - 1; i >= 0; i -= 1) if (!isHeading(entries[i])) return entries[i].kind;
  for (let i = index + 1; i < entries.length; i += 1) if (!isHeading(entries[i])) return entries[i].kind;
  return "check";
};

const clampIndent = (level: number): number => Math.max(0, Math.min(level, MAX_ENTRY_INDENT));

const countLabel = (count: number): string => (count === 1 ? "1 line" : `${count} lines`);

export const ListEntriesView = forwardRef<ListEntriesViewHandle, Props>(function ListEntriesView(
  {
    entries,
    priorityOptions,
    tagSections,
    canEdit,
    settings,
    onChangeSettings,
    selecting,
    onChangeSelecting,
    onToggleEntry,
    onSetChecked,
    onUpdateEntry,
    onReorderEntries,
    onInsertEntries,
    onDeleteEntry,
    captions,
    referenceSources,
    ruleEntryIds,
    linkTargets,
    linkedListIds,
    onLinkEntries,
    moveTargets,
    onMoveEntries,
    onRestoreEntries,
    header,
    footer,
    emptyText = "Nothing on this list yet.",
    focusAddSignal,
    layout = "lines",
    smartText = true,
    people = [],
    myUserId,
  },
  ref,
) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [draft, setDraftState] = useState("");
  const draftRef = useRef("");
  const setDraft = useCallback((next: string) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const orderedEntries = useMemo(
    () => orderEntriesForView(entries, settings, priorityOptions),
    [entries, priorityOptions, settings],
  );
  const hiddenCount = entries.length - orderedEntries.length;

  // --- Folding -------------------------------------------------------------
  // In your own order a heading or a line with lines under it can be folded
  // shut. `foldSizes`: how many lines each foldable line has under it.
  // `hiddenUnder`: the lines each folded line is hiding, in order.
  const { visibleEntries, foldSizes, hiddenUnder } = useMemo(() => {
    const sizes = new Map<string, number>();
    const hidden = new Map<string, string[]>();
    if (settings.sortMode !== "manual" || layout === "gallery") {
      return { visibleEntries: orderedEntries, foldSizes: sizes, hiddenUnder: hidden };
    }
    const collapsed = new Set(settings.collapsedIds ?? []);
    const shown: ListEntry[] = [];
    orderedEntries.forEach((entry, index) => {
      const end = collapsibleEnd(orderedEntries, index);
      if (end > index + 1) sizes.set(entry.id, end - index - 1);
    });
    let index = 0;
    while (index < orderedEntries.length) {
      const entry = orderedEntries[index];
      shown.push(entry);
      const size = sizes.get(entry.id) ?? 0;
      if (size > 0 && collapsed.has(entry.id)) {
        hidden.set(entry.id, orderedEntries.slice(index + 1, index + 1 + size).map((line) => line.id));
        index += size + 1;
      } else {
        index += 1;
      }
    }
    return { visibleEntries: shown, foldSizes: sizes, hiddenUnder: hidden };
  }, [layout, orderedEntries, settings.collapsedIds, settings.sortMode]);

  const toggleFold = useCallback(
    (entryId: string) => {
      const current = settings.collapsedIds ?? [];
      onChangeSettings({
        collapsedIds: current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId],
      });
    },
    [onChangeSettings, settings.collapsedIds],
  );

  // A line added at the bottom goes under the last line shown; when that
  // line is folded, it is opened so the new line can be seen.
  const unfoldEnd = () => {
    const last = visibleEntries[visibleEntries.length - 1];
    if (last && hiddenUnder.has(last.id)) toggleFold(last.id);
  };
  // Tags other than priority, which shows on its own.
  const otherTags = useMemo(() => {
    const priorityIds = new Set(priorityOptions.map((option) => option.id));
    const options = (tagSections ?? []).flatMap((section) => section.options).filter((option) => !priorityIds.has(option.id));
    return new Map(options.map((option) => [option.id, option]));
  }, [priorityOptions, tagSections]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const manualOrder = settings.sortMode === "manual";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [send, setSend] = useState<{ ids: string[]; mode: SendMode } | null>(null);
  const [recentTargets, rememberTarget] = useRecentListTargets();
  // Drag works in any sort; dropping a line switches the list to your order.
  const canReorder = canEdit && !selecting;

  useEffect(() => {
    if (!selecting) setSelectedIds(new Set());
  }, [selecting]);

  // --- Dragging a line to a new place --------------------------------------
  // In your own order a line takes the lines indented under it along; they
  // move as one block, `start` to `end` (exclusive) in the lines shown.
  const heightsRef = useRef<Record<string, number>>({});
  const dragY = useSharedValue(0);
  const [dragging, setDraggingState] = useState<DragBlock | null>(null);
  const draggingRef = useRef<DragBlock | null>(null);
  const setDragging = useCallback((next: DragBlock | null) => {
    draggingRef.current = next;
    setDraggingState(next);
  }, []);
  const [overIndex, setOverIndexState] = useState(0);
  const overIndexRef = useRef(0);

  const setOverIndex = useCallback((next: number) => {
    overIndexRef.current = next;
    setOverIndexState((current) => (current === next ? current : next));
  }, []);

  const rowHeights = useCallback(
    () => visibleEntries.map((entry) => heightsRef.current[entry.id] ?? LINE_ROW_HEIGHT),
    [visibleEntries],
  );

  const startDrag = useCallback(
    (startIndex: number) => {
      const end = manualOrder ? lineGroupEnd(visibleEntries, startIndex) : startIndex + 1;
      setOverIndex(startIndex);
      setDragging({ start: startIndex, end });
    },
    [manualOrder, setDragging, setOverIndex, visibleEntries],
  );

  const updateDrag = useCallback(
    (translationY: number) => {
      const block = draggingRef.current;
      if (!block) return;
      setOverIndex(targetIndexFor(block.start, translationY, blockHeights(rowHeights(), block)));
    },
    [rowHeights, setOverIndex],
  );

  const showToastRef = useRef<((message: string, undo?: () => void) => void) | null>(null);

  // Any reorder by hand means the list is now in your own order.
  const switchToManualOrder = useCallback(() => {
    if (settings.sortMode === "manual") return;
    onChangeSettings({ sortMode: "manual" });
    showToastRef.current?.(`Now sorted by ${listSortLabels.manual}`);
  }, [onChangeSettings, settings.sortMode]);

  const endDrag = useCallback(() => {
    const block = draggingRef.current;
    const targetIndex = overIndexRef.current;
    setDragging(null);
    if (!block || targetIndex === block.start) return;
    const moving = visibleEntries.slice(block.start, block.end);
    const others = [...visibleEntries.slice(0, block.start), ...visibleEntries.slice(block.end)];
    const after = others[targetIndex - 1] ?? null;
    const before = others[targetIndex] ?? null;
    // Folded lines take the lines they hide along, and a line dropped below a
    // folded line goes after what that line hides.
    const withHidden = (id: string) => [id, ...(hiddenUnder.get(id) ?? [])];
    const afterId = after ? withHidden(after.id).slice(-1)[0] : null;
    onReorderEntries(moving.flatMap((entry) => withHidden(entry.id)), afterId, before?.id ?? null);
    switchToManualOrder();
  }, [hiddenUnder, onReorderEntries, setDragging, switchToManualOrder, visibleEntries]);

  const blockHeight = dragging ? blockHeights(rowHeights(), dragging)[dragging.start] : 0;
  const isCarried = (index: number) => !!dragging && index >= dragging.start && index < dragging.end;
  // How far a line slides to make room for the block being dragged.
  const shiftFor = (index: number): number => {
    if (!dragging || isCarried(index)) return 0;
    const at = index < dragging.start ? index : index - (dragging.end - dragging.start) + 1;
    if (dragging.start < overIndex && at > dragging.start && at <= overIndex) return -blockHeight;
    if (dragging.start > overIndex && at >= overIndex && at < dragging.start) return blockHeight;
    return 0;
  };

  // --- Typing in place -----------------------------------------------------
  const inputRefs = useRef(new Map<string, TextInput>());
  const pendingFocusRef = useRef<string | null>(null);
  // A line being moved with the arrow buttons can lose the cursor for a
  // moment as it changes place. While this is set the line gets it straight
  // back and is not treated as abandoned.
  const [focusedId, setFocusedIdState] = useState<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const setFocusedId = useCallback((next: string | null | ((current: string | null) => string | null)) => {
    setFocusedIdState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      focusedIdRef.current = value;
      return value;
    });
  }, []);
  // What the bottom line will be, where it differs from the line above it.
  const [addOverride, setAddOverride] = useState<Partial<LineFormat> | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const registerInput = useCallback((id: string, input: TextInput | null) => {
    if (input) inputRefs.current.set(id, input);
    else inputRefs.current.delete(id);
  }, []);

  const focusLine = useCallback((id: string) => {
    const input = inputRefs.current.get(id);
    if (input) {
      input.focus();
      pendingFocusRef.current = null;
    } else {
      // Not rendered yet (just created): focus it after the next render.
      pendingFocusRef.current = id;
    }
  }, []);

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (id && inputRefs.current.has(id)) {
      pendingFocusRef.current = null;
      requestAnimationFrame(() => inputRefs.current.get(id)?.focus());
    }
  });

  useEffect(() => {
    if (focusAddSignal) focusLine(ADD_ROW_ID);
  }, [focusAddSignal, focusLine]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      revealTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const showToast = useCallback((message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  showToastRef.current = showToast;

  // --- Keeping the line being typed above the keyboard ---------------------
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const viewportRef = useRef(0);

  const reveal = useCallback((id: string | null) => {
    const input = id ? inputRefs.current.get(id) : undefined;
    const content = contentRef.current;
    if (!input || !content || typeof input.measureLayout !== "function") return;
    try {
      input.measureLayout(
        content,
        (_x, y, _width, height) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          const top = y - LINE_ROW_HEIGHT;
          const bottom = y + height + LINE_ROW_HEIGHT * 1.5;
          const offset = scrollYRef.current;
          if (bottom > offset + viewport) scrollRef.current?.scrollTo({ y: bottom - viewport, animated: true });
          else if (top < offset) scrollRef.current?.scrollTo({ y: Math.max(0, top), animated: true });
        },
        () => undefined,
      );
    } catch {
      // Measuring is best effort; the page can still be scrolled by hand.
    }
  }, []);

  // Now, and again once the keyboard has finished sliding up.
  const revealSoon = useCallback(
    (id: string) => {
      requestAnimationFrame(() => reveal(id));
      revealTimers.current.push(setTimeout(() => reveal(focusedIdRef.current), 350));
      if (revealTimers.current.length > 8) revealTimers.current.splice(0, revealTimers.current.length - 8);
    },
    [reveal],
  );

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => reveal(focusedIdRef.current));
    return () => subscription.remove();
  }, [reveal]);

  // A new line pushes the one being typed down; follow it.
  useEffect(() => {
    if (focusedIdRef.current) requestAnimationFrame(() => reveal(focusedIdRef.current));
  }, [reveal, visibleEntries.length]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  // Lines that live on another list, or that a rule pulled in: they can be
  // edited here but not deleted by emptying them.
  const isBorrowed = useCallback(
    (id: string) => !!referenceSources?.[id] || !!ruleEntryIds?.has(id),
    [referenceSources, ruleEntryIds],
  );

  const announcePaste = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;
      showToast(`Added ${countLabel(ids.length)}`, () => ids.forEach((id) => onDeleteEntry(id)));
    },
    [onDeleteEntry, showToast],
  );

  // Return or a paste inside an existing line.
  const splitLine = useCallback(
    (entry: ListEntry, previous: string, next: string) => {
      const { keep, added, isPaste } = splitEnteredText(previous, next);
      if (keep.trim() && keep.trim() !== entry.text) onUpdateEntry(entry.id, { text: keep.trim() });
      if (!isPaste && !keep.trim() && !added[0]?.text) {
        // Return on an empty line steps it back out a level; at the left
        // edge it ends typing, like a notes app.
        if (manualOrder && entry.indentLevel > 0 && !ruleEntryIds?.has(entry.id)) {
          onUpdateEntry(entry.id, { indentLevel: entry.indentLevel - 1 });
        } else {
          Keyboard.dismiss();
        }
        return keep;
      }
      const index = visibleEntries.findIndex((candidate) => candidate.id === entry.id);
      const kind = isPaste && !isHeading(entry) ? entry.kind : kindAfter(visibleEntries, index);
      const lines = added.map((line) => ({
        ...line,
        kind,
        indentLevel: isPaste ? clampIndent(line.indentLevel + entry.indentLevel) : entry.indentLevel,
      }));
      if (lines.length === 0) return keep;
      const ids = onInsertEntries(entry.id, lines);
      if (ids.length) focusLine(ids[ids.length - 1]);
      if (isPaste) announcePaste(ids);
      return keep;
    },
    [announcePaste, focusLine, manualOrder, onInsertEntries, onUpdateEntry, ruleEntryIds, visibleEntries],
  );

  const lastLine = visibleEntries[visibleEntries.length - 1];
  const addFormat = useMemo<LineFormat>(
    () => ({
      kind: kindAfter(visibleEntries, visibleEntries.length - 1),
      indentLevel: manualOrder ? lastLine?.indentLevel ?? 0 : 0,
      bold: false,
      ...addOverride,
    }),
    [addOverride, lastLine?.indentLevel, manualOrder, visibleEntries],
  );
  const addFormatRef = useRef(addFormat);
  addFormatRef.current = addFormat;

  const addLineFor = (text: string, checked = false, extraIndent = 0): NewLine => ({
    text,
    checked,
    indentLevel: clampIndent(addFormatRef.current.indentLevel + extraIndent),
    kind: addFormatRef.current.kind,
    ...(addFormatRef.current.bold ? { bold: true } : {}),
  });

  // Smart text: a typed line such as "Call mom tomorrow 6pm !high" is added
  // as "Call mom" with its date, time and priority, and a message says what
  // was picked up, with an Undo that keeps the words as typed.
  const allTagOptions = useMemo(() => (tagSections ?? []).flatMap((section) => section.options), [tagSections]);
  const readSmart = (text: string) => parseSmartText(text, { priorityOptions, tagOptions: allTagOptions, people });
  const smartLine = (line: NewLine): { line: NewLine; summary: string | null } => {
    if (!smartText) return { line, summary: null };
    const { text, fields } = readSmart(line.text);
    if (Object.keys(fields).length === 0) return { line, summary: null };
    return { line: { ...line, ...fields, text }, summary: smartSummary(fields) };
  };
  const smartSummary = (fields: SmartFields): string => {
    const due = fields.dueDate ? describeDueDate(fields.dueDate)?.label : undefined;
    const names = (fields.tagOptionIds ?? [])
      .map((id) => allTagOptions.find((option) => option.id === id)?.name ?? priorityOptions.find((option) => option.id === id)?.name)
      .filter(Boolean);
    const assignee = fields.assigneeId ? people.find((person) => person.id === fields.assigneeId) : undefined;
    const summary = [
      assignee ? `For ${personLabel(assignee)}` : "",
      [due, fields.dueTime ? formatTime(fields.dueTime) : ""].filter(Boolean).join(" "),
      fields.repeat ? repeatLabels[fields.repeat] : "",
      ...names,
      fields.price !== undefined ? formatPrice(fields.price) : "",
      fields.quantity ? `×${formatQuantity(fields.quantity)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return summary;
  };

  // Smart text in a line typed into somewhere other than the bottom row
  // (a new line made with Return, or words added to a line), once it's
  // finished. Only words typed this time count: a line that already said
  // "Notes from monday" isn't given a date for it now.
  const finishTyping = (entry: ListEntry, before: string, after: string): string | null => {
    if (!smartText || before.trim() === after.trim() || isHeading(entry)) return null;
    const now = readSmart(after);
    const keys = Object.keys(now.fields) as Array<keyof SmartFields>;
    if (keys.length === 0) return null;
    const was = readSmart(before).fields;
    if (keys.every((key) => key in was)) return null;
    const { tagOptionIds: newTags = [], ...fields } = now.fields;
    const priorityIds = new Set(priorityOptions.map((option) => option.id));
    const settingPriority = newTags.some((id) => priorityIds.has(id));
    const tags = [
      ...entry.tagOptionIds.filter((id) => !(settingPriority && priorityIds.has(id)) && !newTags.includes(id)),
      ...newTags,
    ];
    onUpdateEntry(entry.id, { ...fields, text: now.text, ...(newTags.length ? { tagOptionIds: tags } : {}) });
    showToast(smartSummary(now.fields), () =>
      onUpdateEntry(entry.id, {
        text: after,
        dueDate: entry.dueDate,
        dueTime: entry.dueTime,
        repeat: entry.repeat,
        price: entry.price,
        quantity: entry.quantity,
        assigneeId: entry.assigneeId,
        assigneeName: entry.assigneeName,
        tagOptionIds: entry.tagOptionIds,
      }),
    );
    return now.text;
  };

  // Adds one typed line from the bottom row, reading smart text in it.
  const addTypedLine = (line: NewLine) => {
    unfoldEnd();
    const { line: smart, summary } = smartLine(line);
    const [id] = onInsertEntries(null, [smart]);
    if (summary && id) {
      showToast(summary, () =>
        onUpdateEntry(id, {
          text: line.text,
          dueDate: undefined,
          dueTime: undefined,
          repeat: undefined,
          price: undefined,
          quantity: undefined,
          assigneeId: undefined,
          tagOptionIds: [],
        }),
      );
    }
  };

  const addTypedLineRef = useRef(addTypedLine);
  addTypedLineRef.current = addTypedLine;

  // Return or a paste in the bottom line.
  const changeAddDraft = (next: string) => {
    if (!/[\r\n]/.test(next)) {
      setDraft(next);
      return;
    }
    const { keep, added, isPaste } = splitEnteredText(draft, next);
    const lines: NewLine[] = [
      ...(keep.trim() ? [addLineFor(keep.trim())] : []),
      ...(isPaste ? added.map((line) => addLineFor(line.text, line.checked, line.indentLevel)) : []),
    ];
    setDraft("");
    if (lines.length === 0) {
      if (addFormat.indentLevel > 0) setAddOverride((current) => ({ ...current, indentLevel: addFormat.indentLevel - 1 }));
      else Keyboard.dismiss();
      return;
    }
    if (!isPaste && lines.length === 1) {
      addTypedLine(lines[0]);
      setAddOverride(null);
      return;
    }
    unfoldEnd();
    const ids = onInsertEntries(null, lines);
    // The next line carries on like the one just added, minus the bold.
    setAddOverride(null);
    if (isPaste) announcePaste(ids);
  };

  const commitAddDraft = useCallback((): boolean => {
    const text = draftRef.current.trim();
    if (!text) return false;
    addTypedLineRef.current({
      text,
      checked: false,
      indentLevel: addFormatRef.current.indentLevel,
      kind: addFormatRef.current.kind,
      ...(addFormatRef.current.bold ? { bold: true } : {}),
    });
    setDraft("");
    setAddOverride(null);
    return true;
  }, [setDraft]);

  useImperativeHandle(ref, () => ({ showToast, flush: commitAddDraft }), [commitAddDraft, showToast]);

  // Backspace in an empty line: step it back out a level, then go to the end
  // of the line above. The empty line is deleted when it loses the cursor.
  const backspaceEmpty = (entry: ListEntry) => {
    if (manualOrder && entry.indentLevel > 0 && !ruleEntryIds?.has(entry.id)) {
      onUpdateEntry(entry.id, { indentLevel: entry.indentLevel - 1 });
      return;
    }
    const index = visibleEntries.findIndex((candidate) => candidate.id === entry.id);
    const above = index > 0 ? visibleEntries[index - 1] : null;
    if (above) focusLine(above.id);
  };

  const backspaceEmptyAdd = () => {
    if (addFormat.indentLevel > 0) {
      setAddOverride((current) => ({ ...current, indentLevel: addFormat.indentLevel - 1 }));
      return;
    }
    if (lastLine) focusLine(lastLine.id);
  };

  // --- The bar above the keyboard ------------------------------------------
  const addFocused = focusedId === ADD_ROW_ID;
  const focusedEntry = focusedId && !addFocused ? entries.find((entry) => entry.id === focusedId) ?? null : null;
  const barFormat: LineFormat | null = focusedEntry
    ? { kind: focusedEntry.kind, bold: !!focusedEntry.bold, indentLevel: focusedEntry.indentLevel }
    : addFocused
      ? addFormat
      : null;
  const canPlaceFocused = !!focusedEntry && manualOrder && !ruleEntryIds?.has(focusedEntry.id);
  const canIndent = addFocused ? manualOrder : canPlaceFocused;

  const applyFormat = (updates: Partial<LineFormat>) => {
    if (focusedEntry) onUpdateEntry(focusedEntry.id, updates);
    else if (addFocused) setAddOverride((current) => ({ ...current, ...updates }));
  };

  const toggleKind = (kind: "check" | "bullet") => {
    if (barFormat) applyFormat({ kind: barFormat.kind === kind ? "text" : kind });
  };

  // --- Photos ------------------------------------------------------------
  // The line photos are being picked for. Picking takes the cursor away, and
  // that must not delete the line while it is still empty.
  const pickingForRef = useRef<string | null>(null);

  const pickPhotos = async () => {
    try {
      return await pickLineImages();
    } catch (error) {
      console.warn("Failed to pick photos", error);
      showToast("Couldn't open your photos");
      return [];
    }
  };

  // Adds photos to a card that has none yet.
  const addPhotosTo = async (id: string) => {
    if (pickingForRef.current) return;
    pickingForRef.current = id;
    const images = await pickPhotos();
    pickingForRef.current = null;
    const latest = entriesRef.current.find((entry) => entry.id === id);
    if (latest && images.length > 0) onUpdateEntry(id, { images: [...(latest.images ?? []), ...images] });
  };

  // Adds photos to the line with the cursor, or puts them on a new line with
  // whatever was typed in the bottom row.
  const addPhotos = async () => {
    if (pickingForRef.current) return;
    if (focusedEntry) {
      const id = focusedEntry.id;
      pickingForRef.current = id;
      const images = await pickPhotos();
      pickingForRef.current = null;
      const latest = entriesRef.current.find((entry) => entry.id === id);
      if (!latest) return;
      if (images.length > 0) onUpdateEntry(id, { images: [...(latest.images ?? []), ...images] });
      else if (!latest.text.trim() && !latest.images?.length && focusedIdRef.current !== id && !isBorrowed(id)) {
        onDeleteEntry(id);
      }
      return;
    }
    if (!addFocused) return;
    const format = addFormatRef.current;
    const text = draftRef.current.trim();
    // Taken now so the bottom row doesn't save it as a line of its own when
    // the picker takes the cursor away.
    setDraft("");
    pickingForRef.current = ADD_ROW_ID;
    const images = await pickPhotos();
    pickingForRef.current = null;
    if (!text && images.length === 0) return;
    onInsertEntries(null, [
      {
        text,
        checked: false,
        indentLevel: format.indentLevel,
        kind: format.kind,
        ...(format.bold ? { bold: true } : {}),
        ...(images.length > 0 ? { images } : {}),
      },
    ]);
    setAddOverride(null);
  };

  // A photo stays the size it was last left at, on every device.
  const resizeImage = (entryId: string, imageId: string, size: LineImageSize) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === entryId);
    if (!entry?.images?.some((image) => image.id === imageId)) return;
    onUpdateEntry(entry.id, {
      images: entry.images.map((image) => (image.id === imageId ? withLineImageSize(image, size) : image)),
    });
  };

  // Holding a photo takes it off its line, with an undo. A line that was only
  // that photo goes too.
  const removeImage = (entryId: string, imageId: string) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === entryId);
    const before = entry?.images ?? [];
    if (!entry || !before.some((image) => image.id === imageId)) return;
    const images = before.filter((image) => image.id !== imageId);
    if (images.length === 0 && !entry.text.trim() && !isBorrowed(entry.id)) {
      onDeleteEntry(entry.id);
      showToast("Removed the photo", onRestoreEntries ? () => onRestoreEntries([entry]) : undefined);
      return;
    }
    onUpdateEntry(entry.id, { images });
    showToast("Removed the photo", () => onUpdateEntry(entry.id, { images: before }));
  };

  // --- Sending, checking and deleting (swipe and select mode) --------------
  const canMove = !!onMoveEntries && !!moveTargets?.length;
  const canLink = !!onLinkEntries && !!linkTargets?.length;
  const linkable = useCallback((id: string) => canLink && !isBorrowed(id), [canLink, isBorrowed]);

  const exitSelecting = () => onChangeSelecting(false);

  const startSend = (ids: string[], mode: SendMode) => {
    dismissSwipeTip();
    const usable = mode === "add" ? ids.filter(linkable) : ids;
    if (usable.length === 0 || (mode === "add" ? !canLink : !canMove)) return;
    Keyboard.dismiss();
    setSend({ ids: usable, mode });
  };

  const finishSend = (listId: string, mode: SendMode) => {
    const ids = (send?.ids ?? []).filter((id) => mode === "move" || linkable(id));
    setSend(null);
    if (ids.length === 0) return;
    if (mode === "move") {
      const result = onMoveEntries?.(ids, listId);
      if (!result) return;
      rememberTarget(listId);
      exitSelecting();
      showToast(ids.length === 1 ? `Moved to ${result.listTitle}` : `Moved ${countLabel(ids.length)} to ${result.listTitle}`, result.undo);
      return;
    }
    const result = onLinkEntries?.(ids, listId);
    if (!result) return;
    rememberTarget(listId);
    exitSelecting();
    if (result.removed) showToast(`Taken off ${result.listTitle}`);
    else if (result.count === 0) showToast(`Already on ${result.listTitle}`);
    else showToast(result.count === 1 ? `Added to ${result.listTitle}` : `Added ${countLabel(result.count)} to ${result.listTitle}`, result.undo);
  };

  const deleteLines = (ids: string[]) => {
    const removable = ids.filter((id) => !ruleEntryIds?.has(id));
    if (removable.length === 0) return;
    const restorable = removable
      .filter((id) => !referenceSources?.[id])
      .map((id) => entries.find((entry) => entry.id === id))
      .filter((entry): entry is ListEntry => !!entry);
    removable.forEach((id) => onDeleteEntry(id));
    exitSelecting();
    showToast(
      `Deleted ${countLabel(removable.length)}`,
      onRestoreEntries && restorable.length === removable.length ? () => onRestoreEntries(restorable) : undefined,
    );
  };

  const selectedList = [...selectedIds].filter((id) => entries.some((entry) => entry.id === id));
  const selectedChecks = entries.filter((entry) => selectedIds.has(entry.id) && entry.kind === "check");
  const selectedAllDone = selectedChecks.length > 0 && selectedChecks.every((entry) => entry.checked);

  // --- Dates and tags for the selected lines -------------------------------
  const [bulkSheet, setBulkSheet] = useState<"date" | "tag" | null>(null);
  const selectedEntries = entries.filter((entry) => selectedIds.has(entry.id));

  const setDateOnSelected = (dueDate: string | null) => {
    const before = selectedEntries.map((entry) => ({ id: entry.id, dueDate: entry.dueDate, dueTime: entry.dueTime }));
    before.forEach(({ id }) => onUpdateEntry(id, dueDate ? { dueDate } : { dueDate: undefined, dueTime: undefined }));
    exitSelecting();
    showToast(dueDate ? `Dated ${countLabel(before.length)}` : `Took the date off ${countLabel(before.length)}`, () =>
      before.forEach(({ id, dueDate: previous, dueTime }) => onUpdateEntry(id, { dueDate: previous, dueTime })),
    );
  };

  const tagSelected = (option: TagOption) => {
    const section = (tagSections ?? []).find((candidate) => candidate.group.id === option.groupId);
    const single = section?.group.selectionMode === "single";
    const groupIds = new Set(section?.options.map((candidate) => candidate.id) ?? []);
    const allHave = selectedEntries.length > 0 && selectedEntries.every((entry) => entry.tagOptionIds.includes(option.id));
    const before = selectedEntries.map((entry) => ({ id: entry.id, tagOptionIds: entry.tagOptionIds }));
    selectedEntries.forEach((entry) => {
      const kept = entry.tagOptionIds.filter((id) => id !== option.id && !(single && groupIds.has(id)));
      onUpdateEntry(entry.id, { tagOptionIds: allHave ? kept : [...kept, option.id] });
    });
    exitSelecting();
    showToast(allHave ? `Took ${option.name} off ${countLabel(before.length)}` : `Tagged ${countLabel(before.length)} ${option.name}`, () =>
      before.forEach(({ id, tagOptionIds }) => onUpdateEntry(id, { tagOptionIds })),
    );
  };

  const bulkActions: MenuAction[] =
    bulkSheet === "date"
      ? [
          ...quickDueDates().map((quick) => ({ key: quick.key, label: quick.label, onPress: () => setDateOnSelected(quick.value) })),
          ...(selectedEntries.some((entry) => entry.dueDate)
            ? [{ key: "none", label: "No date", separated: true, onPress: () => setDateOnSelected(null) }]
            : []),
        ]
      : bulkSheet === "tag"
        ? (tagSections ?? []).flatMap((section, sectionIndex) =>
            section.options.map((option, index) => ({
              key: option.id,
              label: option.name,
              detail: index === 0 ? section.group.name : undefined,
              separated: index === 0 && sectionIndex > 0,
              icon: selectedEntries.length > 0 && selectedEntries.every((entry) => entry.tagOptionIds.includes(option.id)) ? (
                <CircleCheck size={20} color={colors.accentDark} />
              ) : (
                <Circle size={20} color={withAlpha(colors.muted, 0.6)} />
              ),
              onPress: () => tagSelected(option),
            })),
          )
        : [];

  const selectAll = () => setSelectedIds(new Set(visibleEntries.map((entry) => entry.id)));

  const checkSelected = () => {
    const changing = selectedChecks.filter((entry) => entry.checked === selectedAllDone);
    if (onSetChecked) onSetChecked(changing.map((entry) => entry.id), !selectedAllDone);
    else changing.forEach((entry) => onToggleEntry(entry));
    exitSelecting();
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sendSubject =
    send && send.ids.length === 1
      ? `"${entries.find((entry) => entry.id === send.ids[0])?.text ?? "line"}"`
      : countLabel(send?.ids.length ?? 0);
  const sendCanAdd = !!send && canLink && send.ids.some(linkable);

  // Puts the keyboard away and opens a line's due date, priority and notes.
  const openDetails = (id: string) => {
    dismissDetailsTip();
    Keyboard.dismiss();
    setFocusedId(null);
    setOpenEntryId(id);
  };

  // One-time tips for what isn't obvious: the keyboard bar, line details
  // and swiping. Only one shows at a time, above the bar or the home bar.
  const writtenLines = entries.filter((entry) => !!entry.text.trim()).length;
  const barTip = useTip("keyboardBar", canEdit && !!focusedId && !selecting);
  const detailsTip = useTip("lineDetails", canEdit && !!focusedEntry && !!focusedEntry.text.trim() && !selecting);
  const swipeTip = useTip("swipeLine", canEdit && (canLink || canMove) && writtenLines >= 3 && !focusedId && !selecting);
  const dismissDetailsTip = detailsTip.dismiss;
  const dismissSwipeTip = swipeTip.dismiss;
  const shownTip = barTip.shown ? barTip : detailsTip.shown ? detailsTip : swipeTip.shown ? swipeTip : null;
  const shownTipText = barTip.shown ? TIP_TEXT.keyboardBar : detailsTip.shown ? TIP_TEXT.lineDetails : TIP_TEXT.swipeLine;

  const iconTone = colors.accentDark;
  const keyboardBar = focusedId ? (
    <View style={styles.bar}>
      <View style={styles.barRow}>
        <BarButton
          accessibilityLabel="Checklist"
          selected={barFormat?.kind === "check"}
          icon={<CircleCheck size={20} color={iconTone} />}
          onPress={() => toggleKind("check")}
          styles={styles}
        />
        <BarButton
          accessibilityLabel="Bullets"
          selected={barFormat?.kind === "bullet"}
          icon={<List size={20} color={iconTone} />}
          onPress={() => toggleKind("bullet")}
          styles={styles}
        />
        <BarButton
          accessibilityLabel="Bold"
          selected={!!barFormat?.bold}
          icon={<Bold size={20} color={iconTone} strokeWidth={2.6} />}
          onPress={() => barFormat && applyFormat({ bold: !barFormat.bold })}
          styles={styles}
        />
        <View style={styles.barDivider} />
        <BarButton
          accessibilityLabel="Outdent line"
          disabled={!canIndent || !barFormat || barFormat.indentLevel <= 0}
          icon={<ListIndentDecrease size={20} color={iconTone} />}
          onPress={() => barFormat && applyFormat({ indentLevel: clampIndent(barFormat.indentLevel - 1) })}
          styles={styles}
        />
        <BarButton
          accessibilityLabel="Indent line"
          disabled={!canIndent || !barFormat || barFormat.indentLevel >= MAX_ENTRY_INDENT}
          icon={<ListIndentIncrease size={20} color={iconTone} />}
          onPress={() => barFormat && applyFormat({ indentLevel: clampIndent(barFormat.indentLevel + 1) })}
          styles={styles}
        />
        <View style={styles.barDivider} />
        <BarButton
          accessibilityLabel="Add photo"
          icon={<ImagePlus size={20} color={iconTone} />}
          onPress={() => void addPhotos()}
          styles={styles}
        />
        <BarButton
          accessibilityLabel="Send to another list"
          disabled={!focusedEntry || (!canMove && !(focusedEntry && linkable(focusedEntry.id)))}
          icon={<CornerUpRight size={20} color={iconTone} />}
          onPress={() => focusedEntry && startSend([focusedEntry.id], linkable(focusedEntry.id) ? "add" : "move")}
          styles={styles}
        />
      </View>
      <BarButton label="Done" strong onPress={() => Keyboard.dismiss()} styles={styles} />
    </View>
  ) : null;

  const openEntry = entries.find((entry) => entry.id === openEntryId) ?? null;
  const openEntryLists = openEntry
    ? (linkedListIds?.[openEntry.id] ?? [])
        .map((id) => linkTargets?.find((target) => target.id === id))
        .filter((target): target is ListTarget => !!target)
    : [];

  const addPlaceholder =
    entries.length === 0 ? "Start typing" : layout === "gallery" ? "Add to the collection" : addFormat.kind === "text" ? "New line" : "New item";

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, selecting && { paddingBottom: SELECT_BAR_HEIGHT + insets.bottom + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!dragging}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onLayout={(event) => {
          viewportRef.current = event.nativeEvent.layout.height;
        }}
      >
        <View ref={contentRef} collapsable={false} style={styles.contentInner}>
          {header}

          {layout === "gallery" && (
            <CollectionGrid
              entries={visibleEntries}
              canEdit={canEdit}
              selecting={selecting}
              selectedIds={selectedIds}
              onOpen={openDetails}
              onToggle={onToggleEntry}
              onToggleSelect={toggleSelected}
              onAddPhoto={(id) => void addPhotosTo(id)}
            />
          )}

          {layout === "lines" && visibleEntries.map((entry, index) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              styles={styles}
              colors={colors}
              priority={entryPriority(entry, priorityOptions)}
              tags={entry.tagOptionIds.map((id) => otherTags.get(id)).filter((option): option is TagOption => !!option)}
              caption={captions?.[entry.id]}
              assignee={assigneeLabel(entry, people, myUserId)}
              borrowed={!!referenceSources?.[entry.id]}
              showIndent={manualOrder}
              spaceAbove={index > 0 && isHeading(entry) && entry.indentLevel === 0}
              canEdit={canEdit}
              canReorder={canReorder}
              dragActive={!!dragging}
              carried={isCarried(index)}
              dragY={dragY}
              shift={shiftFor(index)}
              onLayoutHeight={(height) => {
                heightsRef.current[entry.id] = height;
              }}
              onToggle={() => onToggleEntry(entry)}
              onOpen={() => setOpenEntryId(entry.id)}
              isFocused={focusedId === entry.id}
              onOpenDetails={() => openDetails(entry.id)}
              registerInput={(input) => registerInput(entry.id, input)}
              onCommitText={(text) => {
                if (text !== entry.text) onUpdateEntry(entry.id, { text });
              }}
              onFinishText={(before, after) => finishTyping(entry, before, after)}
              onSplit={(previous, next) => splitLine(entry, previous, next)}
              onBackspaceEmpty={() => backspaceEmpty(entry)}
              onFocusLine={() => {
                setFocusedId(entry.id);
                revealSoon(entry.id);
              }}
              onGrow={() => reveal(entry.id)}
              onBlurEmpty={() => {
                if (!isBorrowed(entry.id) && pickingForRef.current !== entry.id) onDeleteEntry(entry.id);
              }}
              onRemoveImage={canEdit ? (imageId) => removeImage(entry.id, imageId) : undefined}
              onResizeImage={canEdit ? (imageId, size) => resizeImage(entry.id, imageId, size) : undefined}
              onBlurLine={() => setFocusedId((current) => (current === entry.id ? null : current))}
              selecting={selecting}
              selected={selectedIds.has(entry.id)}
              onToggleSelect={() => toggleSelected(entry.id)}
              onSwipeLink={linkable(entry.id) ? () => startSend([entry.id], "add") : undefined}
              onSwipeMove={canMove ? () => startSend([entry.id], "move") : undefined}
              onSwipeDelete={ruleEntryIds?.has(entry.id) ? undefined : () => deleteLines([entry.id])}
              onDragStart={() => startDrag(index)}
              onDragUpdate={updateDrag}
              onDragEnd={endDrag}
              fold={
                foldSizes.has(entry.id)
                  ? { folded: hiddenUnder.has(entry.id), count: foldSizes.get(entry.id) ?? 0, onToggle: () => toggleFold(entry.id) }
                  : undefined
              }
            />
          ))}

          {visibleEntries.length === 0 && (!canEdit || entries.length > 0) && (
            <Text style={styles.empty}>{entries.length > 0 ? "Everything here is done." : emptyText}</Text>
          )}

          {hiddenCount > 0 && (
            <Pressable accessibilityRole="button" onPress={() => onChangeSettings({ completedMode: "inline" })}>
              <Text style={styles.hiddenNote}>
                {hiddenCount} completed {hiddenCount === 1 ? "line" : "lines"} hidden · Show
              </Text>
            </Pressable>
          )}

          {canEdit && !selecting && (
            <View style={styles.row}>
              <Pressable
                accessible={false}
                onPress={() => focusLine(ADD_ROW_ID)}
                style={[styles.leading, { width: leadingWidth(addFormat.kind, addFormat.indentLevel) }]}
              >
                {addFormat.kind !== "text" && (
                  <View style={styles.markerSlot}>
                    {addFormat.kind === "check" ? (
                      <CheckMark checked={false} colors={colors} dim />
                    ) : (
                      <View style={styles.bulletWrap}>
                        <BulletMark indentLevel={addFormat.indentLevel} colors={colors} dim />
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
              <View style={styles.textBlock}>
                <TextInput
                  ref={(input) => registerInput(ADD_ROW_ID, input)}
                  accessibilityLabel="Add a line to this list"
                  accessibilityHint="Press return for the next line. Pasting several lines adds them all."
                  value={draft}
                  onChangeText={changeAddDraft}
                  onFocus={() => {
                    setFocusedId(ADD_ROW_ID);
                    revealSoon(ADD_ROW_ID);
                  }}
                  onBlur={() => {
                    commitAddDraft();
                    setFocusedId((current) => (current === ADD_ROW_ID ? null : current));
                  }}
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key === "Backspace" && draft === "") backspaceEmptyAdd();
                  }}
                  onContentSizeChange={() => {
                    if (focusedIdRef.current === ADD_ROW_ID) reveal(ADD_ROW_ID);
                  }}
                  placeholder={addPlaceholder}
                  placeholderTextColor={withAlpha(colors.muted, 0.7)}
                  multiline
                  scrollEnabled={false}
                  style={[styles.text, styles.textInput, addFormat.bold && styles.textBold]}
                />
              </View>
            </View>
          )}

          {canEdit && !selecting ? (
            // Tapping the empty page below the last line carries on typing.
            <Pressable accessible={false} onPress={() => focusLine(ADD_ROW_ID)} style={styles.filler} />
          ) : (
            <View style={styles.filler} />
          )}

          {footer}
        </View>
      </ScrollView>

      {/* Docked under the page, which the screen keeps above the keyboard. It
          works for whichever line has the cursor (an iOS keyboard accessory
          can only be tied to one text field). */}
      {canEdit && !selecting && keyboardBar}

      {selecting && (
        <View style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}>
          <View style={styles.selectCountRow}>
            <Text style={styles.selectCount}>
              {selectedList.length === 0 ? "Tap lines to select them" : `${selectedList.length} selected`}
            </Text>
            {selectedList.length < visibleEntries.length && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={selectAll}>
                <Text style={styles.selectAll}>Select all</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.selectActions}>
            {canLink && (
              <SelectButton
                label="Add to"
                icon={<ListPlus size={20} color={colors.accentDark} />}
                disabled={!selectedList.some(linkable)}
                onPress={() => startSend(selectedList, "add")}
                styles={styles}
              />
            )}
            {canMove && (
              <SelectButton
                label="Move"
                icon={<FolderInput size={20} color={colors.accentDark} />}
                disabled={selectedList.length === 0}
                onPress={() => startSend(selectedList, "move")}
                styles={styles}
              />
            )}
            <SelectButton
              label={selectedAllDone ? "Uncheck" : "Check"}
              icon={<CheckCheck size={20} color={colors.accentDark} />}
              disabled={selectedChecks.length === 0}
              onPress={checkSelected}
              styles={styles}
            />
            <SelectButton
              label="Date"
              icon={<CalendarDays size={20} color={colors.accentDark} />}
              disabled={selectedList.length === 0}
              onPress={() => setBulkSheet("date")}
              styles={styles}
            />
            {(tagSections ?? []).some((section) => section.options.length > 0) && (
              <SelectButton
                label="Tag"
                icon={<Tag size={20} color={colors.accentDark} />}
                disabled={selectedList.length === 0}
                onPress={() => setBulkSheet("tag")}
                styles={styles}
              />
            )}
            <SelectButton
              label="Delete"
              icon={<Trash2 size={20} color={colors.danger} />}
              disabled={selectedList.length === 0}
              onPress={() => deleteLines(selectedList)}
              styles={styles}
            />
          </View>
        </View>
      )}

      {!!shownTip && !toast && (
        <View
          pointerEvents="box-none"
          style={[
            styles.tipWrap,
            { bottom: (focusedId ? KEYBOARD_BAR_HEIGHT : insets.bottom) + spacing.xs },
          ]}
        >
          <TipBubble text={shownTipText} pointer={barTip.shown ? "down" : "none"} onClose={shownTip.dismiss} />
        </View>
      )}

      {!!toast && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            // Above the select bar or the format bar, or the home indicator
            // when no keyboard is up.
            { bottom: (selecting ? SELECT_BAR_HEIGHT : 0) + (focusedId ? KEYBOARD_BAR_HEIGHT : insets.bottom) + spacing.sm },
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
          {!!toast.undo && (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              <Text style={styles.toastAction}>Undo</Text>
            </Pressable>
          )}
        </View>
      )}


      {(canMove || canLink) && (
        <SendToListSheet
          visible={!!send}
          mode={send?.mode ?? "add"}
          addTargets={sendCanAdd ? linkTargets ?? [] : []}
          moveTargets={canMove ? moveTargets ?? [] : []}
          onChangeMode={(mode) => setSend((current) => (current ? { ...current, mode } : current))}
          subject={sendSubject}
          memberListIds={send?.ids.length === 1 ? linkedListIds?.[send.ids[0]] : undefined}
          recentIds={recentTargets}
          onPick={finishSend}
          onClose={() => setSend(null)}
        />
      )}
      <MenuSheet
        visible={!!bulkSheet && selecting}
        title={bulkSheet === "date" ? `Due date for ${countLabel(selectedList.length)}` : `Tag ${countLabel(selectedList.length)}`}
        actions={bulkActions}
        onClose={() => setBulkSheet(null)}
      />
      <ListEntrySheet
        entry={openEntry}
        priorityOptions={priorityOptions}
        tagSections={tagSections}
        canEdit={canEdit}
        sourceListTitle={openEntry ? referenceSources?.[openEntry.id] : undefined}
        fromRule={!!openEntry && !!ruleEntryIds?.has(openEntry.id)}
        alsoOnLists={openEntryLists}
        people={people}
        onRemoveFromList={(listId) => {
          if (!openEntry) return;
          const result = onLinkEntries?.([openEntry.id], listId);
          if (result?.removed) showToast(`Taken off ${result.listTitle}`);
        }}
        onClose={() => setOpenEntryId(null)}
        onSave={(updates) => {
          if (openEntry) onUpdateEntry(openEntry.id, updates);
        }}
        onDelete={() => {
          if (openEntry) onDeleteEntry(openEntry.id);
          setOpenEntryId(null);
        }}
      />
    </View>
  );
});

const leadingWidth = (kind: ListItemKind, indentLevel: number, showIndent = true): number =>
  GUTTER + (showIndent ? clampIndent(indentLevel) * INDENT_WIDTH : 0) + (kind === "text" ? 0 : MARKER_WIDTH);

type EntryRowProps = {
  // Shown on a line with lines under it, to fold them away.
  fold?: { folded: boolean; count: number; onToggle: () => void };
  entry: ListEntry;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  priority?: TagOption;
  // The line's other tags.
  tags: TagOption[];
  caption?: string;
  // Who the line is for, on a shared list.
  assignee?: string | null;
  // The line lives on another list and is only shown here.
  borrowed: boolean;
  showIndent: boolean;
  // A little air above a heading that isn't the first line.
  spaceAbove: boolean;
  canEdit: boolean;
  canReorder: boolean;
  // A line is being dragged; this one moves with it (it or a line under it).
  dragActive: boolean;
  carried: boolean;
  // How far the dragged lines have moved, and how far this one slides aside.
  dragY: SharedValue<number>;
  shift: number;
  onLayoutHeight: (height: number) => void;
  onToggle: () => void;
  onOpen: () => void;
  // The line has the cursor: it shows a button for its details.
  isFocused: boolean;
  onOpenDetails: () => void;
  onDragStart: () => void;
  onDragUpdate: (translationY: number) => void;
  onDragEnd: () => void;
  registerInput: (input: TextInput | null) => void;
  onCommitText: (text: string) => void;
  // A line typed into and finished (Return, or leaving it): reads smart
  // text in what was typed, and gives back the line's new text if it did.
  onFinishText?: (before: string, after: string) => string | null;
  // Text with a line break in it (Return or a paste); returns what stays.
  onSplit: (previous: string, next: string) => string;
  onBackspaceEmpty: () => void;
  onFocusLine: () => void;
  onBlurLine: () => void;
  onBlurEmpty: () => void;
  // Holding a photo on the line, and tapping it to a new size; left out when
  // the line can't be changed.
  onRemoveImage?: (imageId: string) => void;
  onResizeImage?: (imageId: string, size: LineImageSize) => void;
  // The text wrapped onto another row while being typed.
  onGrow: () => void;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onSwipeLink?: () => void;
  onSwipeMove?: () => void;
  onSwipeDelete?: () => void;
};

const dueToneColor = (tone: DueTone, colors: ThemeColors): string =>
  tone === "overdue" ? colors.danger : tone === "today" ? colors.accentDark : tone === "soon" ? colors.blue : colors.muted;

const EntryRow = ({
  fold,
  entry,
  styles,
  colors,
  priority,
  tags,
  caption,
  assignee,
  borrowed,
  showIndent,
  spaceAbove,
  canEdit,
  canReorder,
  dragActive,
  carried,
  dragY,
  shift,
  onLayoutHeight,
  onToggle,
  onOpen,
  isFocused,
  onOpenDetails,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  registerInput,
  onCommitText,
  onFinishText,
  onSplit,
  onBackspaceEmpty,
  onFocusLine,
  onBlurLine,
  onBlurEmpty,
  onRemoveImage,
  onResizeImage,
  onGrow,
  selecting,
  selected,
  onToggleSelect,
  onSwipeLink,
  onSwipeMove,
  onSwipeDelete,
}: EntryRowProps) => {
  const [draft, setDraftState] = useState(entry.text);
  const draftRef = useRef(entry.text);
  const setDraft = (next: string) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const focusedRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTextRef = useRef(onCommitText);
  commitTextRef.current = onCommitText;
  // The text when typing started, to tell what was typed since.
  const startTextRef = useRef(entry.text);

  // Follow changes from elsewhere (sync, the details sheet) unless typing.
  useEffect(() => {
    if (!focusedRef.current) setDraft(entry.text);
  }, [entry.text]);

  // Leaving the page mid-word still saves what was typed.
  useEffect(
    () => () => {
      if (!commitTimer.current) return;
      clearTimeout(commitTimer.current);
      const pending = draftRef.current.trim();
      if (pending) commitTextRef.current(pending);
    },
    [],
  );

  const commit = (text: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const trimmed = text.trim();
    if (trimmed) onCommitText(trimmed);
  };

  // Smart text in a finished line. Returns the text the line has now.
  const finishText = (text: string): string => {
    const smart = onFinishText ? onFinishText(startTextRef.current, text) : null;
    startTextRef.current = smart ?? text;
    if (smart === null) return text;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    setDraft(smart);
    return smart;
  };

  const changeText = (next: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (/[\r\n]/.test(next)) {
      const kept = onSplit(draft, next).trim();
      setDraft(kept);
      if (kept) finishText(kept);
      return;
    }
    setDraft(next);
    commitTimer.current = setTimeout(() => commit(next), COMMIT_DELAY_MS);
  };

  const swipeRef = useRef<SwipeableMethods>(null);
  const due = entry.dueDate ? describeDueDate(entry.dueDate) : null;
  // Swipe right checks a checklist line off (or back on); swipe left shows
  // Add to, Move and Delete.
  const canSwipeRight = entry.kind === "check";
  const hasSwipeActions = !!onSwipeLink || !!onSwipeMove || !!onSwipeDelete;
  // A long press on the checkbox starts a drag; its tap must not also toggle.
  const lastDragAt = useRef(0);
  const markDrag = useCallback(() => {
    lastDragAt.current = Date.now();
  }, []);
  const toggleUnlessDragged = () => {
    if (Date.now() - lastDragAt.current > 500) onToggle();
  };

  const holdGesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`drag-${entry.id}`)
        .enabled(canReorder)
        .activateAfterLongPress(250)
        .onStart(() => {
          dragY.value = 0;
          runOnJS(onDragStart)();
        })
        .onUpdate((event) => {
          dragY.value = event.translationY;
          runOnJS(onDragUpdate)(event.translationY);
        })
        // The lines stay where they were let go until the list shows them in
        // their new place.
        .onEnd(() => {
          runOnJS(markDrag)();
          runOnJS(onDragEnd)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canReorder, dragY, entry.id, onDragEnd, onDragStart, onDragUpdate, markDrag],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (carried) return { transform: [{ translateY: dragY.value }], zIndex: 10 };
    if (!dragActive) return { transform: [{ translateY: 0 }], zIndex: 0 };
    return { transform: [{ translateY: withTiming(shift, { duration: 140 }) }], zIndex: 0 };
  }, [carried, dragActive, shift]);

  const fieldLabels = cardFieldsLabel(entry) ? [cardFieldsLabel(entry)] : [];
  const hasMeta =
    !!due || !!priority || tags.length > 0 || !!entry.notes || fieldLabels.length > 0 || !!entry.rating || !!assignee;
  // Web links in the line, each offered as a button under it: the line itself
  // is a text field, so tapping it edits rather than opens. A link kept in the
  // line's details comes first.
  const links = useMemo(() => {
    const inText = extractLinks(entry.text);
    if (!entry.link || inText.some((link) => link.url === entry.link)) return inText;
    return [{ url: entry.link, label: linkHost(entry.link) }, ...inText];
  }, [entry.link, entry.text]);
  const textStyle = [styles.text, entry.bold && styles.textBold, entry.checked && styles.textDone];

  // Photos start as thumbnails beside the text; a bigger one shows under it.
  // The size is saved on the line; on a list that can only be viewed it is
  // kept here for as long as the list is open.
  const images = entry.images ?? [];
  const [viewedSizes, setViewedSizes] = useState<Record<string, LineImageSize>>({});
  const [blockWidth, setBlockWidth] = useState(0);
  // Until the line is measured, a bigger photo is sized from the screen, so it
  // first loads at about the size it will show at, not as a speck.
  const { width: windowWidth } = useWindowDimensions();
  const photoWidth = blockWidth || windowWidth - leadingWidth(entry.kind, entry.indentLevel, showIndent) - GUTTER;
  const sizeOf = (image: LineImage): LineImageSize =>
    (onResizeImage ? undefined : viewedSizes[image.id]) ?? image.size ?? "thumb";
  const resize = (image: LineImage) => {
    const next = nextLineImageSize(sizeOf(image));
    if (onResizeImage) onResizeImage(image.id, next);
    else setViewedSizes((current) => ({ ...current, [image.id]: next }));
  };
  const thumbs = images.filter((image) => sizeOf(image) === "thumb");
  const expanded = images.filter((image) => sizeOf(image) !== "thumb");
  const imageView = (image: LineImage) => (
    <LineImageView
      key={image.id}
      image={image}
      size={sizeOf(image)}
      maxWidth={photoWidth}
      colors={colors}
      onPress={() => resize(image)}
      onLongPress={onRemoveImage ? () => onRemoveImage(image.id) : undefined}
    />
  );

  const row = (
    <View style={[styles.row, spaceAbove && styles.rowSpaced, selected && styles.rowSelected]}>
      <GestureDetector gesture={holdGesture}>
        <View
          accessibilityHint={canReorder ? "Hold to drag the line" : undefined}
          style={[styles.leading, { width: leadingWidth(entry.kind, entry.indentLevel, showIndent) }]}
        >
          {entry.kind === "check" ? (
            <Pressable
              accessibilityLabel={entry.checked ? "Mark checklist item incomplete" : "Mark checklist item complete"}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: entry.checked, disabled: !canEdit || selecting }}
              disabled={!canEdit || selecting}
              hitSlop={{ top: 4, bottom: 4, left: 12, right: 4 }}
              onPress={toggleUnlessDragged}
              style={({ pressed }) => [styles.markerSlot, pressed && styles.markerPressed]}
            >
              <CheckMark checked={entry.checked} colors={colors} />
            </Pressable>
          ) : entry.kind === "bullet" ? (
            <View style={styles.markerSlot}>
              <View style={styles.bulletWrap}>
                <BulletMark indentLevel={showIndent ? entry.indentLevel : 0} colors={colors} />
              </View>
            </View>
          ) : null}
        </View>
      </GestureDetector>
      <View
        style={styles.textBlock}
        onLayout={images.length > 0 ? (event) => setBlockWidth(event.nativeEvent.layout.width) : undefined}
      >
        <View style={styles.lineWithThumbs}>
          <View style={styles.lineText}>
            {selecting ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`Select ${entry.text}`}
                accessibilityState={{ checked: selected }}
                onPress={onToggleSelect}
              >
                <Text style={textStyle}>{entry.text}</Text>
              </Pressable>
            ) : canEdit ? (
              <TextInput
                ref={registerInput}
                testID="list-line-input"
                accessibilityLabel={entry.text || "Empty line"}
                accessibilityHint="Edit the text. Return adds a line below."
                value={draft}
                onChangeText={changeText}
                onFocus={() => {
                  focusedRef.current = true;
                  startTextRef.current = entry.text;
                  onFocusLine();
                }}
                onBlur={() => {
                  focusedRef.current = false;
                  if (draft.trim()) {
                    if (finishText(draft.trim()) === draft.trim()) commit(draft);
                  }
                  else {
                    if (commitTimer.current) clearTimeout(commitTimer.current);
                    commitTimer.current = null;
                    if (images.length > 0) {
                      // A photo can be a line on its own.
                      if (entry.text) onCommitText("");
                    } else {
                      setDraft(entry.text);
                      onBlurEmpty();
                    }
                  }
                  onBlurLine();
                }}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === "Backspace" && draft === "") onBackspaceEmpty();
                }}
                onContentSizeChange={() => {
                  if (focusedRef.current) onGrow();
                }}
                multiline
                scrollEnabled={false}
                style={[textStyle, styles.textInput]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={entry.text}
                accessibilityHint={hasMeta ? "Shows due date, tags and notes" : undefined}
                disabled={!hasMeta}
                onPress={onOpen}
              >
                <Text style={textStyle}>{entry.text}</Text>
              </Pressable>
            )}
          </View>
          {thumbs.map(imageView)}
        </View>
        {expanded.length > 0 && <View style={styles.photos}>{expanded.map(imageView)}</View>}
        {links.length > 0 && !selecting && (
          <View style={styles.linkRow}>
            {links.map((link) => (
              <Pressable
                key={link.url}
                accessibilityRole="link"
                accessibilityLabel={`Open ${link.label}`}
                hitSlop={6}
                onPress={() => void Linking.openURL(link.url).catch(() => undefined)}
                style={({ pressed }) => [styles.linkChip, pressed && styles.markerPressed]}
              >
                <Globe size={12} color={colors.accentDark} />
                <Text numberOfLines={1} style={styles.linkText}>
                  {link.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {(!!caption || hasMeta) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Details for ${entry.text}`}
            disabled={selecting}
            onPress={onOpen}
            style={styles.metaRow}
          >
            {!!caption && (
              <View style={styles.metaItem}>
                <Link2 size={12} color={colors.muted} />
                <Text numberOfLines={1} style={styles.metaText}>
                  {caption}
                </Text>
              </View>
            )}
            {!!assignee && (
              <View style={styles.metaItem} accessibilityLabel={`For ${assignee}`}>
                <UserRound size={12} color={colors.accentDark} />
                <Text numberOfLines={1} style={[styles.metaText, { color: colors.accentDark }]}>
                  {assignee}
                </Text>
              </View>
            )}
            {!!due && (
              <View style={styles.metaItem}>
                <CalendarDays size={12} color={dueToneColor(due.tone, colors)} />
                <Text style={[styles.metaText, { color: dueToneColor(due.tone, colors) }]}>
                  {entry.dueTime ? `${due.label}, ${formatTime(entry.dueTime)}` : due.label}
                </Text>
                {!!entry.repeat && (
                  <Repeat size={12} color={dueToneColor(due.tone, colors)} accessibilityLabel={repeatLabels[entry.repeat]} />
                )}
              </View>
            )}
            {fieldLabels.length > 0 && (
              <Text style={styles.metaText}>{fieldLabels.join(" · ")}</Text>
            )}
            {!!entry.rating && (
              <Text accessibilityLabel={`Rated ${entry.rating} of 5`} style={[styles.metaText, { color: colors.accent }]}>
                {formatRating(entry.rating)}
              </Text>
            )}
            {[...(priority ? [priority] : []), ...tags].map((tag) => (
              <View key={tag.id} style={styles.metaItem}>
                <View style={[styles.priorityDot, { backgroundColor: tag.color ?? colors.muted }]} />
                <Text style={styles.metaText}>{tag.name}</Text>
              </View>
            ))}
            {!!entry.notes && (
              <Text numberOfLines={1} style={[styles.metaText, styles.notes]}>
                {entry.notes}
              </Text>
            )}
          </Pressable>
        )}
      </View>
      {isFocused && !selecting && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Line details"
          accessibilityHint="Due date, tags and notes"
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 12 }}
          onPress={onOpenDetails}
          style={({ pressed }) => [styles.detailsButton, pressed && styles.markerPressed]}
        >
          <Info size={21} color={colors.accentDark} />
        </Pressable>
      )}
      {!!fold && !selecting && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fold.folded ? `Show ${fold.count} hidden under ${entry.text || "this line"}` : `Fold ${entry.text || "this line"}`}
          accessibilityState={{ expanded: !fold.folded }}
          hitSlop={8}
          onPress={fold.onToggle}
          style={styles.foldButton}
        >
          {fold.folded && <Text style={styles.foldCount}>{fold.count}</Text>}
          {fold.folded ? <ChevronRight size={18} color={colors.muted} /> : <ChevronDown size={18} color={withAlpha(colors.muted, 0.6)} />}
        </Pressable>
      )}
      {selecting && (
        <Pressable accessible={false} onPress={onToggleSelect} style={styles.selectMark}>
          {selected ? (
            <CircleCheck size={22} color={colors.accentDark} />
          ) : (
            <Circle size={22} color={withAlpha(colors.muted, 0.6)} />
          )}
        </Pressable>
      )}
    </View>
  );

  const swipeable = (
    <ReanimatedSwipeable
      ref={swipeRef}
      enabled={!dragActive && !selecting && (canSwipeRight || hasSwipeActions)}
      // Leaves the screen's left edge to the swipe that goes back.
      hitSlop={{ left: -GUTTER }}
      friction={1.6}
      leftThreshold={64}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        canSwipeRight
          ? () => (
              <View style={[styles.swipeCheck, entry.checked && styles.swipeCheckUndo]}>
                {entry.checked ? <Undo2 size={20} color={colors.onAccent} /> : <Check size={20} color={colors.onAccent} />}
                <Text style={styles.swipeCheckText}>{entry.checked ? "Uncheck" : "Check off"}</Text>
              </View>
            )
          : undefined
      }
      renderRightActions={
        hasSwipeActions
          ? () => (
              <View style={styles.swipeButtons}>
                {!!onSwipeLink && (
                  <SwipeButton
                    label="Add to"
                    accessibilityLabel={`Add ${entry.text} to another list`}
                    icon={<ListPlus size={20} color={colors.onAccent} />}
                    tone={colors.buttonPrimaryBg}
                    onPress={() => {
                      swipeRef.current?.close();
                      onSwipeLink();
                    }}
                    styles={styles}
                  />
                )}
                {!!onSwipeMove && (
                  <SwipeButton
                    label="Move"
                    accessibilityLabel={`Move ${entry.text} to another list`}
                    icon={<FolderInput size={20} color={colors.onAccent} />}
                    tone={colors.blue}
                    onPress={() => {
                      swipeRef.current?.close();
                      onSwipeMove();
                    }}
                    styles={styles}
                  />
                )}
                {!!onSwipeDelete && (
                  <SwipeButton
                    label={borrowed ? "Remove" : "Delete"}
                    accessibilityLabel={borrowed ? `Remove ${entry.text} from this list` : `Delete ${entry.text}`}
                    icon={<Trash2 size={20} color={colors.onAccent} />}
                    tone={colors.buttonDangerBg}
                    onPress={() => {
                      swipeRef.current?.close();
                      onSwipeDelete();
                    }}
                    styles={styles}
                  />
                )}
              </View>
            )
          : undefined
      }
      onSwipeableOpen={(direction) => {
        // "right": the row moved right, showing the check-off action.
        if (direction !== "right") return;
        onToggle();
        swipeRef.current?.close();
      }}
    >
      {row}
    </ReanimatedSwipeable>
  );

  // Dragging slides this wrapper, not the row: the swipe container clips what
  // moves outside it, which left the lines being moved blank.
  return (
    <Animated.View
      style={[carried && styles.rowCarried, animatedStyle]}
      onLayout={(event) => onLayoutHeight(event.nativeEvent.layout.height)}
    >
      {canEdit ? swipeable : row}
    </Animated.View>
  );
};

const SwipeButton = ({
  label,
  accessibilityLabel,
  icon,
  tone,
  onPress,
  styles,
}: {
  label: string;
  // Names the line too, since every row has these buttons.
  accessibilityLabel: string;
  icon: ReactNode;
  tone: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    style={({ pressed }) => [styles.swipeButton, { backgroundColor: tone }, pressed && styles.dim]}
  >
    {icon}
    <Text style={styles.swipeButtonText}>{label}</Text>
  </Pressable>
);

const BarButton = ({
  label,
  icon,
  accessibilityLabel,
  selected = false,
  disabled = false,
  strong = false,
  onPress,
  styles,
}: {
  label?: string;
  icon?: ReactNode;
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  strong?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ selected, disabled }}
    disabled={disabled}
    hitSlop={4}
    onPress={onPress}
    style={({ pressed }) => [
      styles.barButton,
      !label && styles.barIconButton,
      selected && styles.barButtonSelected,
      (pressed || disabled) && styles.dim,
    ]}
  >
    {icon}
    {!!label && <Text style={[styles.barButtonText, strong && styles.barButtonStrong]}>{label}</Text>}
  </Pressable>
);

const SelectButton = ({
  label,
  icon,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.selectButton, (pressed || disabled) && styles.dim]}
  >
    {icon}
    <Text style={styles.selectButtonText}>{label}</Text>
  </Pressable>
);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingBottom: spacing.xl,
    },
    contentInner: {
      flexGrow: 1,
    },
    row: {
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      flexDirection: "row",
      paddingRight: GUTTER,
    },
    rowSpaced: {
      paddingTop: spacing.sm,
    },
    rowSelected: {
      backgroundColor: withAlpha(colors.accent, 0.14),
    },
    rowCarried: {
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
    },
    leading: {
      alignItems: "flex-end",
      alignSelf: "stretch",
      minHeight: LINE_ROW_HEIGHT,
    },
    markerSlot: {
      height: LINE_ROW_HEIGHT,
      justifyContent: "center",
      width: MARKER_WIDTH,
    },
    markerPressed: {
      opacity: 0.55,
    },
    bulletWrap: {
      alignItems: "center",
      width: 22,
    },
    textBlock: {
      flex: 1,
      paddingVertical: LINE_PADDING_Y,
    },
    lineWithThumbs: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 6,
    },
    lineText: {
      flex: 1,
    },
    photos: {
      alignItems: "flex-start",
      gap: spacing.sm,
      marginBottom: 2,
      marginTop: 6,
    },
    text: {
      color: colors.ink,
      fontSize: LINE_FONT_SIZE,
      lineHeight: LINE_HEIGHT,
    },
    textBold: {
      fontWeight: "700",
    },
    textDone: {
      color: colors.muted,
    },
    textInput: {
      margin: 0,
      minHeight: LINE_HEIGHT,
      paddingBottom: 0,
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    metaRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: 2,
    },
    linkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginTop: 4,
    },
    linkChip: {
      alignItems: "center",
      backgroundColor: withAlpha(colors.accent, 0.12),
      borderRadius: 999,
      flexDirection: "row",
      flexShrink: 1,
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    linkText: {
      color: colors.accentDark,
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "600",
    },
    metaItem: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: 4,
    },
    metaText: {
      color: colors.muted,
      flexShrink: 1,
      fontSize: 13,
    },
    notes: {
      flexShrink: 1,
    },
    priorityDot: {
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    detailsButton: {
      alignItems: "flex-end",
      height: LINE_ROW_HEIGHT,
      justifyContent: "center",
      width: 34,
    },
    foldButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      height: LINE_ROW_HEIGHT,
      justifyContent: "flex-end",
      paddingLeft: spacing.xs,
      paddingRight: GUTTER - 4,
    },
    foldCount: {
      color: colors.muted,
      fontSize: 13,
      fontVariant: ["tabular-nums"],
    },
    selectMark: {
      alignItems: "flex-end",
      height: LINE_ROW_HEIGHT,
      justifyContent: "center",
      width: 34,
    },
    empty: {
      color: colors.muted,
      fontSize: 15,
      paddingHorizontal: GUTTER,
      paddingVertical: spacing.sm,
    },
    hiddenNote: {
      color: colors.accentDark,
      fontSize: 14,
      paddingHorizontal: GUTTER,
      paddingVertical: spacing.sm,
    },
    filler: {
      flexGrow: 1,
      minHeight: 140,
    },
    swipeCheck: {
      alignItems: "center",
      backgroundColor: colors.buttonPrimaryBg,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: GUTTER,
      width: 150,
    },
    swipeCheckUndo: {
      backgroundColor: colors.muted,
    },
    swipeCheckText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: "600",
    },
    swipeButtons: {
      flexDirection: "row",
    },
    swipeButton: {
      alignItems: "center",
      justifyContent: "center",
      width: 72,
    },
    swipeButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 3,
    },
    dim: {
      opacity: 0.35,
    },
    // Every button fits across a phone, so the bar never has to scroll.
    bar: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    barRow: {
      alignItems: "center",
      flexDirection: "row",
      flexGrow: 1,
      flexShrink: 1,
      maxWidth: 460,
    },
    barDivider: {
      backgroundColor: colors.border,
      height: 20,
      width: StyleSheet.hairlineWidth,
    },
    barButton: {
      alignItems: "center",
      borderRadius: 9,
      flexDirection: "row",
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 8,
    },
    barIconButton: {
      flex: 1,
      paddingHorizontal: 0,
    },
    barButtonSelected: {
      backgroundColor: withAlpha(colors.accent, 0.22),
    },
    barButtonText: {
      color: colors.accentDark,
      fontSize: 16,
    },
    barButtonStrong: {
      fontWeight: "700",
    },
    selectBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      bottom: 0,
      left: 0,
      paddingTop: spacing.xs,
      position: "absolute",
      right: 0,
    },
    selectCount: {
      color: colors.muted,
      fontSize: 13,
      textAlign: "center",
    },
    selectActions: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingHorizontal: spacing.xs,
    },
    selectCountRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "center",
    },
    selectAll: {
      color: colors.accentDark,
      fontSize: 13,
      fontWeight: "600",
    },
    selectButton: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      maxWidth: 76,
      minHeight: 50,
    },
    selectButtonText: {
      color: colors.ink,
      fontSize: 12,
      marginTop: 3,
    },
    tipWrap: {
      left: spacing.md,
      position: "absolute",
      right: spacing.md,
    },
    toast: {
      alignItems: "center",
      backgroundColor: colors.ink,
      borderRadius: 14,
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between",
      left: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      position: "absolute",
      right: spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
    },
    toastText: {
      color: colors.background,
      flexShrink: 1,
      fontSize: 15,
    },
    toastAction: {
      color: colors.background,
      fontSize: 15,
      fontWeight: "700",
    },
  });
