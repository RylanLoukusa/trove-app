import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Eraser, ListPlus, Sparkles } from "lucide-react-native";

import { ChoiceSheet } from "./ChoiceSheet";
import { FocusListPicker, FocusPickerList } from "./FocusListPicker";
import { ListEntriesView } from "./ListEntriesView";
import { useTrove } from "../storage/storage";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { FocusRule, ListEntry, SavedItem } from "../types/models";
import {
  focusReferenceId,
  generatePositionBetween,
  generatePositionsBetween,
  isFocusList,
  legacyEntryPosition,
  resolveEntries,
  sortEntries,
} from "../utils/listEntries";
import { focusRuleLabels, matchesFocusRule, priorityOptionsFor } from "../utils/listView";

type Props = { item: SavedItem };

type ClearChoice = "done" | "all";
const clearOptions: Array<{ value: ClearChoice; label: string; detail: string }> = [
  { value: "done", label: "Clear done items", detail: "Takes finished lines off this list" },
  { value: "all", label: "Clear everything", detail: "Start this list fresh" },
];

type RuleChoice = FocusRule | "none";
const ruleOptions: Array<{ value: RuleChoice; label: string; detail?: string }> = [
  { value: "none", label: "No rule", detail: "Only lines you add yourself" },
  ...(Object.keys(focusRuleLabels) as FocusRule[]).map((value) => ({
    value,
    label: focusRuleLabels[value],
    detail: "Pulls in matching lines from all your lists",
  })),
];

// The lines of a list item, for both regular and focus lists. A focus list's
// lines from other lists are edited in place but stay in their own list.
export const ListSection = ({ item }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    listEntries,
    tagGroups,
    tagOptions,
    updateItem,
    updateListEntry,
    createListEntry,
    moveListEntry,
    deleteListEntry,
    addToFocusList,
    positionListEntry,
    removeFromFocusList,
    clearFocusList,
    canEditItem,
  } = useTrove();
  const isFocus = isFocusList(item);
  const canEdit = canEditItem(item.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const rule = isFocus ? item.focusRule : undefined;

  const allEntries = listEntries ?? [];
  const entriesById = useMemo(() => new Map(allEntries.map((entry) => [entry.id, entry])), [allEntries]);
  const itemsById = useMemo(() => new Map(items.map((candidate) => [candidate.id, candidate])), [items]);
  const priorityOptions = useMemo(() => priorityOptionsFor(tagGroups, tagOptions), [tagGroups, tagOptions]);

  // This list's own records (references unresolved), in order.
  const rawEntries = useMemo(() => {
    if (!listEntries) {
      return (item.listItems ?? []).map<ListEntry>((line, index) => ({
        id: line.id,
        listId: item.id,
        kind: line.kind,
        text: line.text,
        checked: !!line.checked,
        indentLevel: line.indentLevel ?? 0,
        position: legacyEntryPosition(index),
        tagOptionIds: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    }
    return sortEntries(listEntries.filter((entry) => entry.listId === item.id));
  }, [item, listEntries]);

  const pinnedEntries = useMemo(
    () => (isFocus ? resolveEntries(rawEntries, entriesById) : rawEntries),
    [entriesById, isFocus, rawEntries],
  );

  // Lines a smart focus list's rule pulls in that aren't already on it. They
  // follow the list's own lines, soonest due first, and aren't stored: drag
  // one to pin it in place.
  const autoEntries = useMemo<ListEntry[]>(() => {
    if (!rule) return [];
    const pinned = new Set(rawEntries.map((entry) => entry.refEntryId).filter(Boolean));
    const matches = sortEntries(
      allEntries.filter((entry) => {
        if (entry.refEntryId || pinned.has(entry.id)) return false;
        const list = itemsById.get(entry.listId);
        return !!list && list.type === "list" && !isFocusList(list) && matchesFocusRule(entry, rule, priorityOptions);
      }),
    ).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const lastPosition = rawEntries[rawEntries.length - 1]?.position ?? null;
    const positions = generatePositionsBetween(lastPosition, null, matches.length);
    return matches.map((source, index) => ({
      ...source,
      id: focusReferenceId(item.id, source.id),
      listId: item.id,
      position: positions[index],
      indentLevel: 0,
      refEntryId: source.id,
    }));
  }, [allEntries, item.id, itemsById, priorityOptions, rawEntries, rule]);

  const autoIds = useMemo(() => new Set(autoEntries.map((entry) => entry.id)), [autoEntries]);
  const entries = useMemo(() => [...pinnedEntries, ...autoEntries], [autoEntries, pinnedEntries]);

  // For a focus list: shown line id -> the original line it stands for.
  const targetIds = useMemo(() => {
    const targets = new Map<string, string>();
    [...rawEntries, ...autoEntries].forEach((entry) => {
      if (entry.refEntryId) targets.set(entry.id, entry.refEntryId);
    });
    return targets;
  }, [autoEntries, rawEntries]);
  const targetOf = useCallback((entryId: string) => targetIds.get(entryId) ?? entryId, [targetIds]);

  const referenceSources = useMemo(() => {
    if (!isFocus) return undefined;
    const sources: Record<string, string> = {};
    targetIds.forEach((sourceId, viewId) => {
      const source = entriesById.get(sourceId);
      const list = source ? itemsById.get(source.listId) : undefined;
      if (list) sources[viewId] = list.title;
    });
    return sources;
  }, [entriesById, isFocus, itemsById, targetIds]);

  const focusLists = useMemo(
    () => (isFocus ? [] : items.filter((candidate) => isFocusList(candidate) && canEditItem(candidate.id))),
    [canEditItem, isFocus, items],
  );

  // For a regular list: line id -> focus lists it's in.
  const focusMembership = useMemo(() => {
    if (isFocus) return undefined;
    const focusIds = new Set(items.filter(isFocusList).map((candidate) => candidate.id));
    const membership: Record<string, string[]> = {};
    allEntries.forEach((entry) => {
      if (!entry.refEntryId || !focusIds.has(entry.listId)) return;
      (membership[entry.refEntryId] ??= []).push(entry.listId);
    });
    return membership;
  }, [allEntries, isFocus, items]);

  const captions = useMemo(() => {
    if (isFocus) return referenceSources;
    const result: Record<string, string> = {};
    Object.entries(focusMembership ?? {}).forEach(([entryId, focusIds]) => {
      const titles = focusIds.map((focusId) => itemsById.get(focusId)?.title).filter(Boolean);
      if (titles.length) result[entryId] = `In ${titles.join(", ")}`;
    });
    return result;
  }, [focusMembership, isFocus, itemsById, referenceSources]);

  const pickerLists = useMemo<FocusPickerList[]>(() => {
    if (!isFocus) return [];
    return items
      .filter((candidate) => candidate.type === "list" && !isFocusList(candidate) && candidate.id !== item.id)
      .map((list) => ({
        id: list.id,
        title: list.title,
        entries: sortEntries(allEntries.filter((entry) => entry.listId === list.id && !entry.refEntryId)),
      }))
      .filter((list) => list.entries.length > 0);
  }, [allEntries, isFocus, item.id, items]);

  const selectedSourceIds = useMemo(
    () => new Set(rawEntries.map((entry) => entry.refEntryId).filter((id): id is string => !!id)),
    [rawEntries],
  );

  // In a focus list, moves are worked out from what's on screen, since lines
  // a rule pulled in have no stored position until they're pinned.
  const onMoveFocusEntry = useCallback(
    (entryId: string, afterId: string | null, beforeId: string | null) => {
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const lower = afterId ? byId.get(afterId)?.position ?? null : null;
      let upper = beforeId ? byId.get(beforeId)?.position ?? null : null;
      if (lower !== null && upper !== null && lower >= upper) upper = null;
      const position = generatePositionBetween(lower, upper);
      const sourceId = targetIds.get(entryId);
      if (autoIds.has(entryId) && sourceId) addToFocusList(item.id, [sourceId], position);
      else positionListEntry(entryId, position);
    },
    [addToFocusList, autoIds, entries, item.id, positionListEntry, targetIds],
  );

  const onToggleEntry = useCallback(
    (entry: ListEntry) => {
      if (entry.kind !== "check") return;
      const targetId = targetOf(entry.id);
      const targetListId = targetIds.has(entry.id) ? entriesById.get(targetId)?.listId : item.id;
      if (!targetListId || !canEditItem(targetListId)) return;
      updateListEntry(targetId, { checked: !entry.checked });
    },
    [canEditItem, entriesById, item.id, targetIds, targetOf, updateListEntry],
  );

  const onClear = (which: ClearChoice) => {
    setClearOpen(false);
    if (which === "done") {
      clearFocusList(item.id, "done");
      return;
    }
    Alert.alert(
      `Clear ${item.title}?`,
      "Lines from your other lists stay in those lists. Lines added only here are deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => clearFocusList(item.id, "all") },
      ],
    );
  };

  const focusActions = isFocus && (canEdit || !!rule) && (
    <View style={styles.focusActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rule ? `Rule: ${focusRuleLabels[rule]}` : "Add a rule"}
        disabled={!canEdit}
        onPress={() => setRuleOpen(true)}
        style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
      >
        <Sparkles size={16} color={colors.accentDark} />
        <Text style={styles.clearButtonText}>{rule ? focusRuleLabels[rule] : "Add a rule"}</Text>
      </Pressable>
      {canEdit && (
      <Pressable
        accessibilityRole="button"
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.focusButton, pressed && styles.pressed]}
      >
        <ListPlus size={16} color={colors.onAccent} />
        <Text style={styles.focusButtonText}>Add from lists</Text>
      </Pressable>
      )}
      {canEdit && pinnedEntries.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear this list"
          onPress={() => setClearOpen(true)}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
        >
          <Eraser size={16} color={colors.accentDark} />
          <Text style={styles.clearButtonText}>Clear</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <>
      <ListEntriesView
        listId={item.id}
        entries={entries}
        priorityOptions={priorityOptions}
        canEdit={canEdit}
        onToggleEntry={onToggleEntry}
        onUpdateEntry={(entryId, updates) => updateListEntry(targetOf(entryId), updates)}
        onMoveEntry={isFocus ? onMoveFocusEntry : moveListEntry}
        onAddEntry={(text) => createListEntry(item.id, { text })}
        onDeleteEntry={(entryId) => {
          if (autoIds.has(entryId)) return;
          if (targetIds.has(entryId)) removeFromFocusList(item.id, entryId);
          else deleteListEntry(entryId);
        }}
        captions={captions}
        referenceSources={referenceSources}
        ruleEntryIds={autoIds}
        focusLists={focusLists.map((focusList) => ({ id: focusList.id, title: focusList.title }))}
        focusMembership={focusMembership}
        onToggleFocusList={
          focusLists.length
            ? (entryId, focusListId) => {
                if (focusMembership?.[entryId]?.includes(focusListId)) removeFromFocusList(focusListId, entryId);
                else addToFocusList(focusListId, [entryId]);
              }
            : undefined
        }
        headerAccessory={focusActions || undefined}
        emptyText={
          isFocus
            ? rule
              ? "Nothing matches this list's rule right now."
              : "Add lines from your other lists, or type one below."
            : undefined
        }
      />
      {isFocus && (
        <>
          <FocusListPicker
            visible={pickerOpen}
            focusListTitle={item.title}
            lists={pickerLists}
            selectedEntryIds={selectedSourceIds}
            onToggle={(entry) => {
              if (selectedSourceIds.has(entry.id)) removeFromFocusList(item.id, entry.id);
              else addToFocusList(item.id, [entry.id]);
            }}
            onClose={() => setPickerOpen(false)}
          />
          <ChoiceSheet<ClearChoice | "">
            visible={clearOpen}
            title={`Clear ${item.title}`}
            options={clearOptions}
            selectedValue=""
            onSelect={(value) => {
              if (value) onClear(value);
            }}
            onClose={() => setClearOpen(false)}
          />
          <ChoiceSheet<RuleChoice>
            visible={ruleOpen}
            title="Pull in lines automatically"
            options={ruleOptions}
            selectedValue={rule ?? "none"}
            onSelect={(value) => {
              setRuleOpen(false);
              updateItem(item.id, { focusRule: value === "none" ? undefined : value });
            }}
            onClose={() => setRuleOpen(false)}
          />
        </>
      )}
    </>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    focusActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    focusButton: {
      alignItems: "center",
      backgroundColor: colors.buttonPrimaryBg,
      borderRadius: 999,
      flexDirection: "row",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
    },
    focusButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "800",
    },
    clearButton: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
    },
    clearButtonText: {
      color: colors.accentDark,
      fontSize: 14,
      fontWeight: "800",
    },
    pressed: {
      opacity: 0.7,
    },
  });
