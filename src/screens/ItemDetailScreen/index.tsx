import React, { useCallback, useMemo, useRef } from "react";
import { Alert, GestureResponderEvent, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { CommentThread } from "../../components/CommentThread";
import { MediaCollectionDisplay } from "../../components/MediaCollectionDisplay";
import { MediaImage } from "../../components/MediaImage";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { VideoPreview } from "../../components/VideoPreview";
import { RootStackParamList } from "../../navigation/types";
import { useWaitingList } from "../../storage/storage";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { getRelatedItems } from "../../utils/folderContext";
import { getFolderPathLabel, getItemsInFolder } from "../../utils/folderTree";
import { getItemTypeLabel } from "../../utils/itemTypes";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ItemDetail">;

const ItemDetailSkeleton = () => (
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
  const { folders, isReady, items, updateItem, deleteItem, canEditItem } = useWaitingList();
  const item = items.find((candidate) => candidate.id === route.params.itemId);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const canEditCurrentItem = item ? canEditItem(item.id) : false;

  const folderItems = useMemo(
    () => (item ? getItemsInFolder(items, item.folderId) : []),
    [item, items],
  );
  const itemIndex = item ? folderItems.findIndex((candidate) => candidate.id === item.id) : -1;
  const previousItem = itemIndex > 0 ? folderItems[itemIndex - 1] : undefined;
  const nextItem = itemIndex >= 0 && itemIndex < folderItems.length - 1 ? folderItems[itemIndex + 1] : undefined;
  const relatedItems = useMemo(
    () => (item ? getRelatedItems(item, folderItems) : []),
    [folderItems, item],
  );

  const openAdjacentItem = useCallback(
    (itemId?: string): void => {
      if (!itemId) return;
      navigation.replace("ItemDetail", { itemId });
    },
    [navigation],
  );

  const onTouchStart = useCallback((event: GestureResponderEvent): void => {
    const { pageX, pageY } = event.nativeEvent;
    swipeStartRef.current = { x: pageX, y: pageY };
  }, []);

  const onTouchEnd = useCallback(
    (event: GestureResponderEvent): void => {
      if (!swipeStartRef.current) return;
      const { pageX, pageY } = event.nativeEvent;
      const deltaX = pageX - swipeStartRef.current.x;
      const deltaY = pageY - swipeStartRef.current.y;
      swipeStartRef.current = null;

      if (Math.abs(deltaX) < 70 || Math.abs(deltaY) > 45) return;
      if (deltaX > 0) {
        openAdjacentItem(previousItem?.id);
      } else {
        openAdjacentItem(nextItem?.id);
      }
    },
    [nextItem?.id, openAdjacentItem, previousItem?.id],
  );

  const onPressEdit = useCallback(() => {
    if (!item || !canEditCurrentItem) return;
    navigation.navigate("AddEditItem", { itemId: item.id });
  }, [canEditCurrentItem, item, navigation]);

  const onPressMarkDone = useCallback(() => {
    if (!item || !canEditCurrentItem) return;
    updateItem(item.id, { status: "done" });
  }, [canEditCurrentItem, item, updateItem]);

  const onPressToggleChecklistItem = useCallback(
    (listItemId: string): void => {
      if (!item?.listItems || !canEditCurrentItem) return;

      const listItems = item.listItems.map((listItem) =>
        listItem.id === listItemId && listItem.kind === "check"
          ? { ...listItem, checked: !listItem.checked }
          : listItem,
      );
      const checklistItems = listItems.filter((listItem) => listItem.kind === "check");
      const isChecklistComplete = checklistItems.length > 0 && checklistItems.every((listItem) => listItem.checked);

      updateItem(item.id, {
        listItems,
        status: isChecklistComplete ? "done" : item.status === "done" ? "waiting" : item.status,
      });
    },
    [canEditCurrentItem, item, updateItem],
  );

  const onPressOpenUrl = useCallback(() => {
    if (item?.url) void Linking.openURL(item.url);
  }, [item?.url]);

  const onPressOpenSourceUrl = useCallback(() => {
    if (item?.sourceUrl) void Linking.openURL(item.sourceUrl);
  }, [item?.sourceUrl]);

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
          <ItemDetailSkeleton />
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

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
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
          style={styles.mediaPreview}
        />

        {!!item.description && <Text style={styles.description}>{item.description}</Text>}
        {!!item.sharedText && <Text style={styles.description}>{item.sharedText}</Text>}

        {item.type === "list" && !!item.listItems?.length && (
          <View style={styles.listBlock}>
            {item.listItems.map((listItem) => (
              <View key={listItem.id} style={styles.listRow}>
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
                  <Text style={[styles.listMarker, styles.listBullet]}>•</Text>
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

        <View style={styles.row}>
          <Text style={styles.pill}>{item.status}</Text>
          <Text style={styles.pill}>{item.priority} priority</Text>
        </View>

        <Text style={styles.section}>Tags</Text>
        <Text style={styles.meta}>{item.tags.join(", ") || "No tags"}</Text>

        <Text style={styles.section}>Created</Text>
        <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>

        {relatedItems.length > 0 && (
          <>
            <Text style={styles.section}>Related Here</Text>
            {relatedItems.map((match) => (
              <Pressable
                key={match.item.id}
                onPress={() => openAdjacentItem(match.item.id)}
                style={({ pressed }) => [styles.relatedCard, pressed && styles.relatedCardPressed]}
              >
                <Text style={styles.relatedTitle}>{match.item.title}</Text>
                <Text style={styles.relatedMeta}>{match.reasons.join(" · ")}</Text>
              </Pressable>
            ))}
          </>
        )}

        <CommentThread targetType="item" targetId={item.id} />

        {canEditCurrentItem ? (
          <>
            <AppButton label="Edit / Move" onPress={onPressEdit} style={styles.button} />
            <AppButton label="Mark as done" variant="secondary" onPress={onPressMarkDone} style={styles.button} />
            <AppButton label="Delete item" variant="danger" onPress={confirmDelete} style={styles.button} />
          </>
        ) : (
          <Text style={styles.readOnlyNote}>You have view-only access to this item.</Text>
        )}
      </ScrollView>
    </View>
  );
};
