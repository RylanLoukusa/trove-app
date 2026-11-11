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
  InputAccessoryView,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  CalendarDays,
  Check,
  CheckCheck,
  Circle,
  CircleCheck,
  CornerUpRight,
  FolderInput,
  Info,
  Link2,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListPlus,
  Trash2,
  Undo2,
} from "lucide-react-native";

import { ListEntrySheet } from "./ListEntrySheet";
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
import { useThemeColors } from "../theme/ThemeContext";
import type { ListEntry, ListItemKind, TagOption } from "../types/models";
import { MAX_ENTRY_INDENT, PastedLine, splitEnteredText } from "../utils/listEntries";
import {
  describeDueDate,
  DueTone,
  entryPriority,
  listSortLabels,
  ListViewSettings,
  orderEntriesForView,
} from "../utils/listView";

export type EntryUpdates = Partial<
  Pick<ListEntry, "text" | "kind" | "bold" | "dueDate" | "notes" | "tagOptionIds" | "indentLevel">
>;

// A line to add: its text, plus how it is marked when that is already known.
export type NewLine = PastedLine & { kind?: ListItemKind; bold?: boolean };

export type ListEntriesViewHandle = {
  showToast: (message: string, undo?: () => void) => void;
  // Saves text still sitting in the bottom line. Returns whether it added a line.
  flush: () => boolean;
};

type LineFormat = { kind: ListItemKind; bold: boolean; indentLevel: number };

// Shared by every line's text box so iOS shows one bar above the keyboard.
const KEYBOARD_BAR_ID = "trove-list-keyboard-bar";
const ADD_ROW_ID = "__add";
const COMMIT_DELAY_MS = 700;
// Space between the screen edge and a line; also where a line is held to drag it.
const GUTTER = 20;
const SELECT_BAR_HEIGHT = 76;

type Props = {
  entries: ListEntry[];
  priorityOptions: TagOption[];
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
  onMoveEntry: (entryId: string, afterEntryId: string | null, beforeEntryId: string | null) => void;
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
    canEdit,
    settings,
    onChangeSettings,
    selecting,
    onChangeSelecting,
    onToggleEntry,
    onSetChecked,
    onUpdateEntry,
    onMoveEntry,
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

  const visibleEntries = useMemo(
    () => orderEntriesForView(entries, settings, priorityOptions),
    [entries, priorityOptions, settings],
  );
  const hiddenCount = entries.length - visibleEntries.length;
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
  const heightsRef = useRef<Record<string, number>>({});
  const [dragging, setDragging] = useState<{ id: string; startIndex: number } | null>(null);
  const [overIndex, setOverIndexState] = useState(0);
  const overIndexRef = useRef(0);

  const setOverIndex = useCallback((next: number) => {
    overIndexRef.current = next;
    setOverIndexState((current) => (current === next ? current : next));
  }, []);

  const startDrag = useCallback(
    (id: string, startIndex: number) => {
      setOverIndex(startIndex);
      setDragging({ id, startIndex });
    },
    [setOverIndex],
  );

  const updateDrag = useCallback(
    (startIndex: number, translationY: number) => {
      const heights = visibleEntries.map((entry) => heightsRef.current[entry.id] ?? LINE_ROW_HEIGHT);
      setOverIndex(targetIndexFor(startIndex, translationY, heights));
    },
    [setOverIndex, visibleEntries],
  );

  const showToastRef = useRef<((message: string, undo?: () => void) => void) | null>(null);

  // Any reorder by hand means the list is now in your own order.
  const switchToManualOrder = useCallback(() => {
    if (settings.sortMode === "manual") return;
    onChangeSettings({ sortMode: "manual" });
    showToastRef.current?.(`Now sorted by ${listSortLabels.manual}`);
  }, [onChangeSettings, settings.sortMode]);

  const endDrag = useCallback(
    (id: string, startIndex: number) => {
      const targetIndex = overIndexRef.current;
      setDragging(null);
      if (targetIndex === startIndex) return;
      const others = visibleEntries.filter((entry) => entry.id !== id);
      const after = others[targetIndex - 1] ?? null;
      const before = others[targetIndex] ?? null;
      onMoveEntry(id, after?.id ?? null, before?.id ?? null);
      switchToManualOrder();
    },
    [onMoveEntry, switchToManualOrder, visibleEntries],
  );

  const draggingHeight = dragging ? heightsRef.current[dragging.id] ?? LINE_ROW_HEIGHT : 0;
  const shiftFor = (index: number): number => {
    if (!dragging || index === dragging.startIndex) return 0;
    if (dragging.startIndex < overIndex && index > dragging.startIndex && index <= overIndex) return -draggingHeight;
    if (dragging.startIndex > overIndex && index >= overIndex && index < dragging.startIndex) return draggingHeight;
    return 0;
  };

  // --- Typing in place -----------------------------------------------------
  const inputRefs = useRef(new Map<string, TextInput>());
  const pendingFocusRef = useRef<string | null>(null);
  // A line being moved with the arrow buttons can lose the cursor for a
  // moment as it changes place. While this is set the line gets it straight
  // back and is not treated as abandoned.
  const keepIdRef = useRef<string | null>(null);
  const keepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (keepTimer.current) clearTimeout(keepTimer.current);
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
    const ids = onInsertEntries(null, lines);
    // The next line carries on like the one just added, minus the bold.
    setAddOverride(null);
    if (isPaste) announcePaste(ids);
  };

  const commitAddDraft = useCallback((): boolean => {
    const text = draftRef.current.trim();
    if (!text) return false;
    onInsertEntries(null, [
      {
        text,
        checked: false,
        indentLevel: addFormatRef.current.indentLevel,
        kind: addFormatRef.current.kind,
        ...(addFormatRef.current.bold ? { bold: true } : {}),
      },
    ]);
    setDraft("");
    setAddOverride(null);
    return true;
  }, [onInsertEntries, setDraft]);

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
  const focusedIndex = focusedEntry ? visibleEntries.findIndex((entry) => entry.id === focusedEntry.id) : -1;
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

  const moveFocused = (direction: -1 | 1) => {
    if (!focusedEntry || focusedIndex < 0) return;
    const neighbour = visibleEntries[focusedIndex + direction];
    if (!neighbour) return;
    const beyond = visibleEntries[focusedIndex + direction * 2] ?? null;
    keepIdRef.current = focusedEntry.id;
    if (keepTimer.current) clearTimeout(keepTimer.current);
    keepTimer.current = setTimeout(() => {
      keepIdRef.current = null;
    }, 600);
    if (direction < 0) onMoveEntry(focusedEntry.id, beyond?.id ?? null, neighbour.id);
    else onMoveEntry(focusedEntry.id, neighbour.id, beyond?.id ?? null);
  };

  // --- Sending, checking and deleting (swipe and select mode) --------------
  const canMove = !!onMoveEntries && !!moveTargets?.length;
  const canLink = !!onLinkEntries && !!linkTargets?.length;
  const linkable = useCallback((id: string) => canLink && !isBorrowed(id), [canLink, isBorrowed]);

  const exitSelecting = () => onChangeSelecting(false);

  const startSend = (ids: string[], mode: SendMode) => {
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
        <BarButton
          accessibilityLabel="Move line up"
          disabled={!focusedEntry || !manualOrder || focusedIndex <= 0}
          icon={<ArrowUp size={20} color={iconTone} />}
          onPress={() => moveFocused(-1)}
          styles={styles}
        />
        <BarButton
          accessibilityLabel="Move line down"
          disabled={!focusedEntry || !manualOrder || focusedIndex < 0 || focusedIndex >= visibleEntries.length - 1}
          icon={<ArrowDown size={20} color={iconTone} />}
          onPress={() => moveFocused(1)}
          styles={styles}
        />
        <View style={styles.barDivider} />
        <BarButton
          accessibilityLabel="Send to another list"
          disabled={!focusedEntry || (!canMove && !(focusedEntry && linkable(focusedEntry.id)))}
          icon={<CornerUpRight size={20} color={iconTone} />}
          onPress={() => focusedEntry && startSend([focusedEntry.id], linkable(focusedEntry.id) ? "add" : "move")}
          styles={styles}
        />
        <BarButton
          accessibilityLabel="Line details"
          disabled={!focusedEntry}
          icon={<Info size={20} color={iconTone} />}
          onPress={() => {
            if (!focusedEntry) return;
            const id = focusedEntry.id;
            Keyboard.dismiss();
            setFocusedId(null);
            setOpenEntryId(id);
          }}
          styles={styles}
        />
      </View>
      <BarButton label="Done" strong onPress={() => Keyboard.dismiss()} styles={styles} />
    </View>
  ) : null;
  const inlineBar = Platform.OS !== "ios" ? keyboardBar : null;

  const openEntry = entries.find((entry) => entry.id === openEntryId) ?? null;
  const openEntryLists = openEntry
    ? (linkedListIds?.[openEntry.id] ?? [])
        .map((id) => linkTargets?.find((target) => target.id === id))
        .filter((target): target is ListTarget => !!target)
    : [];

  const addPlaceholder =
    entries.length === 0 ? "Start typing" : addFormat.kind === "text" ? "New line" : "New item";

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, selecting && { paddingBottom: SELECT_BAR_HEIGHT + insets.bottom + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        scrollEnabled={!dragging}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onLayout={(event) => {
          viewportRef.current = event.nativeEvent.layout.height;
        }}
      >
        <View ref={contentRef} collapsable={false} style={styles.contentInner}>
          {header}

          {visibleEntries.map((entry, index) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              styles={styles}
              colors={colors}
              priority={entryPriority(entry, priorityOptions)}
              caption={captions?.[entry.id]}
              borrowed={!!referenceSources?.[entry.id]}
              showIndent={manualOrder}
              spaceAbove={index > 0 && isHeading(entry) && entry.indentLevel === 0}
              canEdit={canEdit}
              canReorder={canReorder}
              isDragging={dragging?.id === entry.id}
              shift={shiftFor(index)}
              onLayoutHeight={(height) => {
                heightsRef.current[entry.id] = height;
              }}
              onToggle={() => onToggleEntry(entry)}
              onOpen={() => setOpenEntryId(entry.id)}
              registerInput={(input) => registerInput(entry.id, input)}
              onCommitText={(text) => {
                if (text !== entry.text) onUpdateEntry(entry.id, { text });
              }}
              onSplit={(previous, next) => splitLine(entry, previous, next)}
              onBackspaceEmpty={() => backspaceEmpty(entry)}
              onFocusLine={() => {
                setFocusedId(entry.id);
                revealSoon(entry.id);
              }}
              onGrow={() => reveal(entry.id)}
              onBlurEmpty={() => {
                if (keepIdRef.current !== entry.id && !isBorrowed(entry.id)) onDeleteEntry(entry.id);
              }}
              onBlurLine={() => {
                if (keepIdRef.current === entry.id) {
                  requestAnimationFrame(() => inputRefs.current.get(entry.id)?.focus());
                  return;
                }
                setFocusedId((current) => (current === entry.id ? null : current));
              }}
              belowRow={focusedId === entry.id ? inlineBar : null}
              selecting={selecting}
              selected={selectedIds.has(entry.id)}
              onToggleSelect={() => toggleSelected(entry.id)}
              onSwipeLink={linkable(entry.id) ? () => startSend([entry.id], "add") : undefined}
              onSwipeMove={canMove ? () => startSend([entry.id], "move") : undefined}
              onSwipeDelete={ruleEntryIds?.has(entry.id) ? undefined : () => deleteLines([entry.id])}
              onDragStart={() => startDrag(entry.id, index)}
              onDragUpdate={(translationY) => updateDrag(index, translationY)}
              onDragEnd={() => endDrag(entry.id, index)}
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
                  inputAccessoryViewID={KEYBOARD_BAR_ID}
                  style={[styles.text, styles.textInput, addFormat.bold && styles.textBold]}
                />
              </View>
            </View>
          )}
          {addFocused && inlineBar}

          {canEdit && !selecting ? (
            // Tapping the empty page below the last line carries on typing.
            <Pressable accessible={false} onPress={() => focusLine(ADD_ROW_ID)} style={styles.filler} />
          ) : (
            <View style={styles.filler} />
          )}

          {footer}
        </View>
      </ScrollView>

      {selecting && (
        <View style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}>
          <Text style={styles.selectCount}>
            {selectedList.length === 0 ? "Tap lines to select them" : `${selectedList.length} selected`}
          </Text>
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
              label="Delete"
              icon={<Trash2 size={20} color={colors.danger} />}
              disabled={selectedList.length === 0}
              onPress={() => deleteLines(selectedList)}
              styles={styles}
            />
          </View>
        </View>
      )}

      {!!toast && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            // Above the select bar, or the home indicator when no keyboard is up.
            { bottom: (selecting ? SELECT_BAR_HEIGHT : 0) + (focusedId ? 0 : insets.bottom) + spacing.sm },
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

      {canEdit && Platform.OS === "ios" && (
        <InputAccessoryView nativeID={KEYBOARD_BAR_ID}>{keyboardBar}</InputAccessoryView>
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
      <ListEntrySheet
        entry={openEntry}
        priorityOptions={priorityOptions}
        canEdit={canEdit}
        sourceListTitle={openEntry ? referenceSources?.[openEntry.id] : undefined}
        fromRule={!!openEntry && !!ruleEntryIds?.has(openEntry.id)}
        alsoOnLists={openEntryLists}
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
  entry: ListEntry;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  priority?: TagOption;
  caption?: string;
  // The line lives on another list and is only shown here.
  borrowed: boolean;
  showIndent: boolean;
  // A little air above a heading that isn't the first line.
  spaceAbove: boolean;
  canEdit: boolean;
  canReorder: boolean;
  isDragging: boolean;
  shift: number;
  onLayoutHeight: (height: number) => void;
  onToggle: () => void;
  onOpen: () => void;
  onDragStart: () => void;
  onDragUpdate: (translationY: number) => void;
  onDragEnd: () => void;
  registerInput: (input: TextInput | null) => void;
  onCommitText: (text: string) => void;
  // Text with a line break in it (Return or a paste); returns what stays.
  onSplit: (previous: string, next: string) => string;
  onBackspaceEmpty: () => void;
  onFocusLine: () => void;
  onBlurLine: () => void;
  onBlurEmpty: () => void;
  // The text wrapped onto another row while being typed.
  onGrow: () => void;
  belowRow?: ReactNode;
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
  entry,
  styles,
  colors,
  priority,
  caption,
  borrowed,
  showIndent,
  spaceAbove,
  canEdit,
  canReorder,
  isDragging,
  shift,
  onLayoutHeight,
  onToggle,
  onOpen,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  registerInput,
  onCommitText,
  onSplit,
  onBackspaceEmpty,
  onFocusLine,
  onBlurLine,
  onBlurEmpty,
  onGrow,
  belowRow,
  selecting,
  selected,
  onToggleSelect,
  onSwipeLink,
  onSwipeMove,
  onSwipeDelete,
}: EntryRowProps) => {
  const dragY = useSharedValue(0);
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

  const changeText = (next: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (/[\r\n]/.test(next)) {
      setDraft(onSplit(draft, next).trim());
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
        .onEnd(() => {
          dragY.value = 0;
          runOnJS(markDrag)();
          runOnJS(onDragEnd)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canReorder, dragY, onDragEnd, onDragStart, onDragUpdate, markDrag],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (isDragging) return { transform: [{ translateY: dragY.value }], zIndex: 10 };
    return { transform: [{ translateY: withTiming(shift, { duration: 140 }) }], zIndex: 0 };
  }, [isDragging, shift]);

  const hasMeta = !!due || !!priority || !!entry.notes;
  const textStyle = [styles.text, entry.bold && styles.textBold, entry.checked && styles.textDone];

  const row = (
    <Animated.View
      style={[
        styles.row,
        spaceAbove && styles.rowSpaced,
        selected && styles.rowSelected,
        isDragging && styles.rowDragging,
        animatedStyle,
      ]}
      onLayout={(event) => onLayoutHeight(event.nativeEvent.layout.height)}
    >
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
      <View style={styles.textBlock}>
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
              onFocusLine();
            }}
            onBlur={() => {
              focusedRef.current = false;
              if (draft.trim()) commit(draft);
              else {
                if (commitTimer.current) clearTimeout(commitTimer.current);
                commitTimer.current = null;
                setDraft(entry.text);
                onBlurEmpty();
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
            inputAccessoryViewID={KEYBOARD_BAR_ID}
            style={[textStyle, styles.textInput]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={entry.text}
            accessibilityHint={hasMeta ? "Shows due date, priority and notes" : undefined}
            disabled={!hasMeta}
            onPress={onOpen}
          >
            <Text style={textStyle}>{entry.text}</Text>
          </Pressable>
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
            {!!due && (
              <View style={styles.metaItem}>
                <CalendarDays size={12} color={dueToneColor(due.tone, colors)} />
                <Text style={[styles.metaText, { color: dueToneColor(due.tone, colors) }]}>{due.label}</Text>
              </View>
            )}
            {!!priority && (
              <View style={styles.metaItem}>
                <View style={[styles.priorityDot, { backgroundColor: priority.color ?? colors.muted }]} />
                <Text style={styles.metaText}>{priority.name}</Text>
              </View>
            )}
            {!!entry.notes && (
              <Text numberOfLines={1} style={[styles.metaText, styles.notes]}>
                {entry.notes}
              </Text>
            )}
          </Pressable>
        )}
      </View>
      {selecting && (
        <Pressable accessible={false} onPress={onToggleSelect} style={styles.selectMark}>
          {selected ? (
            <CircleCheck size={22} color={colors.accentDark} />
          ) : (
            <Circle size={22} color={withAlpha(colors.muted, 0.6)} />
          )}
        </Pressable>
      )}
    </Animated.View>
  );

  if (!canEdit) return row;

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeRef}
        enabled={!isDragging && !selecting && (canSwipeRight || hasSwipeActions)}
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
      {belowRow}
    </>
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
    rowDragging: {
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
      paddingHorizontal: spacing.sm,
    },
    selectButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 50,
      minWidth: 68,
    },
    selectButtonText: {
      color: colors.ink,
      fontSize: 12,
      marginTop: 3,
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
