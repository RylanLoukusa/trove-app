import React, { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ArrowUpDown, CalendarDays, Check, CheckCheck, GripVertical, ListChecks, Plus, Undo2 } from "lucide-react-native";

import { ChoiceSheet } from "./ChoiceSheet";
import { FocusListChoice, ListEntrySheet } from "./ListEntrySheet";
import { useListViewSettings } from "../storage/listViewSettings";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { ListEntry, TagOption } from "../types/models";
import { bulletGlyphForIndent } from "../utils/itemTypes";
import {
  CompletedMode,
  completedModeLabels,
  describeDueDate,
  DueTone,
  entryPriority,
  ListSortMode,
  listSortLabels,
  orderEntriesForView,
} from "../utils/listView";

type Props = {
  listId: string;
  entries: ListEntry[];
  priorityOptions: TagOption[];
  canEdit: boolean;
  onToggleEntry: (entry: ListEntry) => void;
  onUpdateEntry: (entryId: string, updates: Partial<Pick<ListEntry, "text" | "dueDate" | "notes" | "tagOptionIds">>) => void;
  onMoveEntry: (entryId: string, afterEntryId: string | null, beforeEntryId: string | null) => void;
  onAddEntry: (text: string) => void;
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
  headerAccessory?: ReactNode;
  emptyText?: string;
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
  onAddEntry,
  onDeleteEntry,
  captions,
  referenceSources,
  ruleEntryIds,
  focusLists,
  focusMembership,
  onToggleFocusList,
  headerAccessory,
  emptyText = "Nothing on this list yet.",
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
  const canReorder = canEdit && settings.sortMode === "manual";

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
    },
    [onMoveEntry, visibleEntries],
  );

  const draggingHeight = dragging ? heightsRef.current[dragging.id] ?? 56 : 0;
  const shiftFor = (index: number): number => {
    if (!dragging || index === dragging.startIndex) return 0;
    if (dragging.startIndex < overIndex && index > dragging.startIndex && index <= overIndex) return -draggingHeight;
    if (dragging.startIndex > overIndex && index >= overIndex && index < dragging.startIndex) return draggingHeight;
    return 0;
  };

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onAddEntry(text);
    setDraft("");
  };

  const openEntry = entries.find((entry) => entry.id === openEntryId) ?? null;

  return (
    <View style={styles.block}>
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
        {doneCount > 0 && (
          <Text style={styles.count}>
            {doneCount} of {entries.length} done
          </Text>
        )}
      </View>
      {headerAccessory}

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

      {canEdit && (
        <View style={styles.addRow}>
          <Plus size={18} color={colors.muted} />
          <TextInput
            accessibilityLabel="Add an item to this list"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitDraft}
            placeholder="Add an item"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            blurOnSubmit={false}
            style={styles.addInput}
          />
          {!!draft.trim() && (
            <Pressable accessibilityRole="button" accessibilityLabel="Add item" hitSlop={8} onPress={submitDraft}>
              <Text style={styles.addButton}>Add</Text>
            </Pressable>
          )}
        </View>
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
}: EntryRowProps) => {
  const dragY = useSharedValue(0);
  const swipeRef = useRef<SwipeableMethods>(null);
  const due = entry.dueDate ? describeDueDate(entry.dueDate) : null;
  // Swiping a checklist line to the right checks it off (or back on).
  const canSwipe = canEdit && entry.kind === "check" && !isDragging;

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
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
          runOnJS(onDragEnd)();
        }),
    [dragY, onDragEnd, onDragStart, onDragUpdate],
  );

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
      {canReorder && (
        <GestureDetector gesture={dragGesture}>
          <View accessibilityLabel="Drag to reorder" style={styles.handle}>
            <GripVertical size={16} color={colors.muted} />
          </View>
        </GestureDetector>
      )}
      <View style={[styles.rowContent, showIndent && { marginLeft: Math.min(entry.indentLevel, 3) * spacing.lg }]}>
        {entry.kind === "check" ? (
          <Pressable
            accessibilityLabel={entry.checked ? "Mark checklist item incomplete" : "Mark checklist item complete"}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: entry.checked }}
            onPress={onToggle}
            style={({ pressed }) => [styles.checkbox, pressed && styles.checkboxPressed]}
          >
            <Text style={styles.marker}>{entry.checked ? "☑" : "☐"}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.marker, styles.bullet]}>{bulletGlyphForIndent(entry.indentLevel)}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canEdit ? `Edit ${entry.text}` : entry.text}
          accessibilityHint={canEdit ? "Opens due date, priority and notes" : undefined}
          disabled={!canEdit && !hasMeta}
          onPress={onOpen}
          style={styles.textBlock}
        >
          <Text style={[styles.text, entry.checked && styles.textDone]}>{entry.text}</Text>
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
    </Animated.View>
  );

  if (!canSwipe) return row;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.5}
      leftThreshold={56}
      overshootLeft={false}
      renderLeftActions={() => (
        <View style={[styles.swipeAction, entry.checked && styles.swipeActionUndo]}>
          {entry.checked ? <Undo2 size={18} color={colors.onAccent} /> : <Check size={18} color={colors.onAccent} />}
          <Text style={styles.swipeActionText}>{entry.checked ? "Undo" : "Check off"}</Text>
        </View>
      )}
      onSwipeableOpen={() => {
        onToggle();
        swipeRef.current?.close();
      }}
    >
      {row}
    </ReanimatedSwipeable>
  );
};

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
    addButton: {
      color: colors.accentDark,
      fontSize: 15,
      fontWeight: "800",
    },
  });
