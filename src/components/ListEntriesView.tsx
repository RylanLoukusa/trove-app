import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCheck,
  Circle,
  CircleCheck,
  Flag,
  FolderInput,
  GripVertical,
  Info,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  Plus,
  Star,
  Trash2,
  Undo2,
} from "lucide-react-native";

import { ChoiceSheet } from "./ChoiceSheet";
import { MoveTarget, MoveToListSheet, useRecentMoveTargets } from "./MoveToListSheet";
import { FocusListChoice, ListEntrySheet } from "./ListEntrySheet";
import { useListViewSettings } from "../storage/listViewSettings";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { ListEntry, TagOption } from "../types/models";
import { bulletGlyphForIndent } from "../utils/itemTypes";
import { MAX_ENTRY_INDENT, PastedLine, splitEnteredText } from "../utils/listEntries";
import {
  CompletedMode,
  completedModeLabels,
  describeDueDate,
  DueTone,
  entryPriority,
  ListSortMode,
  listSortLabels,
  orderEntriesForView,
  quickDueDates,
  withPriority,
} from "../utils/listView";

export type EntryUpdates = Partial<Pick<ListEntry, "text" | "dueDate" | "notes" | "tagOptionIds" | "indentLevel">>;

// Shared by every line's text box so iOS shows one bar above the keyboard.
const KEYBOARD_BAR_ID = "trove-list-keyboard-bar";
const ADD_ROW_ID = "__add";
const COMMIT_DELAY_MS = 700;

type Props = {
  listId: string;
  entries: ListEntry[];
  priorityOptions: TagOption[];
  canEdit: boolean;
  onToggleEntry: (entry: ListEntry) => void;
  onUpdateEntry: (entryId: string, updates: EntryUpdates) => void;
  onMoveEntry: (entryId: string, afterEntryId: string | null, beforeEntryId: string | null) => void;
  // Adds lines right after a line (null: at the end) and returns their ids.
  onInsertEntries: (afterEntryId: string | null, lines: PastedLine[]) => string[];
  onDeleteEntry: (entryId: string) => void;
  // Small line under an entry's text, such as the list a focus-list line
  // comes from, or the focus lists a line is in.
  captions?: Record<string, string>;
  // Entries that are lines from another list (focus lists only): deleting one
  // only takes it out of this list.
  referenceSources?: Record<string, string>;
  // Lines a smart focus list's rule pulled in; they can't be removed by hand.
  ruleEntryIds?: Set<string>;
  // Focus lists a line can be added to from its sheet (regular lists only).
  focusLists?: FocusListChoice[];
  focusMembership?: Record<string, string[]>;
  onToggleFocusList?: (entryId: string, focusListId: string) => void;
  // Adds several lines to a focus list at once (select mode).
  onAddToFocusList?: (entryIds: string[], focusListId: string) => void;
  // Lists a line can be moved to, and the move itself. Returns the target's
  // title and an undo, or null when nothing moved.
  moveTargets?: MoveTarget[];
  onMoveEntries?: (entryIds: string[], listId: string) => { listTitle: string; undo: () => void } | null;
  // Puts deleted lines back (Undo).
  onRestoreEntries?: (entries: ListEntry[]) => void;
  headerAccessory?: ReactNode;
  emptyText?: string;
  // Bump to put the cursor in the "New item" line (e.g. after a list's title).
  focusAddSignal?: number;
};

const sortOptions = (Object.keys(listSortLabels) as ListSortMode[]).map((value) => ({ value, label: listSortLabels[value] }));
const completedOptions = (Object.keys(completedModeLabels) as CompletedMode[]).map((value) => ({
  value,
  label: completedModeLabels[value],
}));

// Index the dragged row should land on, given how far it has moved and the
// measured height of every row.
const targetIndexFor = (startIndex: number, translationY: number, heights: number[]): number => {
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

export const ListEntriesView = ({
  listId,
  entries,
  priorityOptions,
  canEdit,
  onToggleEntry,
  onUpdateEntry,
  onMoveEntry,
  onInsertEntries,
  onDeleteEntry,
  captions,
  referenceSources,
  ruleEntryIds,
  focusLists,
  focusMembership,
  onToggleFocusList,
  onAddToFocusList,
  moveTargets,
  onMoveEntries,
  onRestoreEntries,
  headerAccessory,
  emptyText = "Nothing on this list yet.",
  focusAddSignal,
}: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, updateSettings] = useListViewSettings(listId);
  const [sheet, setSheet] = useState<"sort" | "completed" | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const visibleEntries = useMemo(
    () => orderEntriesForView(entries, settings, priorityOptions),
    [entries, priorityOptions, settings],
  );
  const hiddenCount = entries.length - visibleEntries.length;
  const doneCount = entries.filter((entry) => entry.checked).length;
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [focusPickIds, setFocusPickIds] = useState<string[] | null>(null);
  const [recentTargets, rememberTarget] = useRecentMoveTargets();
  // Drag works in any sort; dropping a line switches the list to your order.
  const canReorder = canEdit && !selecting;

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
      const heights = visibleEntries.map((entry) => heightsRef.current[entry.id] ?? 56);
      setOverIndex(targetIndexFor(startIndex, translationY, heights));
    },
    [setOverIndex, visibleEntries],
  );

  const endDrag = useCallback(
    (id: string, startIndex: number) => {
      const targetIndex = overIndexRef.current;
      setDragging(null);
      if (targetIndex === startIndex) return;
      const others = visibleEntries.filter((entry) => entry.id !== id);
      const after = others[targetIndex - 1] ?? null;
      const before = others[targetIndex] ?? null;
      onMoveEntry(id, after?.id ?? null, before?.id ?? null);
      if (settings.sortMode !== "manual") {
        updateSettings({ sortMode: "manual" });
        showToastRef.current?.(`Now sorted by ${listSortLabels.manual}`);
      }
    },
    [onMoveEntry, settings.sortMode, updateSettings, visibleEntries],
  );

  const showToastRef = useRef<((message: string, undo?: () => void) => void) | null>(null);

  const draggingHeight = dragging ? heightsRef.current[dragging.id] ?? 56 : 0;
  const shiftFor = (index: number): number => {
    if (!dragging || index === dragging.startIndex) return 0;
    if (dragging.startIndex < overIndex && index > dragging.startIndex && index <= overIndex) return -draggingHeight;
    if (dragging.startIndex > overIndex && index >= overIndex && index < dragging.startIndex) return draggingHeight;
    return 0;
  };

  // --- Typing in place -----------------------------------------------------
  const inputRefs = useRef(new Map<string, TextInput>());
  const pendingFocusRef = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickDates = useMemo(() => quickDueDates(), [focusedId]);

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

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  showToastRef.current = showToast;

  // Lines that live on another list, or that a rule pulled in: they can be
  // edited here but not deleted by emptying them.
  const isBorrowed = useCallback(
    (id: string) => !!referenceSources?.[id] || !!ruleEntryIds?.has(id),
    [referenceSources, ruleEntryIds],
  );

  const announcePaste = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;
      showToast(`Added ${ids.length} items`, () => ids.forEach((id) => onDeleteEntry(id)));
    },
    [onDeleteEntry, showToast],
  );

  // Return or a paste inside an existing line.
  const splitLine = useCallback(
    (entry: ListEntry, previous: string, next: string) => {
      const { keep, added, isPaste } = splitEnteredText(previous, next);
      if (keep.trim() && keep.trim() !== entry.text) onUpdateEntry(entry.id, { text: keep.trim() });
      if (!isPaste && !keep.trim() && !added[0]?.text) {
        // Return on an empty line ends typing, like a notes app.
        Keyboard.dismiss();
        return keep;
      }
      const lines = added.map((line) => ({
        ...line,
        kind: entry.kind,
        indentLevel: isPaste ? Math.min(line.indentLevel + entry.indentLevel, MAX_ENTRY_INDENT) : entry.indentLevel,
      }));
      if (lines.length === 0) return keep;
      const ids = onInsertEntries(entry.id, lines);
      if (ids.length) focusLine(ids[ids.length - 1]);
      if (isPaste) announcePaste(ids);
      return keep;
    },
    [announcePaste, focusLine, onInsertEntries, onUpdateEntry],
  );

  // Return or a paste in the "New item" line at the bottom.
  const changeAddDraft = (next: string) => {
    if (!/[\r\n]/.test(next)) {
      setDraft(next);
      return;
    }
    const { keep, added, isPaste } = splitEnteredText(draft, next);
    const lines: PastedLine[] = [
      ...(keep.trim() ? [{ text: keep.trim(), checked: false, indentLevel: 0 }] : []),
      ...(isPaste ? added : []),
    ];
    setDraft("");
    if (lines.length === 0) {
      Keyboard.dismiss();
      return;
    }
    const ids = onInsertEntries(null, lines);
    if (isPaste) announcePaste(ids);
  };

  const commitAddDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onInsertEntries(null, [{ text, checked: false, indentLevel: 0 }]);
    setDraft("");
  };

  // Backspace in an empty line: go to the end of the line above. The empty
  // line is then deleted when it loses focus.
  const backspaceEmpty = (entryId: string) => {
    const index = visibleEntries.findIndex((entry) => entry.id === entryId);
    const above = index > 0 ? visibleEntries[index - 1] : null;
    if (above) focusLine(above.id);
  };

  const focusedEntry = focusedId && focusedId !== ADD_ROW_ID ? entries.find((entry) => entry.id === focusedId) ?? null : null;
  const canIndentFocused = !!focusedEntry && settings.sortMode === "manual" && !isBorrowed(focusedEntry.id);
  const focusedPriority = focusedEntry ? entryPriority(focusedEntry, priorityOptions) : undefined;

  const cyclePriority = () => {
    if (!focusedEntry || priorityOptions.length === 0) return;
    const ordered = [...priorityOptions].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = focusedPriority ? ordered.findIndex((option) => option.id === focusedPriority.id) : -1;
    const next = ordered[index + 1] ?? null;
    onUpdateEntry(focusedEntry.id, { tagOptionIds: withPriority(focusedEntry.tagOptionIds, priorityOptions, next?.id ?? null) });
  };

  // --- Moving, focus lists, deleting (swipe and select mode) ---------------
  const canMove = !!onMoveEntries && !!moveTargets;
  const canFocus = !!focusLists?.length && (!!onToggleFocusList || !!onAddToFocusList);

  const exitSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const startMove = (ids: string[]) => {
    if (!canMove || ids.length === 0) return;
    Keyboard.dismiss();
    setMoveIds(ids);
  };

  const finishMove = (listId: string) => {
    const ids = moveIds ?? [];
    setMoveIds(null);
    const result = onMoveEntries?.(ids, listId);
    if (!result) return;
    rememberTarget(listId);
    exitSelecting();
    showToast(
      ids.length === 1 ? `Moved to ${result.listTitle}` : `Moved ${ids.length} items to ${result.listTitle}`,
      result.undo,
    );
  };

  const applyFocus = (ids: string[], focusListId: string) => {
    const focusList = focusLists?.find((candidate) => candidate.id === focusListId);
    if (!focusList) return;
    if (ids.length === 1 && onToggleFocusList) {
      const wasIn = !!focusMembership?.[ids[0]]?.includes(focusListId);
      onToggleFocusList(ids[0], focusListId);
      showToast(wasIn ? `Removed from ${focusList.title}` : `Added to ${focusList.title}`);
    } else if (onAddToFocusList) {
      onAddToFocusList(ids, focusListId);
      showToast(`Added ${ids.length} items to ${focusList.title}`);
    }
    exitSelecting();
  };

  const startFocus = (ids: string[]) => {
    if (!canFocus || ids.length === 0 || !focusLists) return;
    if (focusLists.length === 1) applyFocus(ids, focusLists[0].id);
    else setFocusPickIds(ids);
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
    const label = removable.length === 1 ? "Deleted 1 item" : `Deleted ${removable.length} items`;
    showToast(
      label,
      onRestoreEntries && restorable.length === removable.length ? () => onRestoreEntries(restorable) : undefined,
    );
  };

  const checkSelected = () => {
    const chosen = entries.filter((entry) => selectedIds.has(entry.id) && entry.kind === "check");
    const allDone = chosen.length > 0 && chosen.every((entry) => entry.checked);
    chosen.filter((entry) => entry.checked === allDone).forEach((entry) => onToggleEntry(entry));
    exitSelecting();
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedList = [...selectedIds].filter((id) => entries.some((entry) => entry.id === id));
  const moveSubject =
    moveIds && moveIds.length === 1
      ? `"${entries.find((entry) => entry.id === moveIds[0])?.text ?? "item"}"`
      : `${moveIds?.length ?? 0} items`;

  const keyboardBar = focusedId ? (
    <View style={styles.bar}>
      {datesOpen && focusedEntry ? (
        <View style={styles.barRow}>
          {quickDates.map((quick) => (
            <BarButton
              key={quick.key}
              label={quick.label}
              selected={focusedEntry.dueDate === quick.value}
              onPress={() => {
                onUpdateEntry(focusedEntry.id, { dueDate: focusedEntry.dueDate === quick.value ? undefined : quick.value });
                setDatesOpen(false);
              }}
              styles={styles}
            />
          ))}
          {!!focusedEntry.dueDate && (
            <BarButton
              label="Clear"
              onPress={() => {
                onUpdateEntry(focusedEntry.id, { dueDate: undefined });
                setDatesOpen(false);
              }}
              styles={styles}
            />
          )}
        </View>
      ) : (
        <View style={styles.barRow}>
          {canIndentFocused && (
            <>
              <BarButton
                accessibilityLabel="Outdent line"
                disabled={!focusedEntry || focusedEntry.indentLevel <= 0}
                icon={<ListIndentDecrease size={18} color={colors.accentDark} />}
                onPress={() =>
                  focusedEntry && onUpdateEntry(focusedEntry.id, { indentLevel: Math.max(focusedEntry.indentLevel - 1, 0) })
                }
                styles={styles}
              />
              <BarButton
                accessibilityLabel="Indent line"
                disabled={!focusedEntry || focusedEntry.indentLevel >= MAX_ENTRY_INDENT}
                icon={<ListIndentIncrease size={18} color={colors.accentDark} />}
                onPress={() =>
                  focusedEntry &&
                  onUpdateEntry(focusedEntry.id, { indentLevel: Math.min(focusedEntry.indentLevel + 1, MAX_ENTRY_INDENT) })
                }
                styles={styles}
              />
            </>
          )}
          {!!focusedEntry && (
            <BarButton
              accessibilityLabel="Set due date"
              icon={<CalendarDays size={18} color={colors.accentDark} />}
              label={focusedEntry.dueDate ? describeDueDate(focusedEntry.dueDate)?.label : undefined}
              onPress={() => setDatesOpen(true)}
              styles={styles}
            />
          )}
          {!!focusedEntry && priorityOptions.length > 0 && (
            <BarButton
              accessibilityLabel={`Priority: ${focusedPriority?.name ?? "none"}. Tap to change`}
              icon={<Flag size={18} color={focusedPriority?.color ?? colors.accentDark} />}
              label={focusedPriority?.name}
              onPress={cyclePriority}
              styles={styles}
            />
          )}
          {!!focusedEntry && canMove && (
            <BarButton
              accessibilityLabel="Move to another list"
              icon={<FolderInput size={18} color={colors.accentDark} />}
              onPress={() => startMove([focusedEntry.id])}
              styles={styles}
            />
          )}
          {!!focusedEntry && (
            <BarButton
              accessibilityLabel="Line details"
              icon={<Info size={18} color={colors.accentDark} />}
              onPress={() => {
                const id = focusedEntry.id;
                Keyboard.dismiss();
                setFocusedId(null);
                setOpenEntryId(id);
              }}
              styles={styles}
            />
          )}
          <View style={styles.barSpacer} />
          <BarButton label="Done" strong onPress={() => Keyboard.dismiss()} styles={styles} />
        </View>
      )}
    </View>
  ) : null;
  const inlineBar = Platform.OS !== "ios" ? keyboardBar : null;

  const openEntry = entries.find((entry) => entry.id === openEntryId) ?? null;

  return (
    <View style={styles.block}>
      {selecting ? (
        <View style={styles.selectBar}>
          <Text style={styles.selectCount}>
            {selectedList.length === 0 ? "Tap lines to select" : `${selectedList.length} selected`}
          </Text>
          <View style={styles.selectActions}>
            {canMove && (
              <BarButton
                label="Move"
                icon={<FolderInput size={16} color={colors.accentDark} />}
                disabled={selectedList.length === 0}
                onPress={() => startMove(selectedList)}
                styles={styles}
              />
            )}
            {canFocus && (
              <BarButton
                label="Focus"
                icon={<Star size={16} color={colors.accentDark} />}
                disabled={selectedList.length === 0}
                onPress={() => startFocus(selectedList)}
                styles={styles}
              />
            )}
            <BarButton
              label="Check"
              icon={<CheckCheck size={16} color={colors.accentDark} />}
              disabled={selectedList.length === 0}
              onPress={checkSelected}
              styles={styles}
            />
            <BarButton
              label="Delete"
              icon={<Trash2 size={16} color={colors.danger} />}
              disabled={selectedList.length === 0}
              onPress={() => deleteLines(selectedList)}
              styles={styles}
            />
            <BarButton label="Done" strong onPress={exitSelecting} styles={styles} />
          </View>
        </View>
      ) : (
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${listSortLabels[settings.sortMode]}`}
          onPress={() => setSheet("sort")}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <ArrowUpDown size={14} color={colors.accentDark} />
          <Text style={styles.chipText}>{listSortLabels[settings.sortMode]}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Completed items: ${completedModeLabels[settings.completedMode]}`}
          onPress={() => setSheet("completed")}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <CheckCheck size={14} color={colors.accentDark} />
          <Text style={styles.chipText}>
            {settings.completedMode === "hide" ? "Done hidden" : settings.completedMode === "bottom" ? "Done at bottom" : "Done in place"}
          </Text>
        </Pressable>
        {canEdit && entries.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select lines"
            onPress={() => {
              Keyboard.dismiss();
              setSelecting(true);
            }}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <CircleCheck size={14} color={colors.accentDark} />
            <Text style={styles.chipText}>Select</Text>
          </Pressable>
        )}
        {doneCount > 0 && (
          <Text style={styles.count}>
            {doneCount} of {entries.length} done
          </Text>
        )}
      </View>
      )}
      {!selecting && headerAccessory}

      {visibleEntries.map((entry, index) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          index={index}
          styles={styles}
          colors={colors}
          priority={entryPriority(entry, priorityOptions)}
          caption={captions?.[entry.id]}
          showIndent={settings.sortMode === "manual"}
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
          onBackspaceEmpty={() => backspaceEmpty(entry.id)}
          onFocusLine={() => {
            setDatesOpen(false);
            setFocusedId(entry.id);
          }}
          onBlurEmpty={() => {
            if (!isBorrowed(entry.id)) onDeleteEntry(entry.id);
          }}
          onBlurLine={() => setFocusedId((current) => (current === entry.id ? null : current))}
          belowRow={focusedId === entry.id ? inlineBar : null}
          selecting={selecting}
          selected={selectedIds.has(entry.id)}
          onToggleSelect={() => toggleSelected(entry.id)}
          onSwipeMove={canMove ? () => startMove([entry.id]) : undefined}
          onSwipeFocus={canFocus ? () => startFocus([entry.id]) : undefined}
          onSwipeDelete={ruleEntryIds?.has(entry.id) ? undefined : () => deleteLines([entry.id])}
          onDragStart={() => startDrag(entry.id, index)}
          onDragUpdate={(translationY) => updateDrag(index, translationY)}
          onDragEnd={() => endDrag(entry.id, index)}
        />
      ))}

      {visibleEntries.length === 0 && (
        <Text style={styles.empty}>{entries.length > 0 ? "Everything here is done." : emptyText}</Text>
      )}

      {hiddenCount > 0 && (
        <Pressable accessibilityRole="button" onPress={() => updateSettings({ completedMode: "bottom" })}>
          <Text style={styles.hiddenNote}>
            {hiddenCount} completed {hiddenCount === 1 ? "item" : "items"} hidden · Show
          </Text>
        </Pressable>
      )}

      {canEdit && !selecting && (
        <Pressable
          accessible={false}
          onPress={() => focusLine(ADD_ROW_ID)}
          style={styles.addRow}
        >
          <Plus size={18} color={colors.muted} />
          <TextInput
            ref={(input) => registerInput(ADD_ROW_ID, input)}
            accessibilityLabel="Add an item to this list"
            accessibilityHint="Press return for the next line. Pasting several lines adds them all."
            value={draft}
            onChangeText={changeAddDraft}
            onFocus={() => {
              setDatesOpen(false);
              setFocusedId(ADD_ROW_ID);
            }}
            onBlur={() => {
              commitAddDraft();
              setFocusedId((current) => (current === ADD_ROW_ID ? null : current));
            }}
            placeholder="New item"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            inputAccessoryViewID={KEYBOARD_BAR_ID}
            style={styles.addInput}
          />
        </Pressable>
      )}
      {focusedId === ADD_ROW_ID && inlineBar}

      {!!toast && (
        <View accessibilityLiveRegion="polite" style={styles.toast}>
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

      <ChoiceSheet
        visible={sheet === "sort"}
        title="Sort by"
        options={sortOptions}
        selectedValue={settings.sortMode}
        onSelect={(sortMode) => updateSettings({ sortMode })}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "completed"}
        title="Completed items"
        options={completedOptions}
        selectedValue={settings.completedMode}
        onSelect={(completedMode) => updateSettings({ completedMode })}
        onClose={() => setSheet(null)}
      />
      {canMove && (
        <MoveToListSheet
          visible={!!moveIds}
          subject={moveSubject}
          targets={moveTargets ?? []}
          recentIds={recentTargets}
          onMove={finishMove}
          onClose={() => setMoveIds(null)}
        />
      )}
      {canFocus && (
        <ChoiceSheet<string>
          visible={!!focusPickIds}
          title="Focus list"
          options={(focusLists ?? []).map((focusList) => ({
            value: focusList.id,
            label: focusList.title,
            detail:
              focusPickIds?.length === 1 && focusMembership?.[focusPickIds[0]]?.includes(focusList.id)
                ? "Already in it. Tap to take it out"
                : undefined,
          }))}
          selectedValue=""
          onSelect={(focusListId) => {
            const ids = focusPickIds ?? [];
            setFocusPickIds(null);
            applyFocus(ids, focusListId);
          }}
          onClose={() => setFocusPickIds(null)}
        />
      )}
      <ListEntrySheet
        entry={openEntry}
        priorityOptions={priorityOptions}
        canEdit={canEdit}
        sourceListTitle={openEntry ? referenceSources?.[openEntry.id] : undefined}
        fromRule={!!openEntry && !!ruleEntryIds?.has(openEntry.id)}
        focusLists={openEntry && onToggleFocusList ? focusLists : undefined}
        selectedFocusListIds={openEntry ? focusMembership?.[openEntry.id] ?? [] : []}
        onToggleFocusList={(focusListId) => {
          if (openEntry) onToggleFocusList?.(openEntry.id, focusListId);
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
};

type EntryRowProps = {
  entry: ListEntry;
  index: number;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  priority?: TagOption;
  caption?: string;
  showIndent: boolean;
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
  belowRow?: ReactNode;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onSwipeMove?: () => void;
  onSwipeFocus?: () => void;
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
  showIndent,
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
  belowRow,
  selecting,
  selected,
  onToggleSelect,
  onSwipeMove,
  onSwipeFocus,
  onSwipeDelete,
}: EntryRowProps) => {
  const dragY = useSharedValue(0);
  const [draft, setDraft] = useState(entry.text);
  const focusedRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow changes from elsewhere (sync, the details sheet) unless typing.
  useEffect(() => {
    if (!focusedRef.current) setDraft(entry.text);
  }, [entry.text]);

  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  const commit = (text: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const trimmed = text.trim();
    if (trimmed) onCommitText(trimmed);
  };

  const changeText = (next: string) => {
    if (/[\r\n]/.test(next)) {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      setDraft(onSplit(draft, next).trim());
      return;
    }
    setDraft(next);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commit(next), COMMIT_DELAY_MS);
  };
  const swipeRef = useRef<SwipeableMethods>(null);
  const due = entry.dueDate ? describeDueDate(entry.dueDate) : null;
  // Swipe right checks a checklist line off (or back on); swipe left shows
  // Move, Focus and Delete.
  const canSwipeRight = entry.kind === "check";
  const hasSwipeActions = !!onSwipeMove || !!onSwipeFocus || !!onSwipeDelete;
  const canSwipe = canEdit && !isDragging && !selecting && (canSwipeRight || hasSwipeActions);
  // A long press on the checkbox starts a drag; its tap must not also toggle.
  const lastDragAt = useRef(0);
  const markDrag = useCallback(() => {
    lastDragAt.current = Date.now();
  }, []);
  const toggleUnlessDragged = () => {
    if (Date.now() - lastDragAt.current > 500) onToggle();
  };

  const makeDragGesture = (longPress: boolean) => {
    const pan = Gesture.Pan();
    if (longPress) pan.activateAfterLongPress(250);
    else pan.activeOffsetY([-6, 6]);
    return pan
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
        });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dragGesture = useMemo(() => makeDragGesture(false), [dragY, onDragEnd, onDragStart, onDragUpdate]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const holdGesture = useMemo(() => makeDragGesture(true), [dragY, onDragEnd, onDragStart, onDragUpdate, markDrag]);

  const animatedStyle = useAnimatedStyle(() => {
    if (isDragging) return { transform: [{ translateY: dragY.value }], zIndex: 10, opacity: 0.92 };
    return { transform: [{ translateY: withTiming(shift, { duration: 140 }) }], zIndex: 0, opacity: 1 };
  }, [isDragging, shift]);

  const hasMeta = !!due || !!priority || !!entry.notes;

  const row = (
    <Animated.View
      style={[styles.row, isDragging && styles.rowDragging, animatedStyle]}
      onLayout={(event) => onLayoutHeight(event.nativeEvent.layout.height)}
    >
      {canReorder && !selecting && (
        <GestureDetector gesture={dragGesture}>
          <View accessibilityLabel="Drag to reorder" style={styles.handle}>
            <GripVertical size={16} color={colors.muted} />
          </View>
        </GestureDetector>
      )}
      <View style={[styles.rowContent, showIndent && { marginLeft: Math.min(entry.indentLevel, 3) * spacing.lg }]}>
        {selecting ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`Select ${entry.text}`}
            accessibilityState={{ checked: selected }}
            onPress={onToggleSelect}
            style={styles.checkbox}
          >
            {selected ? <CircleCheck size={22} color={colors.accentDark} /> : <Circle size={22} color={colors.muted} />}
          </Pressable>
        ) : entry.kind === "check" ? (
          <GestureDetector gesture={canReorder ? holdGesture : Gesture.Tap().enabled(false)}>
            <Pressable
              accessibilityLabel={entry.checked ? "Mark checklist item incomplete" : "Mark checklist item complete"}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: entry.checked }}
              accessibilityHint={canReorder ? "Hold to drag the line" : undefined}
              onPress={toggleUnlessDragged}
              style={({ pressed }) => [styles.checkbox, pressed && styles.checkboxPressed]}
            >
              <Text style={styles.marker}>{entry.checked ? "☑" : "☐"}</Text>
            </Pressable>
          </GestureDetector>
        ) : (
          <GestureDetector gesture={canReorder ? holdGesture : Gesture.Tap().enabled(false)}>
            <View accessibilityHint={canReorder ? "Hold to drag the line" : undefined}>
              <Text style={[styles.marker, styles.bullet]}>{bulletGlyphForIndent(entry.indentLevel)}</Text>
            </View>
          </GestureDetector>
        )}
        <View style={styles.textBlock}>
          {selecting ? (
            <Pressable accessibilityRole="button" accessibilityLabel={entry.text} onPress={onToggleSelect}>
              <Text style={[styles.text, entry.checked && styles.textDone]}>{entry.text}</Text>
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
                  setDraft(entry.text);
                  onBlurEmpty();
                }
                onBlurLine();
              }}
              onKeyPress={(event) => {
                if (event.nativeEvent.key === "Backspace" && draft === "") onBackspaceEmpty();
              }}
              multiline
              scrollEnabled={false}
              inputAccessoryViewID={KEYBOARD_BAR_ID}
              placeholder="New item"
              placeholderTextColor={colors.muted}
              style={[styles.text, styles.textInput, entry.checked && styles.textDone]}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={entry.text}
              accessibilityHint={hasMeta ? "Shows due date, priority and notes" : undefined}
              disabled={!hasMeta}
              onPress={onOpen}
            >
              <Text style={[styles.text, entry.checked && styles.textDone]}>{entry.text}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Details for ${entry.text}`}
            disabled={!hasMeta && !caption}
            onPress={onOpen}
          >
          {!!caption && (
            <View style={styles.metaItem}>
              <ListChecks size={12} color={colors.muted} />
              <Text numberOfLines={1} style={styles.metaText}>
                {caption}
              </Text>
            </View>
          )}
          {hasMeta && (
            <View style={styles.metaRow}>
              {!!due && (
                <View style={styles.metaItem}>
                  <CalendarDays size={12} color={dueToneColor(due.tone, colors)} />
                  <Text style={[styles.metaText, { color: dueToneColor(due.tone, colors) }]}>{due.label}</Text>
                </View>
              )}
              {!!priority && (
                <View style={[styles.priorityPill, { borderColor: priority.color ?? colors.border }]}>
                  <View style={[styles.priorityDot, { backgroundColor: priority.color ?? colors.muted }]} />
                  <Text style={styles.metaText}>{priority.name}</Text>
                </View>
              )}
              {!!entry.notes && (
                <Text numberOfLines={1} style={[styles.metaText, styles.notes]}>
                  {entry.notes}
                </Text>
              )}
            </View>
          )}
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );

  if (!canSwipe) return belowRow ? <>{row}{belowRow}</> : row;

  const swipeable = (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.5}
      leftThreshold={56}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        canSwipeRight
          ? () => (
              <View style={[styles.swipeAction, entry.checked && styles.swipeActionUndo]}>
                {entry.checked ? <Undo2 size={18} color={colors.onAccent} /> : <Check size={18} color={colors.onAccent} />}
                <Text style={styles.swipeActionText}>{entry.checked ? "Undo" : "Check off"}</Text>
              </View>
            )
          : undefined
      }
      renderRightActions={
        hasSwipeActions
          ? () => (
              <View style={styles.swipeButtons}>
                {!!onSwipeMove && (
                  <SwipeButton
                    label="Move"
                    icon={<FolderInput size={18} color={colors.onAccent} />}
                    tone={colors.blue}
                    onPress={() => {
                      swipeRef.current?.close();
                      onSwipeMove();
                    }}
                    styles={styles}
                  />
                )}
                {!!onSwipeFocus && (
                  <SwipeButton
                    label="Focus"
                    icon={<Star size={18} color={colors.onAccent} />}
                    tone={colors.accentDark}
                    onPress={() => {
                      swipeRef.current?.close();
                      onSwipeFocus();
                    }}
                    styles={styles}
                  />
                )}
                {!!onSwipeDelete && (
                  <SwipeButton
                    label="Delete"
                    icon={<Trash2 size={18} color={colors.onAccent} />}
                    tone={colors.danger}
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
  return belowRow ? <>{swipeable}{belowRow}</> : swipeable;
};

const SwipeButton = ({
  label,
  icon,
  tone,
  onPress,
  styles,
}: {
  label: string;
  icon: ReactNode;
  tone: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.swipeButton, { backgroundColor: tone }, pressed && styles.barButtonDim]}
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
      selected && styles.barButtonSelected,
      (pressed || disabled) && styles.barButtonDim,
    ]}
  >
    {icon}
    {!!label && <Text style={[styles.barButtonText, strong && styles.barButtonStrong]}>{label}</Text>}
  </Pressable>
);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    block: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    toolbar: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    chip: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 32,
      paddingHorizontal: 12,
    },
    chipPressed: {
      opacity: 0.7,
    },
    chipText: {
      color: colors.accentDark,
      fontSize: 13,
      fontWeight: "800",
    },
    count: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      marginLeft: "auto",
    },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      flexDirection: "row",
      paddingVertical: 2,
    },
    rowDragging: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    handle: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      width: 24,
    },
    rowContent: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: spacing.xs,
    },
    checkbox: {
      alignItems: "center",
      borderRadius: 10,
      justifyContent: "center",
      minHeight: 44,
      width: 44,
    },
    checkboxPressed: {
      backgroundColor: colors.background,
      opacity: 0.72,
    },
    marker: {
      color: colors.accentDark,
      fontSize: 24,
      fontWeight: "900",
      width: 30,
    },
    bullet: {
      fontSize: 16,
      textAlign: "center",
    },
    textBlock: {
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingVertical: 4,
    },
    text: {
      color: colors.ink,
      fontSize: 16,
      lineHeight: 23,
    },
    textDone: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    swipeAction: {
      alignItems: "center",
      backgroundColor: colors.accentDark,
      borderRadius: 12,
      flexDirection: "row",
      gap: 6,
      justifyContent: "flex-start",
      marginVertical: 2,
      paddingHorizontal: spacing.md,
      width: 120,
    },
    swipeActionUndo: {
      backgroundColor: colors.muted,
    },
    swipeActionText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "800",
    },
    metaRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginTop: 2,
    },
    metaItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    metaText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    notes: {
      flexShrink: 1,
      fontWeight: "500",
    },
    priorityPill: {
      alignItems: "center",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    priorityDot: {
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    empty: {
      color: colors.muted,
      paddingVertical: spacing.sm,
    },
    hiddenNote: {
      color: colors.accentDark,
      fontSize: 13,
      fontWeight: "700",
      paddingVertical: spacing.sm,
    },
    addRow: {
      alignItems: "center",
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingLeft: 12,
      paddingTop: spacing.xs,
    },
    addInput: {
      color: colors.ink,
      flex: 1,
      fontSize: 16,
      minHeight: 44,
    },
    swipeButtons: {
      flexDirection: "row",
      gap: 4,
      marginLeft: 4,
      marginVertical: 2,
    },
    swipeButton: {
      alignItems: "center",
      borderRadius: 12,
      justifyContent: "center",
      minWidth: 64,
      paddingHorizontal: spacing.xs,
    },
    swipeButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 2,
    },
    selectBar: {
      gap: 4,
      marginBottom: spacing.sm,
    },
    selectCount: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "800",
    },
    selectActions: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 2,
    },
    textInput: {
      margin: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    bar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing.xs,
      paddingVertical: 6,
    },
    barRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    barSpacer: {
      flex: 1,
    },
    barButton: {
      alignItems: "center",
      borderRadius: 10,
      flexDirection: "row",
      gap: 4,
      minHeight: 36,
      minWidth: 36,
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    barButtonSelected: {
      backgroundColor: colors.background,
    },
    barButtonDim: {
      opacity: 0.45,
    },
    barButtonText: {
      color: colors.accentDark,
      fontSize: 14,
      fontWeight: "700",
    },
    barButtonStrong: {
      fontWeight: "900",
    },
    toast: {
      alignItems: "center",
      backgroundColor: colors.ink,
      borderRadius: 12,
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between",
      marginTop: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    toastText: {
      color: colors.background,
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "700",
    },
    toastAction: {
      color: colors.background,
      fontSize: 14,
      fontWeight: "900",
      textDecorationLine: "underline",
    },
  });
