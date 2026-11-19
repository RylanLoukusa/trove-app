import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Share, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  CheckCheck,
  CircleCheck,
  Copy,
  Ellipsis,
  Eraser,
  FilePlus2,
  FolderInput,
  LayoutTemplate,
  ListPlus,
  Pin,
  PinOff,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react-native";

import { CommentThread } from "../../components/CommentThread";
import { FocusListPicker, FocusPickerList } from "../../components/FocusListPicker";
import { FolderTreeBrowserModal } from "../../components/FolderTreeBrowserModal";
import { EntryUpdates, ListEntriesView, ListEntriesViewHandle, NewLine } from "../../components/ListEntriesView";
import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar, NavIconButton, NavTextButton } from "../../components/NavBar";
import type { ListTarget } from "../../components/SendToListSheet";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import { uploadPendingLineImages } from "../../media/lineImages";
import { HOME_LABEL } from "../../navigation/backLabel";
import type { RootStackParamList } from "../../navigation/types";
import { useListViewSettings } from "../../storage/listViewSettings";
import { useTrove } from "../../storage/storage";
import { spacing, ThemeColors } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import type { FocusRule, ListEntry, ResetRule, SavedItem } from "../../types/models";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { listToText } from "../../utils/exportData";
import { getFolderPathLabel } from "../../utils/folderTree";
import {
  canListBorrowLines,
  focusReferenceId,
  generatePositionsBetween,
  isFocusList,
  isUntitledList,
  legacyEntryPosition,
  listDisplayTitle,
  listIdsLendingLines,
  listItemKindFromSnapshot,
  checkWithGroup,
  resolveEntries,
  sortEntries,
  UNTITLED_LIST_TITLE,
} from "../../utils/listEntries";
import {
  CompletedMode,
  completedModeLabels,
  describeDueDate,
  ListSortMode,
  listSortLabels,
  matchesFocusRule,
  matchesTagRule,
  priorityOptionsFor,
  tagSectionsFor,
} from "../../utils/listView";
import { nextDueDate, RESET_RULES, resetLabels } from "../../utils/schedule";

type Props = {
  item: SavedItem;
  navigation: NativeStackNavigationProp<RootStackParamList, "List">;
  // Name of the screen Back returns to.
  backLabel: string;
  // Just created: the cursor starts in the title.
  isNew?: boolean;
};

// The settings in the list's menu. Picking one leaves the menu open, so
// several can be changed in one go.
// A rule is "none", a focus rule, or `tag:<tag option id>`.
type RuleChoice = FocusRule | "none";
const TAG_RULE_PREFIX = "tag:";
const ruleChoices: Array<{ value: RuleChoice; label: string }> = [
  { value: "none", label: "Off" },
  { value: "due_today", label: "Due today" },
  { value: "due_week", label: "Next 7 days" },
  { value: "due_weekend", label: "This weekend" },
  { value: "high_priority", label: "Top priority" },
];
const sortChoices = (Object.keys(listSortLabels) as ListSortMode[]).map((value) => ({ value, label: listSortLabels[value] }));
const completedChoices = (Object.keys(completedModeLabels) as CompletedMode[]).map((value) => ({
  value,
  label: completedModeLabels[value],
}));
// Said under the title while the lines are in an order other than the person's own.
const sortCaptions: Record<ListSortMode, string> = {
  manual: "",
  due: "Sorted by due date",
  priority: "Sorted by priority",
  alpha: "Sorted A to Z",
  newest: "Newest first",
};
// Said under the title of a list that unchecks itself.
const resetCaptions: Record<ResetRule, string> = {
  daily: "Starts over each day",
  weekly: "Starts over each Monday",
  monthly: "Starts over each month",
};
// Said under the title of a list that adds lines by itself.
const ruleCaptions: Record<FocusRule, string> = {
  due_today: "Adds lines due today or overdue",
  due_week: "Adds lines due in the next 7 days",
  due_weekend: "Adds lines due this weekend",
  high_priority: "Adds highest priority lines",
};

// One list: its title and its lines on a single page. A line pulled in from
// another list is edited in place but stays in its own list.
export const ListPage = ({ item, navigation, backLabel, isNew = false }: Props) => {
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
    trashItem,
    setItemArchived,
    copyItem,
    updateListEntry,
    setEntriesChecked,
    insertListEntries,
    relocateListEntries,
    restoreListEntries,
    deleteListEntry,
    addToFocusList,
    positionListEntry,
    removeFromFocusList,
    canEditItem,
  } = useTrove();
  const isFocus = isFocusList(item);
  const canEdit = canEditItem(item.id);
  const rule = isFocus ? item.focusRule : undefined;
  // A list adds lines by date and priority, or else by a tag.
  const ruleTagId = isFocus && !rule ? item.ruleTagId : undefined;
  const viewRef = useRef<ListEntriesViewHandle>(null);
  const [settings, updateSettings] = useListViewSettings(item.id);
  const [selecting, setSelecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<"pull" | "folder" | null>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const { isShared: isFolderSharedByOwner } = useFolderShareStatus(item.folderId || undefined);
  const showComments = isSharedAccess(item) || isFolderSharedByOwner;

  // Photos added while offline go up once a list is opened again.
  useEffect(() => {
    void uploadPendingLineImages();
  }, []);

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
  const tagSections = useMemo(() => tagSectionsFor(tagGroups, tagOptions), [tagGroups, tagOptions]);
  const ruleTag = ruleTagId ? tagOptions.find((option) => option.id === ruleTagId) : undefined;
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
    const matchesRule = rule
      ? (entry: ListEntry) => matchesFocusRule(entry, rule, priorityOptions)
      : ruleTagId
        ? (entry: ListEntry) => matchesTagRule(entry, ruleTagId)
        : null;
    if (!matchesRule) return [];
    const pinned = new Set(rawEntries.map((entry) => entry.refEntryId).filter(Boolean));
    const matches = sortEntries(
      allEntries.filter((entry) => {
        if (entry.refEntryId || pinned.has(entry.id)) return false;
        const list = itemsById.get(entry.listId);
        return !!list && list.type === "list" && !isFocusList(list) && matchesRule(entry);
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
  }, [allEntries, item.id, itemsById, priorityOptions, rawEntries, rule, ruleTagId]);

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
      folderLabel: getFolderPathLabel(folders, list.folderId),
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
  // Puts dragged lines, in order, between two lines. A line a rule added is
  // saved on the list where it is put, so it stays there.
  const onReorderEntries = useCallback(
    (entryIds: string[], afterId: string | null, beforeId: string | null) => {
      if (entryIds.length === 0) return;
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const lower = afterId ? byId.get(afterId)?.position ?? null : null;
      let upper = beforeId ? byId.get(beforeId)?.position ?? null : null;
      if (lower !== null && upper !== null && lower >= upper) upper = null;
      const positions = generatePositionsBetween(lower, upper, entryIds.length);
      entryIds.forEach((entryId, index) => {
        const sourceId = targetIds.get(entryId);
        if (autoIds.has(entryId) && sourceId) addToFocusList(item.id, [sourceId], positions[index]);
        else positionListEntry(entryId, positions[index]);
      });
    },
    [addToFocusList, autoIds, entries, item.id, positionListEntry, targetIds],
  );

  // Checks or unchecks lines together with the lines indented under them, and
  // the lines they're indented under (see checkWithGroup).
  const setCheckedWithGroup = useCallback(
    (lineIds: string[], checked: boolean): number => {
      const checking: string[] = [];
      const unchecking: string[] = [];
      checkWithGroup(entries, lineIds, checked).forEach((next, id) => (next ? checking : unchecking).push(targetOf(id)));
      return (
        (checking.length > 0 ? setEntriesChecked(checking, true) : 0) +
        (unchecking.length > 0 ? setEntriesChecked(unchecking, false) : 0)
      );
    },
    [entries, setEntriesChecked, targetOf],
  );

  const onToggleEntry = useCallback(
    (entry: ListEntry) => {
      if (entry.kind !== "check") return;
      const targetListId = entriesByIdRef.current.get(targetOf(entry.id))?.listId;
      if (!targetListId || !canEditItem(targetListId)) return;
      setCheckedWithGroup([entry.id], !entry.checked);
      // A repeating line comes straight back, due the next time.
      if (entry.repeat && !entry.checked) {
        const next = describeDueDate(nextDueDate(entry.repeat, entry.dueDate));
        if (next) viewRef.current?.showToast(`Done. Back ${next.label.toLowerCase()}`);
      }
    },
    [canEditItem, setCheckedWithGroup, targetOf],
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
      setCheckedWithGroup(entryIds, checked);
    },
    [setCheckedWithGroup],
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

  // No "are you sure": the list waits in Recently deleted for 30 days.
  const moveToDeleted = useCallback(() => {
    removedRef.current = true;
    const result = trashItem(item.id);
    if (!result.ok) {
      removedRef.current = false;
      Alert.alert("Could not delete list", result.error ?? "Try again in a moment.");
      return;
    }
    goBack();
  }, [goBack, item.id, trashItem]);

  const toggleArchived = useCallback(() => {
    const archiving = !item.archivedAt;
    if (archiving) removedRef.current = true;
    if (!setItemArchived(item.id, archiving)) {
      removedRef.current = false;
      return;
    }
    if (archiving) goBack();
  }, [goBack, item.archivedAt, item.id, setItemArchived]);

  // A copy opens straight away, so it can be renamed.
  const duplicate = useCallback(() => {
    const copy = copyItem(item.id);
    if (copy) navigation.replace("List", { listId: copy.id });
  }, [copyItem, item.id, navigation]);

  const saveAsTemplate = useCallback(() => {
    const template = copyItem(item.id, { title: titleOf(item), fresh: true, template: true });
    if (template) viewRef.current?.showToast("Saved as a template");
  }, [copyItem, item, titleOf]);

  const useTemplate = useCallback(() => {
    const list = copyItem(item.id, { title: titleOf(item), fresh: true });
    if (list) navigation.replace("List", { listId: list.id });
  }, [copyItem, item, navigation, titleOf]);

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

  const sendAsText = () => {
    void Share.share({ message: listToText(titleOf(item), entries) });
  };

  const folderLabel = getFolderPathLabel(folders, item.folderId);
  const iconTone = colors.accentDark;
  const isTemplate = !!item.isTemplate;
  const isArchived = !!item.archivedAt;
  // Pinning is the owner's own choice, so a list shared with them can't be.
  const canPin = canEdit && !isSharedAccess(item) && !isTemplate && !isArchived;
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
    ...(canPin
      ? [
          {
            key: "pin",
            label: item.pinned ? "Unpin from Home" : "Pin to Home",
            icon: item.pinned ? <PinOff size={20} color={iconTone} /> : <Pin size={20} color={iconTone} />,
            onPress: () => updateItem(item.id, { pinned: !item.pinned }),
          },
        ]
      : []),
    {
      key: "sort",
      label: "Sort",
      icon: <ArrowUpDown size={20} color={iconTone} />,
      separated: true,
      choices: sortChoices,
      selectedValue: settings.sortMode,
      onChoose: (value) => updateSettings({ sortMode: value as ListSortMode }),
    },
    {
      key: "completed",
      label: "Checked lines",
      icon: <CheckCheck size={20} color={iconTone} />,
      choices: completedChoices,
      selectedValue: settings.completedMode,
      onChoose: (value) => updateSettings({ completedMode: value as CompletedMode }),
    },
    // Starting over on a schedule is for a list's own lines.
    ...(canEdit && !isFocus && !isTemplate
      ? [
          {
            key: "reset",
            label: "Uncheck all by itself",
            icon: <RotateCcw size={20} color={iconTone} />,
            choices: [
              { value: "off", label: "Never" },
              ...RESET_RULES.map((rule) => ({ value: rule, label: resetLabels[rule] })),
            ],
            selectedValue: item.resetRule ?? "off",
            onChoose: (value: string) =>
              updateItem(
                item.id,
                value === "off"
                  ? { resetRule: undefined, resetAt: undefined }
                  : { resetRule: value as ResetRule, resetAt: new Date().toISOString() },
              ),
          },
        ]
      : []),
    ...(canBorrow
      ? [
          {
            key: "rule",
            label: "Add lines automatically",
            icon: <Sparkles size={20} color={iconTone} />,
            // The date rules, then every tag under its group's name.
            choices: [
              ...ruleChoices,
              ...tagSections.flatMap(({ group, options }) =>
                options.map((option) => ({ value: `${TAG_RULE_PREFIX}${option.id}`, label: option.name, group: group.name })),
              ),
            ],
            selectedValue: rule ?? (ruleTagId ? `${TAG_RULE_PREFIX}${ruleTagId}` : "none"),
            onChoose: (value: string) => {
              if (value.startsWith(TAG_RULE_PREFIX)) {
                updateItem(item.id, { listMode: "focus", focusRule: undefined, ruleTagId: value.slice(TAG_RULE_PREFIX.length) });
                return;
              }
              const next = value as RuleChoice;
              updateItem(
                item.id,
                next === "none"
                  ? { focusRule: undefined, ruleTagId: undefined }
                  : { listMode: "focus", focusRule: next, ruleTagId: undefined },
              );
            },
          },
        ]
      : []),
    ...(canEdit && doneLines.length > 0
      ? [
          {
            key: "uncheck",
            label: "Uncheck all",
            icon: <RotateCcw size={20} color={iconTone} />,
            separated: true,
            onPress: uncheckAll,
          },
          { key: "clear", label: "Clear checked lines", icon: <Eraser size={20} color={iconTone} />, onPress: clearChecked },
        ]
      : []),
    ...(isTemplate
      ? [
          {
            key: "use",
            label: "New list from this template",
            icon: <FilePlus2 size={20} color={iconTone} />,
            separated: true,
            onPress: useTemplate,
          },
        ]
      : [
          {
            key: "copy",
            label: "Duplicate",
            icon: <Copy size={20} color={iconTone} />,
            separated: true,
            onPress: duplicate,
          },
          {
            key: "template",
            label: "Save as template",
            icon: <LayoutTemplate size={20} color={iconTone} />,
            onPress: saveAsTemplate,
          },
        ]),
    ...(entries.length > 0
      ? [{ key: "send", label: "Send as text", icon: <Share2 size={20} color={iconTone} />, onPress: sendAsText }]
      : []),
    ...(canEdit
      ? [
          ...(isTemplate
            ? []
            : [
                {
                  key: "folder",
                  label: "Move to folder",
                  detail: folderLabel,
                  icon: <FolderInput size={20} color={iconTone} />,
                  separated: true,
                  onPress: () => setSheet("folder"),
                },
                {
                  key: "archive",
                  label: isArchived ? "Unarchive" : "Archive",
                  icon: isArchived ? <ArchiveRestore size={20} color={iconTone} /> : <Archive size={20} color={iconTone} />,
                  onPress: toggleArchived,
                },
              ]),
          {
            key: "delete",
            label: isTemplate ? "Delete template" : "Delete list",
            icon: <Trash2 size={20} color={colors.danger} />,
            destructive: true,
            separated: isTemplate,
            onPress: moveToDeleted,
          },
        ]
      : []),
  ];

  // --- Page ----------------------------------------------------------------
  const caption = [
    isTemplate ? "Template" : "",
    isArchived ? "Archived" : "",
    checkLines.length > 0 ? `${doneLines.length} of ${checkLines.length} done` : "",
    rule ? ruleCaptions[rule] : ruleTag ? `Adds lines tagged ${ruleTag.name}` : "",
    item.resetRule && !isTemplate ? resetCaptions[item.resetRule] : "",
    sortCaptions[settings.sortMode],
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
          onChangeText={(next) => {
            // A title is one line: a break pasted into it becomes a space.
            setTitleDraft(next.replace(/[\r\n]+$/, "").replace(/[\r\n]+/g, " "));
            // Where Return types a line break instead of submitting, a break
            // at the end of the title still moves on to the first line.
            if (/[\r\n]$/.test(next)) {
              commitTitle();
              setFocusAddSignal((count) => count + 1);
            }
          }}
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
          tagSections={tagSections}
          canEdit={canEdit}
          settings={settings}
          onChangeSettings={updateSettings}
          selecting={selecting}
          onChangeSelecting={setSelecting}
          onToggleEntry={onToggleEntry}
          onSetChecked={onSetChecked}
          onUpdateEntry={onUpdateEntry}
          onReorderEntries={onReorderEntries}
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
          emptyText={rule || ruleTagId ? "Nothing matches this list's rule right now." : "Nothing on this list yet."}
          focusAddSignal={focusAddSignal}
        />
      </KeyboardAvoidingView>

      <MenuSheet visible={menuOpen} title={titleOf(item)} actions={menuActions} onClose={() => setMenuOpen(false)} />
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
