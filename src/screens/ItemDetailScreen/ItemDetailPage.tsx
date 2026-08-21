import React, { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Plus } from "lucide-react-native";
import { ChoiceSheet } from "../../components/ChoiceSheet";
import { CommentThread } from "../../components/CommentThread";
import { MediaCollectionDisplay, resolveDisplayItems } from "../../components/MediaCollectionDisplay";
import { MediaFullscreenViewer } from "../../components/MediaFullscreenViewer";
import { MediaImage } from "../../components/MediaImage";
import { Section } from "../../components/Section";
import { TagChip } from "../../components/TagChip";
import { TagMultiSelectSheet } from "../../components/TagMultiSelectSheet";
import { VideoPreview } from "../../components/VideoPreview";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { spacing } from "../../theme/theme";
import { useTrove } from "../../storage/storage";
import type { SavedItem, TagOption } from "../../types/models";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { getFolderPathLabel } from "../../utils/folderTree";
import { bulletGlyphForIndent, getItemTypeLabel } from "../../utils/itemTypes";
import { requiresProForVideoPlayback } from "../../utils/limits";
import { createStyles } from "./styles";

type Props = {
  item: SavedItem;
  width: number;
  navigation: NativeStackScreenProps<RootStackParamList, "ItemDetail">["navigation"];
};

export const ItemDetailPage = ({ item, width, navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, tagGroups, tagOptions, updateItem, createTagOption, canEditItem } = useTrove();
  const { isPro } = useEntitlement();
  const canEditCurrentItem = canEditItem(item.id);
  const videoLocked = requiresProForVideoPlayback(isPro, item.accessRole);
  const { isShared: isFolderSharedByOwner } = useFolderShareStatus(item.folderId);
  const showComments = isSharedAccess(item) || isFolderSharedByOwner;
  const [openSingleSelectGroupId, setOpenSingleSelectGroupId] = useState<string | null>(null);
  const [openMultiSelectGroupId, setOpenMultiSelectGroupId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const sortedTagGroups = useMemo(() => [...tagGroups].sort((a, b) => a.sortOrder - b.sortOrder), [tagGroups]);

  const mediaDisplayItems = useMemo(() => resolveDisplayItems(item.media, item.mediaItems), [item]);

  const onPressToggleChecklistItem = useCallback(
    (listItemId: string): void => {
      if (!item.listItems || !canEditCurrentItem) return;

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
    if (item.url) void Linking.openURL(item.url);
  }, [item.url]);

  const onPressOpenSourceUrl = useCallback(() => {
    if (item.sourceUrl) void Linking.openURL(item.sourceUrl);
  }, [item.sourceUrl]);

  const onPressTag = useCallback(
    (tag: string) => {
      navigation.navigate("Search", { query: tag });
    },
    [navigation],
  );

  const toggleTagOption = useCallback(
    (optionId: string): void => {
      const nextIds = item.tagOptionIds.includes(optionId)
        ? item.tagOptionIds.filter((id) => id !== optionId)
        : [...item.tagOptionIds, optionId];
      updateItem(item.id, { tagOptionIds: nextIds });
    },
    [item, updateItem],
  );

  const createAndToggleTagOption = useCallback(
    (groupId: string, name: string): void => {
      const option = createTagOption({ groupId, name });
      updateItem(item.id, { tagOptionIds: [...item.tagOptionIds, option.id] });
    },
    [createTagOption, item, updateItem],
  );

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

  const commentsSection = showComments && (
    <Section hideHeader>
      <CommentThread targetType="item" targetId={item.id} style={styles.commentThread} />
    </Section>
  );

  return (
    <ScrollView style={[styles.scroll, { width }]} contentContainerStyle={styles.content}>
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
        mediaLabel={item.title}
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
              <MediaImage
                key={attachment.id}
                source={{ uri: attachment.uri }}
                style={styles.attachmentImage}
                accessibilityLabel={attachment.caption || `Photo attached to ${item.title}`}
              />
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

      {!canEditCurrentItem && <Text style={styles.readOnlyNote}>You have view-only access to this item.</Text>}

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
    </ScrollView>
  );
};
