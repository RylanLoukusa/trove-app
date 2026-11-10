import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ArrowUpDown,
  CheckCheck,
  CircleCheck,
  Ellipsis,
  Eraser,
  FolderInput,
  ListPlus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react-native";

import { ChoiceSheet } from "../../components/ChoiceSheet";
import { CommentThread } from "../../components/CommentThread";
import { FocusListPicker, FocusPickerList } from "../../components/FocusListPicker";
import { FolderTreeBrowserModal } from "../../components/FolderTreeBrowserModal";
import { EntryUpdates, ListEntriesView, ListEntriesViewHandle, NewLine } from "../../components/ListEntriesView";
import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar, NavIconButton, NavTextButton } from "../../components/NavBar";
import type { ListTarget } from "../../components/SendToListSheet";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import type { RootStackParamList } from "../../navigation/types";
import { useListViewSettings } from "../../storage/listViewSettings";
import { useTrove } from "../../storage/storage";
import { spacing, ThemeColors } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import type { FocusRule, ListEntry, SavedItem } from "../../types/models";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { getFolderPathLabel } from "../../utils/folderTree";
import {
  canListBorrowLines,
  focusReferenceId,
  generatePositionBetween,
  generatePositionsBetween,
  isFocusList,
  isUntitledList,
  legacyEntryPosition,
  listDisplayTitle,
  listIdsLendingLines,
  listItemKindFromSnapshot,
  resolveEntries,
  sortEntries,
  UNTITLED_LIST_TITLE,
} from "../../utils/listEntries";
import {
  CompletedMode,
  completedModeLabels,
  focusRuleLabels,
  ListSortMode,
  listSortLabels,
  matchesFocusRule,
  priorityOptionsFor,
} from "../../utils/listView";

type Props = {
  item: SavedItem;
  navigation: NativeStackNavigationProp<RootStackParamList, "List">;
  // Just created: the cursor starts in the title.
  isNew?: boolean;
};

type RuleChoice = FocusRule | "none";
const ruleOptions: Array<{ value: RuleChoice; label: string; detail?: string }> = [
  { value: "none", label: "Off", detail: "Only lines you add yourself" },
  ...(Object.keys(focusRuleLabels) as FocusRule[]).map((value) => ({
    value,
    label: focusRuleLabels[value],
    detail: "Pulls in matching lines from all your lists",
  })),
];

const sortOptions = (Object.keys(listSortLabels) as ListSortMode[]).map((value) => ({ value, label: listSortLabels[value] }));
const completedOptions = (Object.keys(completedModeLabels) as CompletedMode[]).map((value) => ({
  value,
  label: completedModeLabels[value],
}));

const HOME_LABEL = "Trove";

// One list: its title and its lines on a single page. A line pulled in from
// another list is edited in place but stays in its own list.
export const ListPage = ({ item, navigation, isNew = false }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    folders,
    items,
    listEntries,
    tagGroups,
    tagOptions,
    updateItem,
    deleteItem,
    updateListEntry,
    setEntriesChecked,
    insertListEntries,
    relocateListEntries,
    restoreListEntries,
    moveListEntry,
    deleteListEntry,
    addToFocusList,
    positionListEntry,
    removeFromFocusList,
    canEditItem,
  } = useTrove();
  const isFocus = isFocusList(item);
  const canEdit = canEditItem(item.id);
  const rule = isFocus ? item.focusRule : undefined;
  const viewRef = useRef<ListEntriesViewHandle>(null);
  const [settings, updateSettings] = useListViewSettings(item.id);
  const [selecting, setSelecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<"sort" | "completed" | "rule" | "pull" | "folder" | null>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const { isShared: isFolderSharedByOwner } = useFolderShareStatus(item.folderId || undefined);
  const showComments = isSharedAccess(item) || isFolderSharedByOwner;

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // --- The lines -----------------------------------------------------------
  const allEntries = useMemo(() => listEntries ?? [], [listEntries]);
  const entriesById = useMemo(() => new Map(allEntries.map((entry) => [entry.id, entry])), [allEntries]);
  const entriesByIdRef = useRef(entriesById);
  entriesByIdRef.current = entriesById;
  const itemsById = useMemo(() => new Map(items.map((candidate) => [candidate.id, candidate])), [items]);
  const priorityOptions = useMemo(() => priorityOptionsFor(tagGroups, tagOptions), [tagGroups, tagOptions]);
  const titleOf = useCallback((list: SavedItem) => listDisplayTitle(list, list.listItems), []);

  // This list's own records (lines from other lists not yet resolved), in order.
  const rawEntries = useMemo(() => {
    if (!listEntries) {
      return (item.listItems ?? []).map<ListEntry>((line, index) => ({
        id: line.id,
        listId: item.id,
        kind: listItemKindFromSnapshot(line),
        text: line.text,
        checked: !!line.checked,
        indentLevel: line.indentLevel ?? 0,
        ...(line.bold ? { bold: true } : {}),
        position: legacyEntryPosition(index),
        tagOptionIds: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    }
    return sortEntries(listEntries.filter((entry) => entry.listId === item.id));
  }, [item, listEntries]);

  const pinnedEntries = useMemo(
    () => (rawEntries.some((entry) => entry.refEntryId) ? resolveEntries(rawEntries, entriesById) : rawEntries),
    [entriesById, rawEntries],
  );

  // Lines the list's rule pulls in that aren't already on it. They follow the
  // list's own lines, soonest due first, and aren't stored: drag one to pin
  // it in place.
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

  // Shown line id -> the original line it stands for (lines from other lists).
  const targetIds = useMemo(() => {
    const targets = new Map<string, string>();
    [...rawEntries, ...autoEntries].forEach((entry) => {
      if (entry.refEntryId) targets.set(entry.id, entry.refEntryId);
    });
    return targets;
  }, [autoEntries, rawEntries]);
  const targetIdsRef = useRef(targetIds);
  targetIdsRef.current = targetIds;
  const targetOf = useCallback((entryId: string) => targetIdsRef.current.get(entryId) ?? entryId, []);

  const referenceSources = useMemo(() => {
    const sources: Record<string, string> = {};
    targetIds.forEach((sourceId, viewId) => {
      const source = entriesById.get(sourceId);
      const list = source ? itemsById.get(source.listId) : undefined;
      if (list) sources[viewId] = titleOf(list);
    });
    return sources;
  }, [entriesById, itemsById, targetIds, titleOf]);

  // A list either lends lines to other lists or borrows them, never both.
  const lendingListIds = useMemo(() => listIdsLendingLines(allEntries), [allEntries]);
  const canBorrow = canEdit && canListBorrowLines(item, lendingListIds);

  const toTarget = useCallback(
    (list: SavedItem): ListTarget => ({
      id: list.id,
      title: titleOf(list),
      folderLabel: list.folderId ? getFolderPathLabel(folders, list.folderId) : HOME_LABEL,
    }),
    [folders, titleOf],
  );

  const otherLists = useMemo(
    () => items.filter((candidate) => candidate.type === "list" && candidate.id !== item.id && canEditItem(candidate.id)),
    [canEditItem, item.id, items],
  );

  // Lists this list's own lines can also be shown on.
  const linkTargets = useMemo<ListTarget[]>(
    () => (isFocus ? [] : otherLists.filter((list) => canListBorrowLines(list, lendingListIds)).map(toTarget)),
    [isFocus, lendingListIds, otherLists, toTarget],
  );
  const moveTargets = useMemo<ListTarget[]>(() => otherLists.map(toTarget), [otherLists, toTarget]);

  // Own line id -> the other lists it also shows on.
  const linkedListIds = useMemo(() => {
    const membership: Record<string, string[]> = {};
    if (isFocus) return membership;
    allEntries.forEach((entry) => {
      if (!entry.refEntryId || entriesById.get(entry.refEntryId)?.listId !== item.id) return;
      (membership[entry.refEntryId] ??= []).push(entry.listId);
    });
    return membership;
  }, [allEntries, entriesById, isFocus, item.id]);
  const linkedListIdsRef = useRef(linkedListIds);
  linkedListIdsRef.current = linkedListIds;

  const captions = useMemo(() => {
    const result: Record<string, string> = { ...referenceSources };
    Object.entries(linkedListIds).forEach(([entryId, listIds]) => {
      const titles = listIds
        .map((listId) => itemsById.get(listId))
        .filter((list): list is SavedItem => !!list)
        .map(titleOf);
      if (titles.length) result[entryId] = `On ${titles.join(", ")}`;
    });
    return result;
  }, [itemsById, linkedListIds, referenceSources, titleOf]);

  const onLinkEntries = useCallback(
    (entryIds: string[], listId: string) => {
      const target = itemsById.get(listId);
      if (!target) return null;
      const listTitle = titleOf(target);
      const sourceIds = entryIds.map(targetOf);
      const isOn = (entryId: string) => !!linkedListIdsRef.current[entryId]?.includes(listId);
      if (sourceIds.length === 1 && isOn(sourceIds[0])) {
        return removeFromFocusList(listId, sourceIds[0]) ? { listTitle, count: 1, removed: true } : null;
      }
      const fresh = sourceIds.filter((entryId) => !isOn(entryId));
      const count = addToFocusList(listId, fresh);
      return {
        listTitle,
        count,
        undo: count > 0 ? () => fresh.forEach((entryId) => removeFromFocusList(listId, entryId)) : undefined,
      };
    },
    [addToFocusList, itemsById, removeFromFocusList, targetOf, titleOf],
  );

  const onMoveEntries = useCallback(
    (entryIds: string[], listId: string) => {
      const previous = relocateListEntries(entryIds.map((entryId) => ({ entryId: targetOf(entryId), listId })));
      if (previous.length === 0) return null;
      const target = itemsById.get(listId);
      return {
        listTitle: target ? titleOf(target) : "list",
        undo: () => {
          relocateListEntries(previous);
        },
      };
    },
    [itemsById, relocateListEntries, targetOf, titleOf],
  );

  // Lists whose lines this list can pull in.
  const pickerLists = useMemo<FocusPickerList[]>(() => {
    if (!canBorrow) return [];
    return items
      .filter((candidate) => candidate.type === "list" && !isFocusList(candidate) && candidate.id !== item.id)
      .map((list) => ({
        id: list.id,
        title: titleOf(list),
        entries: sortEntries(allEntries.filter((entry) => entry.listId === list.id && !entry.refEntryId)),
      }))
      .filter((list) => list.entries.length > 0);
  }, [allEntries, canBorrow, item.id, items, titleOf]);

  const selectedSourceIds = useMemo(
    () => new Set(rawEntries.map((entry) => entry.refEntryId).filter((id): id is string => !!id)),
    [rawEntries],
  );

  // With a rule, moves are worked out from what's on screen, since lines the
  // rule pulled in have no stored position until they're pinned.
  const onMoveRuleEntry = useCallback(
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
      const targetListId = entriesByIdRef.current.get(targetId)?.listId;
      if (!targetListId || !canEditItem(targetListId)) return;
      updateListEntry(targetId, { checked: !entry.checked });
    },
    [canEditItem, targetOf, updateListEntry],
  );

  const onUpdateEntry = useCallback(
    (entryId: string, updates: EntryUpdates) => {
      // A stored line (its own, or one pulled in by hand) takes the change as
      // it is. A line a rule pulled in has no place of its own to indent.
      if (entriesByIdRef.current.has(entryId)) {
        updateListEntry(entryId, updates);
        return;
      }
      const targetId = targetOf(entryId);
      const { indentLevel: _indentLevel, ...content } = updates;
      if (targetId !== entryId && entriesByIdRef.current.has(targetId) && Object.keys(content).length > 0) {
        updateListEntry(targetId, content);
      }
    },
    [targetOf, updateListEntry],
  );

  const onDeleteEntry = useCallback(
    (entryId: string) => {
      const stored = entriesByIdRef.current.get(entryId);
      if (!stored) return;
      if (stored.refEntryId) removeFromFocusList(item.id, entryId);
      else deleteListEntry(entryId);
    },
    [deleteListEntry, item.id, removeFromFocusList],
  );

  const onInsertEntries = useCallback(
    (afterEntryId: string | null, lines: NewLine[]) =>
      insertListEntries(item.id, afterEntryId, lines).map((entry) => entry.id),
    [insertListEntries, item.id],
  );

  const onSetChecked = useCallback(
    (entryIds: string[], checked: boolean) => {
      setEntriesChecked(entryIds.map(targetOf), checked);
    },
    [setEntriesChecked, targetOf],
  );

  // --- Title ---------------------------------------------------------------
  const shownTitle = isUntitledList(item) ? "" : item.title;
  const [titleDraft, setTitleDraftState] = useState(shownTitle);
  const titleDraftRef = useRef(shownTitle);
  const setTitleDraft = (next: string) => {
    titleDraftRef.current = next;
    setTitleDraftState(next);
  };
  const [titleFocused, setTitleFocused] = useState(false);
  const [focusAddSignal, setFocusAddSignal] = useState(0);

  useEffect(() => {
    if (!titleFocused) setTitleDraft(shownTitle);
  }, [shownTitle, titleFocused]);

  // Saves the title as typed; an emptied title goes back to untitled.
  const commitTitle = useCallback((): string => {
    const next = titleDraftRef.current.replace(/\s+/g, " ").trim();
    if (next !== shownTitle) updateItem(item.id, { title: next || UNTITLED_LIST_TITLE });
    return next;
  }, [item.id, shownTitle, updateItem]);

  // --- Leaving -------------------------------------------------------------
  const latest = useRef({ canEdit, commitTitle, lineCount: rawEntries.length, shared: isSharedAccess(item) });
  latest.current = { canEdit, commitTitle, lineCount: rawEntries.length, shared: isSharedAccess(item) };
  const removedRef = useRef(false);

  // A list left with no title and no lines is thrown away, like an empty note.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        if (removedRef.current || !latest.current.canEdit) return;
        const addedLine = viewRef.current?.flush() ?? false;
        const title = latest.current.commitTitle();
        if (!addedLine && !title && latest.current.lineCount === 0 && !latest.current.shared) {
          removedRef.current = true;
          void deleteItem(item.id);
        }
      }),
    [deleteItem, item.id, navigation],
  );

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  const confirmDelete = useCallback(() => {
    Alert.alert("Delete this list?", "Its lines are deleted too. Lines pulled in from other lists stay in those lists.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            removedRef.current = true;
            const result = await deleteItem(item.id);
            if (!result.ok) {
              removedRef.current = false;
              Alert.alert("Could not delete list", result.error ?? "Try again in a moment.");
              return;
            }
            goBack();
          })();
        },
      },
    ]);
  }, [deleteItem, goBack, item.id]);

  // --- Menu ----------------------------------------------------------------
  const checkLines = entries.filter((entry) => entry.kind === "check");
  const doneLines = checkLines.filter((entry) => entry.checked);

  const uncheckAll = () => {
    const ids = doneLines.map((entry) => targetOf(entry.id));
    const changed = setEntriesChecked(ids, false);
    if (changed > 0) {
      viewRef.current?.showToast(changed === 1 ? "Unchecked 1 line" : `Unchecked ${changed} lines`, () => {
        setEntriesChecked(ids, true);
      });
    }
  };

  // Takes finished lines off the list. Its own are deleted; lines from other
  // lists only stop showing here.
  const clearChecked = () => {
    const doneRows = rawEntries.filter((row) =>
      row.refEntryId ? !!entriesById.get(row.refEntryId)?.checked : row.kind === "check" && row.checked,
    );
    if (doneRows.length === 0) return;
    doneRows.forEach((row) => {
      if (row.refEntryId) removeFromFocusList(item.id, row.id);
      else deleteListEntry(row.id);
    });
    viewRef.current?.showToast(doneRows.length === 1 ? "Cleared 1 line" : `Cleared ${doneRows.length} lines`, () => {
      restoreListEntries(doneRows);
    });
  };

  const folderLabel = item.folderId ? getFolderPathLabel(folders, item.folderId) : HOME_LABEL;
  const iconTone = colors.accentDark;
  const menuActions: MenuAction[] = [
    ...(canEdit && entries.length > 0
      ? [{ key: "select", label: "Select lines", icon: <CircleCheck size={20} color={iconTone} />, onPress: () => setSelecting(true) }]
      : []),
    ...(canBorrow && pickerLists.length > 0
      ? [
          {
            key: "pull",
            label: "Add lines from another list",
            icon: <ListPlus size={20} color={iconTone} />,
            onPress: () => setSheet("pull"),
          },
        ]
      : []),
    ...(canBorrow
      ? [
          {
            key: "rule",
            label: "Add lines automatically",
            detail: rule ? focusRuleLabels[rule] : "Off",
            icon: <Sparkles size={20} color={iconTone} />,
            onPress: () => setSheet("rule"),
          },
        ]
      : []),
    {
      key: "sort",
      label: "Sort",
      detail: listSortLabels[settings.sortMode],
      icon: <ArrowUpDown size={20} color={iconTone} />,
      separated: true,
      onPress: () => setSheet("sort"),
    },
    {
      key: "completed",
      label: "Checked lines",
      detail: completedModeLabels[settings.completedMode],
      icon: <CheckCheck size={20} color={iconTone} />,
      onPress: () => setSheet("completed"),
    },
    ...(canEdit && doneLines.length > 0
      ? [
          { key: "uncheck", label: "Uncheck all", icon: <RotateCcw size={20} color={iconTone} />, onPress: uncheckAll },
          { key: "clear", label: "Clear checked lines", icon: <Eraser size={20} color={iconTone} />, onPress: clearChecked },
        ]
      : []),
    ...(canEdit
      ? [
          {
            key: "folder",
            label: "Move to folder",
            detail: folderLabel,
            icon: <FolderInput size={20} color={iconTone} />,
            separated: true,
            onPress: () => setSheet("folder"),
          },
          {
            key: "delete",
            label: "Delete list",
            icon: <Trash2 size={20} color={colors.danger} />,
            destructive: true,
            onPress: confirmDelete,
          },
        ]
      : []),
  ];

  // --- Page ----------------------------------------------------------------
  const state = navigation.getState();
  const previousRoute = state.routes[state.index - 1];
  const backLabel =
    previousRoute?.name === "Folder"
      ? folders.find((folder) => folder.id === (previousRoute.params as { folderId?: string } | undefined)?.folderId)?.name ??
        "Folder"
      : previousRoute?.name === "Search"
        ? "Search"
        : HOME_LABEL;

  const caption = [
    checkLines.length > 0 ? `${doneLines.length} of ${checkLines.length} done` : "",
    settings.sortMode !== "manual" ? `Sorted by ${listSortLabels[settings.sortMode].toLowerCase()}` : "",
    isSharedAccess(item) ? `Shared · ${accessRoleLabel(item.accessRole)}` : "",
    !canEdit ? "View only" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const header = (
    <View style={styles.header}>
      {canEdit ? (
        <TextInput
          accessibilityLabel="List title"
          value={titleDraft}
          onChangeText={(next) => setTitleDraft(next.replace(/[\r\n]+/g, " "))}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => {
            setTitleFocused(false);
            commitTitle();
          }}
          onSubmitEditing={() => {
            commitTitle();
            setFocusAddSignal((count) => count + 1);
          }}
          autoFocus={isNew}
          multiline
          scrollEnabled={false}
          submitBehavior="submit"
          returnKeyType="next"
          placeholder="Title"
          placeholderTextColor={colors.muted}
          style={[styles.title, styles.titleInput]}
        />
      ) : (
        <Text accessibilityRole="header" style={styles.title}>
          {titleOf(item)}
        </Text>
      )}
      <Text numberOfLines={1} style={styles.caption}>
        {caption}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <NavBar
        backLabel={backLabel}
        onBack={goBack}
        right={
          selecting ? (
            <NavTextButton label="Done" onPress={() => setSelecting(false)} />
          ) : (
            <>
              <NavIconButton
                label="List options"
                onPress={() => {
                  Keyboard.dismiss();
                  setMenuOpen(true);
                }}
              >
                <Ellipsis size={24} color={colors.accentDark} />
              </NavIconButton>
              {keyboardUp && <NavTextButton label="Done" onPress={() => Keyboard.dismiss()} />}
            </>
          )
        }
      />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ListEntriesView
          ref={viewRef}
          entries={entries}
          priorityOptions={priorityOptions}
          canEdit={canEdit}
          settings={settings}
          onChangeSettings={updateSettings}
          selecting={selecting}
          onChangeSelecting={setSelecting}
          onToggleEntry={onToggleEntry}
          onSetChecked={onSetChecked}
          onUpdateEntry={onUpdateEntry}
          onMoveEntry={rule ? onMoveRuleEntry : moveListEntry}
          onInsertEntries={onInsertEntries}
          onDeleteEntry={onDeleteEntry}
          captions={captions}
          referenceSources={referenceSources}
          ruleEntryIds={autoIds}
          linkTargets={linkTargets}
          linkedListIds={linkedListIds}
          onLinkEntries={onLinkEntries}
          moveTargets={moveTargets}
          onMoveEntries={onMoveEntries}
          onRestoreEntries={(restored) => {
            restoreListEntries(restored);
          }}
          header={header}
          footer={
            showComments ? <CommentThread targetType="item" targetId={item.id} style={styles.comments} /> : undefined
          }
          emptyText={rule ? "Nothing matches this list's rule right now." : "Nothing on this list yet."}
          focusAddSignal={focusAddSignal}
        />
      </KeyboardAvoidingView>

      <MenuSheet visible={menuOpen} actions={menuActions} onClose={() => setMenuOpen(false)} />
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
        title="Checked lines"
        options={completedOptions}
        selectedValue={settings.completedMode}
        onSelect={(completedMode) => updateSettings({ completedMode })}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet<RuleChoice>
        visible={sheet === "rule"}
        title="Add lines automatically"
        options={ruleOptions}
        selectedValue={rule ?? "none"}
        onSelect={(value) =>
          updateItem(item.id, value === "none" ? { focusRule: undefined } : { listMode: "focus", focusRule: value })
        }
        onClose={() => setSheet(null)}
      />
      <FocusListPicker
        visible={sheet === "pull"}
        focusListTitle={titleOf(item)}
        lists={pickerLists}
        selectedEntryIds={selectedSourceIds}
        onToggle={(entry) => {
          if (selectedSourceIds.has(entry.id)) removeFromFocusList(item.id, entry.id);
          else addToFocusList(item.id, [entry.id]);
        }}
        onClose={() => setSheet(null)}
      />
      <FolderTreeBrowserModal
        visible={sheet === "folder"}
        folders={folders}
        title="Move to folder"
        rootLabel={HOME_LABEL}
        selectedFolderId={item.folderId}
        onSelectFolder={(folderId) => {
          setSheet(null);
          if (folderId !== item.folderId) updateItem(item.id, { folderId });
        }}
        onClose={() => setSheet(null)}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.surface,
      flex: 1,
    },
    body: {
      flex: 1,
    },
    header: {
      paddingBottom: spacing.xs,
      paddingHorizontal: 20,
      paddingTop: spacing.xs,
    },
    title: {
      color: colors.ink,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.3,
      lineHeight: 34,
    },
    titleInput: {
      margin: 0,
      padding: 0,
    },
    caption: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 4,
      minHeight: 18,
    },
    comments: {
      marginHorizontal: 20,
      marginTop: spacing.lg,
    },
  });
