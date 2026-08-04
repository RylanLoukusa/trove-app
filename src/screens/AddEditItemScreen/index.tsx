import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { ChoiceSheet } from "../../components/ChoiceSheet";
import { FolderPickerField } from "../../components/FolderPickerField";
import { MediaCollectionPicker } from "../../components/MediaCollectionPicker";
import { OptionChoiceRow } from "../../components/OptionChoiceRow";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { TagChip } from "../../components/TagChip";
import { TagMultiSelectSheet } from "../../components/TagMultiSelectSheet";
import { ListItemRow, LIST_ROW_HEIGHT } from "./ListItemRow";
import { RootStackParamList } from "../../navigation/types";
import { clearSharedImport, inferSourcePlatform, readSharedImport, titleFromSharedImport } from "../../share/sharedImport";
import { deleteMediaFromSupabase, uploadMediaToSupabase } from "../../lib/supabaseStorage";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { spacing } from "../../theme/theme";
import { MediaCollectionItem, ItemType, ListItemKind, SavedListItem } from "../../types/models";
import { createId } from "../../utils/id";
import { isMediaItemType, normalizeItemType } from "../../utils/itemTypes";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "AddEditItem">;

const MAX_LIST_INDENT_LEVEL = 3;

const types = ["text", "list", "link", "media"] as const;
type SelectableItemType = (typeof types)[number];

const typeChoices: Record<SelectableItemType, { label: string; detail: string; tone: string }> = {
  text: { label: "Note", detail: "Rich notes, ideas, reminders", tone: "#8A9A5B" },
  list: { label: "List", detail: "Checklist or bullet rows", tone: "#DFAE73" },
  link: { label: "Link", detail: "Articles, products, places", tone: "#6F8FAF" },
  media: { label: "Media", detail: "Photos, videos, and visual references", tone: "#B9856D" },
};

export const AddEditItemScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, items, tagGroups, tagOptions, createItem, updateItem, createTagOption, canEditFolderContent, canEditItem } = useTrove();
  const editing = items.find((item) => item.id === route.params?.itemId);
  const sortedTagGroups = useMemo(() => [...tagGroups].sort((a, b) => a.sortOrder - b.sortOrder), [tagGroups]);
  const editableFolders = useMemo(
    () => folders.filter((folder) => canEditFolderContent(folder.id)),
    [canEditFolderContent, folders],
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const listInputRefs = useRef<Map<string, TextInput>>(new Map());

  const [title, setTitle] = useState(editing?.title ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState(editing?.type === "text" ? editing.description ?? editing.richText ?? "" : "");
  const [linkText, setLinkText] = useState(editing?.type === "link" ? editing.url ?? "" : "");
  const [sourceUrl, setSourceUrl] = useState(editing?.sourceUrl ?? "");
  const [sharedText, setSharedText] = useState(editing?.sharedText ?? "");
  const [type, setType] = useState<ItemType | null>(editing ? normalizeItemType(editing.type) : null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(!editing);
  const [folderId, setFolderId] = useState(editing?.folderId ?? route.params?.folderId ?? editableFolders[0]?.id ?? "");
  const [tagOptionIds, setTagOptionIds] = useState<string[]>(editing?.tagOptionIds ?? []);
  const [openSingleSelectGroupId, setOpenSingleSelectGroupId] = useState<string | null>(null);
  const [openMultiSelectGroupId, setOpenMultiSelectGroupId] = useState<string | null>(null);
  const [listItems, setListItems] = useState<SavedListItem[]>(
    editing?.listItems?.length ? editing.listItems : [{ id: createId("list-item"), kind: "check", text: "", checked: false }],
  );
  const [mediaItems, setMediaItems] = useState<MediaCollectionItem[]>(() => {
    if (!editing) return [];
    if (editing.mediaItems?.length) return editing.mediaItems;
    if (editing.media?.storagePath) {
      return [
        {
          id: editing.media.storagePath,
          storagePath: editing.media.storagePath,
          mediaType: editing.media.mediaType ?? "image",
          thumbnailPath: editing.media.thumbnailPath,
        },
      ];
    }
    if (editing.mediaUri) {
      return [
        {
          id: createId("media"),
          localUri: editing.mediaUri,
          mediaType: editing.media?.mediaType ?? (editing.type === "video" ? "video" : "image"),
        },
      ];
    }
    return [];
  });
  const [isSaving, setIsSaving] = useState(false);
  const sharedImportId = route.params?.sharedImportId;
  const [loadedSharedImportId, setLoadedSharedImportId] = useState<string | null>(null);
  const folderPickerFolders = useMemo(() => {
    if (!folderId || editableFolders.some((folder) => folder.id === folderId)) {
      return editableFolders;
    }

    const selectedFolder = folders.find((folder) => folder.id === folderId);
    return selectedFolder ? [selectedFolder, ...editableFolders] : editableFolders;
  }, [editableFolders, folderId, folders]);

  useEffect(() => {
    if (editing) return;
    if (!folderId && editableFolders[0]) {
      setFolderId(editableFolders[0].id);
      return;
    }
    if (folderId && !canEditFolderContent(folderId) && editableFolders[0]) {
      setFolderId(editableFolders[0].id);
    }
  }, [canEditFolderContent, editableFolders, editing, folderId]);

  useEffect(() => {
    if (!sharedImportId || editing || loadedSharedImportId === sharedImportId) return;

    let cancelled = false;
    setLoadedSharedImportId(sharedImportId);

    void readSharedImport(sharedImportId)
      .then((payload) => {
        if (cancelled || !payload) return;

        const nextSourceUrl = payload.sourceUrl ?? "";
        const nextSharedText = payload.sharedText ?? "";
        const nextMediaItems = payload.mediaItems ?? [];

        setTitle((current) => current.trim() || titleFromSharedImport(payload));
        setSourceUrl(nextSourceUrl);
        setSharedText(nextSharedText);
        setMediaItems(nextMediaItems);

        if (nextMediaItems.length > 0) {
          setType("media");
          setIsTypePickerOpen(false);
        } else if (nextSourceUrl) {
          setType("link");
          setLinkText(nextSourceUrl);
          setIsTypePickerOpen(false);
        } else if (nextSharedText) {
          setType("text");
          setNoteText(nextSharedText);
          setIsTypePickerOpen(false);
        }
      })
      .catch(() => {
        Alert.alert("Shared item failed", "The shared item could not be imported.");
      });

    return () => {
      cancelled = true;
    };
  }, [editing, loadedSharedImportId, sharedImportId]);

  const updateListItem = useCallback((itemId: string, updates: Partial<SavedListItem>): void => {
    setListItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  }, []);

  const listKind: ListItemKind = listItems[0]?.kind ?? "check";
  const isListEmpty = listItems.length === 1 && !listItems[0].text.trim();

  const setListKind = useCallback((kind: ListItemKind): void => {
    setListItems((current) => current.map((item) => ({ ...item, kind, checked: false })));
  }, []);

  const addListItem = useCallback((): void => {
    setListItems((current) => [...current, { id: createId("list-item"), kind: listKind, text: "", checked: false, indentLevel: 0 }]);
  }, [listKind]);

  const insertListItemAfter = useCallback(
    (itemId: string): string => {
      const newId = createId("list-item");
      setListItems((current) => {
        const index = current.findIndex((item) => item.id === itemId);
        const reference = current[index];
        const newItem: SavedListItem = {
          id: newId,
          kind: reference?.kind ?? listKind,
          text: "",
          checked: false,
          indentLevel: reference?.indentLevel ?? 0,
        };
        if (index === -1) return [...current, newItem];
        return [...current.slice(0, index + 1), newItem, ...current.slice(index + 1)];
      });
      return newId;
    },
    [listKind],
  );

  const indentListItem = useCallback((itemId: string): void => {
    setListItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, indentLevel: Math.min((item.indentLevel ?? 0) + 1, MAX_LIST_INDENT_LEVEL) } : item,
      ),
    );
  }, []);

  const outdentListItem = useCallback((itemId: string): void => {
    setListItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, indentLevel: Math.max((item.indentLevel ?? 0) - 1, 0) } : item)),
    );
  }, []);

  const removeListItem = useCallback((itemId: string): void => {
    setListItems((current) => (current.length > 1 ? current.filter((item) => item.id !== itemId) : current));
  }, []);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndexState] = useState(0);
  const dragOverIndexRef = useRef(0);
  const draggingIndex = draggingItemId ? listItems.findIndex((item) => item.id === draggingItemId) : -1;

  const setDragOverIndex = useCallback((nextIndex: number): void => {
    dragOverIndexRef.current = nextIndex;
    setDragOverIndexState((current) => (current === nextIndex ? current : nextIndex));
  }, []);

  const startListItemDrag = useCallback(
    (itemId: string, startIndex: number): void => {
      setDragOverIndex(startIndex);
      setDraggingItemId(itemId);
    },
    [setDragOverIndex],
  );

  const updateListItemDrag = useCallback(
    (startIndex: number, translationY: number): void => {
      const rawOffset = Math.round(translationY / LIST_ROW_HEIGHT);
      const nextIndex = Math.min(Math.max(startIndex + rawOffset, 0), listItems.length - 1);
      setDragOverIndex(nextIndex);
    },
    [listItems.length, setDragOverIndex],
  );

  const endListItemDrag = useCallback((startIndex: number): void => {
    const targetIndex = dragOverIndexRef.current;
    if (startIndex !== targetIndex) {
      setListItems((current) => {
        const next = [...current];
        const [moved] = next.splice(startIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    }
    setDraggingItemId(null);
  }, []);

  const selectSingleOption = useCallback((groupOptionIds: string[], optionId: string): void => {
    setTagOptionIds((current) => [...current.filter((id) => !groupOptionIds.includes(id)), optionId]);
  }, []);

  const updateTitle = useCallback(
    (nextTitle: string): void => {
      setTitle(nextTitle);
      if (titleError && nextTitle.trim()) {
        setTitleError(null);
      }
    },
    [titleError],
  );

  const toggleMultiOption = useCallback((optionId: string): void => {
    setTagOptionIds((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );
  }, []);

  const createAndSelectOption = useCallback(
    (groupId: string, name: string): void => {
      const option = createTagOption({ groupId, name });
      setTagOptionIds((current) => [...current, option.id]);
    },
    [createTagOption],
  );

  const save = useCallback(async (): Promise<void> => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError("Title is required.");
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      requestAnimationFrame(() => titleInputRef.current?.focus());
      return;
    }

    if (!type) {
      setTypeError("Choose a type.");
      setIsTypePickerOpen(true);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    if (editing && !canEditItem(editing.id)) {
      Alert.alert("Cannot edit item", "You do not have permission to edit this item.");
      return;
    }

    if (!editing && !canEditFolderContent(folderId)) {
      Alert.alert("Cannot save item", "Choose a folder where you have edit access.");
      return;
    }

    setIsSaving(true);
    try {
      const trimmedNote = noteText.trim();
      const trimmedLink = linkText.trim();
      const isMedia = isMediaItemType(type);
      let storedMediaItems: MediaCollectionItem[] | undefined;

      if (isMedia) {
        const uploadGroupId = editing?.id || `temp-${Date.now()}`;
        const uploadedItems: MediaCollectionItem[] = [];

        for (const mediaItem of mediaItems) {
          if (mediaItem.storagePath) {
            uploadedItems.push({
              id: mediaItem.id,
              storagePath: mediaItem.storagePath,
              mediaType: mediaItem.mediaType,
              thumbnailPath: mediaItem.thumbnailPath,
            });
            continue;
          }

          if (!mediaItem.localUri) continue;

          const uploadResult = await uploadMediaToSupabase(mediaItem.localUri, uploadGroupId, mediaItem.mediaType ?? "image");

          if ("error" in uploadResult) {
            Alert.alert("Upload failed", uploadResult.error);
            setIsSaving(false);
            return;
          }

          uploadedItems.push({
            id: mediaItem.id,
            storagePath: uploadResult.storagePath,
            mediaType: mediaItem.mediaType ?? "image",
          });
        }

        storedMediaItems = uploadedItems.length ? uploadedItems : undefined;
      }

      if (editing && isMedia) {
        const existingPaths = new Set<string>();
        if (editing.media?.storagePath) existingPaths.add(editing.media.storagePath);
        editing.mediaItems?.forEach((mediaItem) => {
          if (mediaItem.storagePath) existingPaths.add(mediaItem.storagePath);
        });

        const nextPaths = new Set(storedMediaItems?.map((mediaItem) => mediaItem.storagePath).filter((path): path is string => !!path));
        const removedPaths = Array.from(existingPaths).filter((path) => !nextPaths.has(path));
        await Promise.all(removedPaths.map(deleteMediaFromSupabase));
      }

      const payload = {
        folderId,
        title: trimmedTitle,
        description: type === "text" ? trimmedNote || undefined : undefined,
        type: normalizeItemType(type),
        url: type === "link" ? trimmedLink || undefined : undefined,
        sourcePlatform: inferSourcePlatform(sourceUrl),
        sourceUrl: sourceUrl.trim() || undefined,
        sharedText: sharedText.trim() || undefined,
        media: storedMediaItems?.[0],
        mediaItems: storedMediaItems,
        attachments: undefined,
        listItems:
          type === "list"
            ? listItems
                .map((item) => ({ ...item, text: item.text.trim() }))
                .filter((item) => item.text.length > 0)
            : undefined,
        richText: type === "text" ? trimmedNote || undefined : undefined,
        tagOptionIds,
      };

      if (editing) {
        updateItem(editing.id, payload);
        navigation.goBack();
      } else {
        const item = createItem(payload);
        if (!item) {
          setIsSaving(false);
          return;
        }
        if (sharedImportId) {
          await clearSharedImport(sharedImportId);
        }
        navigation.replace("ItemDetail", { itemId: item.id });
      }
    } finally {
      setIsSaving(false);
    }
  }, [canEditFolderContent, canEditItem, createItem, editing, folderId, linkText, listItems, mediaItems, navigation, noteText, sharedImportId, sharedText, sourceUrl, tagOptionIds, title, type, updateItem]);

  const selectedTypeOption = type ? typeChoices[normalizeItemType(type) as SelectableItemType] : null;
  const openSingleSelectGroup = sortedTagGroups.find((group) => group.id === openSingleSelectGroupId);
  const openSingleSelectGroupOptions = openSingleSelectGroup
    ? tagOptions.filter((option) => option.groupId === openSingleSelectGroup.id)
    : [];
  const openSingleSelectSelectedId =
    tagOptionIds.find((id) => openSingleSelectGroupOptions.some((option) => option.id === id)) ?? "";
  const openMultiSelectGroup = sortedTagGroups.find((group) => group.id === openMultiSelectGroupId);
  const visibleTagGroups = sortedTagGroups.filter(
    (group) => group.selectionMode !== "single" || tagOptions.some((option) => option.groupId === group.id),
  );

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{editing ? "Edit item" : "Add item"}</Text>

        <Text style={styles.label}>
          Title <Text style={styles.requiredMarker}>*</Text>
        </Text>
        <TextInput
          ref={titleInputRef}
          style={[styles.input, titleError && styles.inputError]}
          value={title}
          onChangeText={updateTitle}
          placeholder="What are you saving?"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
        />
        {titleError && <Text style={styles.errorText}>{titleError}</Text>}

        <Text style={styles.section}>Type</Text>
        {isTypePickerOpen || !selectedTypeOption ? (
          types.map((choice) => {
            const option = typeChoices[choice];
            return (
              <OptionChoiceRow
                key={choice}
                label={option.label}
                detail={option.detail}
                tone={option.tone}
                isSelected={type === choice}
                onPress={() => {
                  setType(choice);
                  setIsTypePickerOpen(false);
                  setTypeError(null);
                }}
              />
            );
          })
        ) : (
          <OptionChoiceRow
            label={selectedTypeOption.label}
            detail={`${selectedTypeOption.detail} · Tap to change`}
            tone={selectedTypeOption.tone}
            isSelected
            onPress={() => setIsTypePickerOpen(true)}
          />
        )}
        {typeError && <Text style={styles.errorText}>{typeError}</Text>}

        {type === "text" && (
          <>
            <Text style={styles.label}>Note</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Write the thought, reminder, or context..."
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
            />
          </>
        )}

        {type === "link" && (
          <>
            <Text style={styles.label}>Link</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={linkText}
              onChangeText={setLinkText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://example.com"
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
            />
          </>
        )}

        {type === "list" && (
          <View style={styles.listEditor}>
            {isListEmpty && (
              <View style={styles.listKindPicker}>
                <OptionChoiceRow
                  label="Checklist"
                  detail="Rows with checkboxes"
                  tone="#8A9A5B"
                  isSelected={listKind === "check"}
                  onPress={() => setListKind("check")}
                />
                <OptionChoiceRow
                  label="Bulleted list"
                  detail="Rows with bullet points"
                  tone="#DFAE73"
                  isSelected={listKind === "bullet"}
                  onPress={() => setListKind("bullet")}
                />
              </View>
            )}
            {listItems.map((listItem, index) => {
              let shiftDirection: -1 | 0 | 1 = 0;
              if (draggingItemId && listItem.id !== draggingItemId) {
                if (draggingIndex < dragOverIndex && index > draggingIndex && index <= dragOverIndex) {
                  shiftDirection = -1;
                } else if (draggingIndex > dragOverIndex && index >= dragOverIndex && index < draggingIndex) {
                  shiftDirection = 1;
                }
              }

              return (
                <ListItemRow
                  key={listItem.id}
                  listItem={listItem}
                  indentMarginLeft={Math.min(listItem.indentLevel ?? 0, MAX_LIST_INDENT_LEVEL) * spacing.lg}
                  isDragging={draggingItemId === listItem.id}
                  isDragActive={draggingItemId !== null}
                  shiftDirection={shiftDirection}
                  canIndent={index > 0 && (listItem.indentLevel ?? 0) < MAX_LIST_INDENT_LEVEL}
                  canOutdent={(listItem.indentLevel ?? 0) > 0}
                  colors={colors}
                  styles={styles}
                  registerInputRef={(el) => {
                    if (el) listInputRefs.current.set(listItem.id, el);
                    else listInputRefs.current.delete(listItem.id);
                  }}
                  onChangeText={(text) => updateListItem(listItem.id, { text })}
                  onToggleChecked={() => updateListItem(listItem.id, { checked: !listItem.checked })}
                  onSubmitEditing={() => {
                    const newId = insertListItemAfter(listItem.id);
                    requestAnimationFrame(() => listInputRefs.current.get(newId)?.focus());
                  }}
                  onIndent={() => indentListItem(listItem.id)}
                  onOutdent={() => outdentListItem(listItem.id)}
                  onRemove={() => removeListItem(listItem.id)}
                  onDragStart={() => startListItemDrag(listItem.id, index)}
                  onDragUpdate={(translationY) => updateListItemDrag(index, translationY)}
                  onDragEnd={() => endListItemDrag(index)}
                />
              );
            })}
            <View style={styles.listButtons}>
              <AppButton label="Add row" variant="secondary" onPress={addListItem} style={styles.listButton} />
            </View>
          </View>
        )}

        {!!type && isMediaItemType(type) && (
          <MediaCollectionPicker
            items={mediaItems}
            onChange={setMediaItems}
            style={styles.button}
          />
        )}

        {((!!type && isMediaItemType(type)) || sourceUrl.trim().length > 0) && (
          <>
            <Text style={styles.label}>Source URL</Text>
            <TextInput
              style={styles.input}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="Original post URL"
              placeholderTextColor={colors.muted}
            />
          </>
        )}

        {!!type && isMediaItemType(type) && sharedText.trim().length > 0 && (
          <>
            <Text style={styles.label}>Shared text</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={sharedText}
              onChangeText={setSharedText}
              placeholder="Caption or shared text"
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
            />
          </>
        )}

        <Text style={styles.section}>Folder</Text>
        <FolderPickerField folders={folderPickerFolders} selectedFolderId={folderId} onSelectFolder={setFolderId} />

        {visibleTagGroups.length > 0 && (
          <>
            <Text style={styles.section}>Tags</Text>
            <View style={styles.tagsCard}>
              {visibleTagGroups.map((group) => {
                const groupOptions = tagOptions
                  .filter((option) => option.groupId === group.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder);

                if (group.selectionMode === "single") {
                  const selectedOption = groupOptions.find((option) => tagOptionIds.includes(option.id));
                  return (
                    <View key={group.id}>
                      <Text style={styles.tagGroupLabel}>{group.name}</Text>
                      <View style={styles.tagChipRow}>
                        {selectedOption ? (
                          <TagChip
                            label={selectedOption.name}
                            color={selectedOption.color}
                            onPress={() => setOpenSingleSelectGroupId(group.id)}
                          />
                        ) : (
                          <AppButton
                            label="+ Add"
                            variant="secondary"
                            onPress={() => setOpenSingleSelectGroupId(group.id)}
                            style={styles.tagAddButton}
                          />
                        )}
                      </View>
                    </View>
                  );
                }

                const selectedOptions = groupOptions.filter((option) => tagOptionIds.includes(option.id));
                return (
                  <View key={group.id}>
                    <Text style={styles.tagGroupLabel}>{group.name}</Text>
                    <View style={styles.tagChipRow}>
                      {selectedOptions.map((option) => (
                        <TagChip key={option.id} label={option.name} color={option.color} />
                      ))}
                      <AppButton
                        label="+ Add"
                        variant="secondary"
                        onPress={() => setOpenMultiSelectGroupId(group.id)}
                        style={styles.tagAddButton}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <AppButton label={isSaving ? "Saving..." : "Save item"} onPress={save} disabled={isSaving} style={styles.button} />
        {isSaving && <ActivityIndicator size="large" style={styles.button} />}
      </ScrollView>

      <ChoiceSheet
        visible={openSingleSelectGroupId !== null}
        title={openSingleSelectGroup?.name ?? ""}
        options={openSingleSelectGroupOptions.map((option) => ({ value: option.id, label: option.name, tone: option.color }))}
        selectedValue={openSingleSelectSelectedId}
        onSelect={(value) => selectSingleOption(openSingleSelectGroupOptions.map((o) => o.id), value)}
        onClose={() => setOpenSingleSelectGroupId(null)}
      />
      <TagMultiSelectSheet
        visible={openMultiSelectGroupId !== null}
        title={openMultiSelectGroup?.name ?? ""}
        options={openMultiSelectGroup ? tagOptions.filter((option) => option.groupId === openMultiSelectGroup.id) : []}
        selectedOptionIds={tagOptionIds}
        allowInlineCreate={openMultiSelectGroup?.allowInlineCreate ?? false}
        onToggleOption={toggleMultiOption}
        onCreateOption={(name) => {
          if (openMultiSelectGroup) createAndSelectOption(openMultiSelectGroup.id, name);
        }}
        onClose={() => setOpenMultiSelectGroupId(null)}
      />
    </View>
  );
};
