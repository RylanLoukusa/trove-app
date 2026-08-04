import React, { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { ChoiceSheet } from "../../components/ChoiceSheet";
import { CommentThread } from "../../components/CommentThread";
import { MediaCollectionDisplay, resolveDisplayItems } from "../../components/MediaCollectionDisplay";
import { MediaFullscreenViewer } from "../../components/MediaFullscreenViewer";
import { MediaImage } from "../../components/MediaImage";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { Section } from "../../components/Section";
import { TagChip } from "../../components/TagChip";
import { TagMultiSelectSheet } from "../../components/TagMultiSelectSheet";
import { VideoPreview } from "../../components/VideoPreview";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { spacing } from "../../theme/theme";
import { useTrove } from "../../storage/storage";
import type { TagOption } from "../../types/models";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { getFolderPathLabel, getItemsInFolder } from "../../utils/folderTree";
import { bulletGlyphForIndent, getItemTypeLabel } from "../../utils/itemTypes";
import { requiresProForVideoPlayback } from "../../utils/limits";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ItemDetail">;

type ScreenStyles = ReturnType<typeof createStyles>;

const ItemDetailSkeleton = ({ styles }: { styles: ScreenStyles }) => (
  <ScreenSkeleton>
    <SkeletonBlock height={42} radius={21} />
    <SkeletonBlock height={14} radius={7} width="28%" />
    <SkeletonText lineCount={2} lineWidths={["88%", "58%"]} lineHeight={30} />
    <SkeletonBlock height={18} radius={9} width="52%" />
    <SkeletonBlock height={260} radius={18} style={styles.mediaPreview} />
    <SkeletonText lineCount={4} lineWidths={["94%", "86%", "76%", "42%"]} style={styles.skeletonSection} />
    <View style={styles.row}>
      <SkeletonBlock height={38} radius={19} width={92} />
      <SkeletonBlock height={38} radius={19} width={128} />
    </View>
    <SkeletonBlock height={20} radius={10} width="28%" style={styles.skeletonSection} />
    <SkeletonText lineCount={1} lineWidths={["48%"]} />
    <SkeletonList
      count={3}
      renderItem={() => <SkeletonBlock height={52} radius={16} style={styles.button} />}
    />
  </ScreenSkeleton>
);

export const ItemDetailScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items, tagGroups, tagOptions, updateItem, createTagOption, deleteItem, canEditItem } = useTrove();
  const { isPro } = useEntitlement();
  const item = items.find((candidate) => candidate.id === route.params.itemId);
  const canEditCurrentItem = item ? canEditItem(item.id) : false;
  const videoLocked = requiresProForVideoPlayback(isPro, item?.accessRole);
  const [openSingleSelectGroupId, setOpenSingleSelectGroupId] = useState<string | null>(null);
  const [openMultiSelectGroupId, setOpenMultiSelectGroupId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const sortedTagGroups = useMemo(() => [...tagGroups].sort((a, b) => a.sortOrder - b.sortOrder), [tagGroups]);

  const folderItems = useMemo(
    () => (item ? getItemsInFolder(items, item.folderId) : []),
    [item, items],
  );
  const itemIndex = item ? folderItems.findIndex((candidate) => candidate.id === item.id) : -1;
  const previousItem = itemIndex > 0 ? folderItems[itemIndex - 1] : undefined;
  const nextItem = itemIndex >= 0 && itemIndex < folderItems.length - 1 ? folderItems[itemIndex + 1] : undefined;
  const mediaDisplayItems = useMemo(
    () => (item ? resolveDisplayItems(item.media, item.mediaItems) : []),
    [item],
  );

  const openAdjacentItem = useCallback(
    (itemId?: string): void => {
      if (!itemId) return;
      navigation.replace("ItemDetail", { itemId });
    },
    [navigation],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-70, 70])
        .failOffsetY([-45, 45])
        .onEnd((event) => {
          if (event.translationX > 0) {
            runOnJS(openAdjacentItem)(previousItem?.id);
          } else {
            runOnJS(openAdjacentItem)(nextItem?.id);
          }
        }),
    [nextItem?.id, openAdjacentItem, previousItem?.id],
  );

  const onPressEdit = useCallback(() => {
    if (!item || !canEditCurrentItem) return;
    navigation.navigate("AddEditItem", { itemId: item.id });
  }, [canEditCurrentItem, item, navigation]);

  const onPressToggleChecklistItem = useCallback(
    (listItemId: string): void => {
      if (!item?.listItems || !canEditCurrentItem) return;

      const listItems = item.listItems.map((listItem) =>
        listItem.id === listItemId && listItem.kind === "check"
          ? { ...listItem, checked: !listItem.checked }
          : listItem,
      );

      updateItem(item.id, { listItems });
    },
    [canEditCurrentItem, item, updateItem],
  );

  const onPressOpenUrl = useCallback(() => {
    if (item?.url) void Linking.openURL(item.url);
  }, [item?.url]);

  const onPressOpenSourceUrl = useCallback(() => {
    if (item?.sourceUrl) void Linking.openURL(item.sourceUrl);
  }, [item?.sourceUrl]);

  const onPressTag = useCallback(
    (tag: string) => {
      navigation.navigate("Search", { query: tag });
    },
    [navigation],
  );

  const toggleTagOption = useCallback(
    (optionId: string): void => {
      if (!item) return;
      const nextIds = item.tagOptionIds.includes(optionId)
        ? item.tagOptionIds.filter((id) => id !== optionId)
        : [...item.tagOptionIds, optionId];
      updateItem(item.id, { tagOptionIds: nextIds });
    },
    [item, updateItem],
  );

  const createAndToggleTagOption = useCallback(
    (groupId: string, name: string): void => {
      if (!item) return;
      const option = createTagOption({ groupId, name });
      updateItem(item.id, { tagOptionIds: [...item.tagOptionIds, option.id] });
    },
    [createTagOption, item, updateItem],
  );

  const confirmDelete = useCallback((): void => {
    if (!item || !canEditCurrentItem) return;
    Alert.alert("Delete item?", "This removes it from Trove.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await deleteItem(item.id);
            if (!result.ok) {
              Alert.alert("Could not delete item", result.error ?? "Unable to delete uploaded media.");
              return;
            }
            navigation.navigate("Home");
          })();
        },
      },
    ]);
  }, [canEditCurrentItem, deleteItem, item, navigation]);

  if (!isReady) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <ItemDetailSkeleton styles={styles} />
        </ScrollView>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <Text style={styles.notFoundText}>Item not found</Text>
        </View>
      </View>
    );
  }

  const hasStoredMedia = !!item.mediaItems?.length || !!item.media?.storagePath || !!item.media?.tiktokUrl;
  const shouldShowAttachments = !!item.attachments?.length && !hasStoredMedia;

  const selectSingleTagOption = (groupOptions: TagOption[], optionId: string): void => {
    updateItem(item.id, {
      tagOptionIds: [...item.tagOptionIds.filter((id) => !groupOptions.some((option) => option.id === id)), optionId],
    });
  };

  const openSingleSelectGroup = sortedTagGroups.find((group) => group.id === openSingleSelectGroupId);
  const openSingleSelectGroupOptions = openSingleSelectGroup
    ? tagOptions.filter((option) => option.groupId === openSingleSelectGroup.id)
    : [];
  const openSingleSelectSelectedId =
    item.tagOptionIds.find((id) => openSingleSelectGroupOptions.some((option) => option.id === id)) ?? "";

  const openMultiSelectGroup = sortedTagGroups.find((group) => group.id === openMultiSelectGroupId);
  const openMultiSelectGroupOptions = openMultiSelectGroup
    ? tagOptions.filter((option) => option.groupId === openMultiSelectGroup.id)
    : [];

  const tagGroupClusters = sortedTagGroups
    .map((group) => {
      const groupOptions = tagOptions.filter((option) => option.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);

      if (group.selectionMode === "single") {
        if (groupOptions.length === 0) return null;
        const selectedOption = groupOptions.find((option) => item.tagOptionIds.includes(option.id));
        return (
          <View key={group.id}>
            <Text style={styles.tagGroupLabel}>{group.name}</Text>
            <View style={styles.tagRow}>
              {selectedOption ? (
                <TagChip
                  label={selectedOption.name}
                  color={selectedOption.color}
                  onPress={canEditCurrentItem ? () => setOpenSingleSelectGroupId(group.id) : undefined}
                />
              ) : canEditCurrentItem ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${group.name.toLowerCase()}`}
                  hitSlop={8}
                  onPress={() => setOpenSingleSelectGroupId(group.id)}
                  style={({ pressed }) => [styles.sectionAction, pressed && styles.sectionActionPressed]}
                >
                  <Plus size={16} color={colors.accentDark} strokeWidth={2.6} />
                </Pressable>
              ) : (
                <Text style={styles.meta}>Not set</Text>
              )}
            </View>
          </View>
        );
      }

      const assignedOptions = item.tagOptionIds
        .map((id) => groupOptions.find((option) => option.id === id))
        .filter((option): option is TagOption => !!option);

      return (
        <View key={group.id}>
          <Text style={styles.tagGroupLabel}>{group.name}</Text>
          <View style={styles.tagRow}>
            {assignedOptions.map((option) => (
              <TagChip key={option.id} label={option.name} color={option.color} onPress={() => onPressTag(option.name)} />
            ))}
            {canEditCurrentItem && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${group.name.toLowerCase()}`}
                hitSlop={8}
                onPress={() => setOpenMultiSelectGroupId(group.id)}
                style={({ pressed }) => [styles.sectionAction, pressed && styles.sectionActionPressed]}
              >
                <Plus size={16} color={colors.accentDark} strokeWidth={2.6} />
              </Pressable>
            )}
          </View>
        </View>
      );
    })
    .filter((cluster): cluster is React.JSX.Element => cluster !== null);

  const tagsSection = tagGroupClusters.length > 0 && (
    <Section title="Tags">
      <View style={styles.tagGroupsList}>{tagGroupClusters}</View>
    </Section>
  );

  const commentsSection = (
    <Section hideHeader>
      <CommentThread targetType="item" targetId={item.id} style={styles.commentThread} />
    </Section>
  );

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        navigation={navigation}
        rightActions={
          canEditCurrentItem ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit item"
                hitSlop={8}
                onPress={onPressEdit}
                style={({ pressed }) => [styles.topBarAction, pressed && styles.topBarActionPressed]}
              >
                <Pencil size={22} color={colors.accentDark} strokeWidth={2.4} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete item"
                hitSlop={8}
                onPress={confirmDelete}
                style={({ pressed }) => [styles.topBarAction, pressed && styles.topBarActionPressed]}
              >
                <Trash2 size={22} color={colors.danger} strokeWidth={2.4} />
              </Pressable>
            </>
          ) : undefined
        }
      />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <GestureDetector gesture={panGesture}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {folderItems.length > 1 && (
            <View style={styles.itemNav}>
              <Pressable
                disabled={!previousItem}
                onPress={() => openAdjacentItem(previousItem?.id)}
                style={({ pressed }) => [
                  styles.itemNavButton,
                  !previousItem && styles.itemNavButtonDisabled,
                  pressed && previousItem && styles.itemNavButtonPressed,
                ]}
              >
                <Text style={[styles.itemNavText, !previousItem && styles.itemNavTextDisabled]}>‹ Previous</Text>
              </Pressable>
              <Text style={styles.itemNavCount}>
                {itemIndex + 1} / {folderItems.length}
              </Text>
              <Pressable
                disabled={!nextItem}
                onPress={() => openAdjacentItem(nextItem?.id)}
                style={({ pressed }) => [
                  styles.itemNavButton,
                  !nextItem && styles.itemNavButtonDisabled,
                  pressed && nextItem && styles.itemNavButtonPressed,
                ]}
              >
                <Text style={[styles.itemNavText, !nextItem && styles.itemNavTextDisabled]}>Next ›</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.type}>{getItemTypeLabel(item.type).toUpperCase()}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.path}>{getFolderPathLabel(folders, item.folderId)}</Text>
          {isSharedAccess(item) && (
            <View style={styles.accessBadge}>
              <Text style={styles.accessBadgeText}>Shared · {accessRoleLabel(item.accessRole)}</Text>
            </View>
          )}

          {!!item.url && (
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>Link preview</Text>
              <Text style={styles.url} onPress={onPressOpenUrl}>
                {item.url}
              </Text>
            </View>
          )}

          {!!item.sourceUrl && item.sourceUrl !== item.url && (
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>
                {item.sourcePlatform ? `Original on ${item.sourcePlatform}` : "Original source"}
              </Text>
              <Text style={styles.url} onPress={onPressOpenSourceUrl}>
                {item.sourceUrl}
              </Text>
            </View>
          )}

          <MediaCollectionDisplay
            media={item.media}
            mediaItems={item.mediaItems}
            itemHeight={400}
            itemWidth={320}
            onPressItem={setViewerIndex}
            videoLocked={videoLocked}
            style={styles.mediaPreview}
          />

          {(!!item.description || !!item.sharedText) && (
            <View style={styles.contentCard}>
              {!!item.description && <Text style={styles.description}>{item.description}</Text>}
              {!!item.sharedText && (
                <Text style={[styles.description, !!item.description && styles.descriptionSecondary]}>
                  {item.sharedText}
                </Text>
              )}
            </View>
          )}

          {item.type === "list" && !!item.listItems?.length && (
            <View style={styles.listBlock}>
              {item.listItems.map((listItem) => (
                <View key={listItem.id} style={[styles.listRow, { marginLeft: Math.min(listItem.indentLevel ?? 0, 3) * spacing.lg }]}>
                  {listItem.kind === "check" ? (
                    <Pressable
                      accessibilityLabel={listItem.checked ? "Mark checklist item incomplete" : "Mark checklist item complete"}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!listItem.checked }}
                      onPress={() => onPressToggleChecklistItem(listItem.id)}
                      style={({ pressed }) => [styles.listCheckbox, pressed && styles.listCheckboxPressed]}
                    >
                      <Text style={styles.listMarker}>{listItem.checked ? "☑" : "☐"}</Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.listMarker, styles.listBullet]}>{bulletGlyphForIndent(listItem.indentLevel)}</Text>
                  )}
                  <Text style={[styles.listText, listItem.checked && styles.listTextDone]}>{listItem.text}</Text>
                </View>
              ))}
            </View>
          )}

          {shouldShowAttachments && (
            <View style={styles.attachmentBlock}>
              {item.attachments?.map((attachment) =>
                attachment.mediaType === "image" ? (
                  <MediaImage key={attachment.id} source={{ uri: attachment.uri }} style={styles.attachmentImage} />
                ) : (
                  <VideoPreview key={attachment.id} uri={attachment.uri} style={styles.attachmentVideo} />
                ),
              )}
            </View>
          )}

          <Text style={styles.createdAt}>{new Date(item.createdAt).toLocaleString()}</Text>

          {isSharedAccess(item) ? (
            <>
              {commentsSection}
              {tagsSection}
            </>
          ) : (
            <>
              {tagsSection}
              {commentsSection}
            </>
          )}

          {!canEditCurrentItem && (
            <Text style={styles.readOnlyNote}>You have view-only access to this item.</Text>
          )}
          </ScrollView>
        </GestureDetector>
      </KeyboardAvoidingView>

      <ChoiceSheet
        visible={openSingleSelectGroupId !== null}
        title={openSingleSelectGroup?.name ?? ""}
        options={openSingleSelectGroupOptions.map((option) => ({ value: option.id, label: option.name, tone: option.color }))}
        selectedValue={openSingleSelectSelectedId}
        onSelect={(value) => selectSingleTagOption(openSingleSelectGroupOptions, value)}
        onClose={() => setOpenSingleSelectGroupId(null)}
      />
      <TagMultiSelectSheet
        visible={openMultiSelectGroupId !== null}
        title={openMultiSelectGroup?.name ?? ""}
        options={openMultiSelectGroupOptions}
        selectedOptionIds={item.tagOptionIds}
        allowInlineCreate={openMultiSelectGroup?.allowInlineCreate ?? false}
        onToggleOption={toggleTagOption}
        onCreateOption={(name) => {
          if (openMultiSelectGroup) createAndToggleTagOption(openMultiSelectGroup.id, name);
        }}
        onClose={() => setOpenMultiSelectGroupId(null)}
      />
      <MediaFullscreenViewer
        visible={viewerIndex !== null}
        items={mediaDisplayItems}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        videoLocked={videoLocked}
      />
    </View>
  );
};
