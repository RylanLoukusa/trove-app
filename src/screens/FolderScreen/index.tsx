import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, Share, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { EmptyState } from "../../components/EmptyState";
import { FolderCard } from "../../components/FolderCard";
import { MediaCollectionDisplay } from "../../components/MediaCollectionDisplay";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { VideoPreview } from "../../components/VideoPreview";
import { RootStackParamList } from "../../navigation/types";
import { useWaitingList } from "../../storage/storage";
import { Folder, SavedItem } from "../../types/models";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { getFolderPatterns } from "../../utils/folderContext";
import { canAddChildFolder, getChildFolders, getFolderById, getFolderPath, getItemsInFolder } from "../../utils/folderTree";
import { pickRandomWaitingItem } from "../../utils/itemFilters";
import { getItemTypeLabel } from "../../utils/itemTypes";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Folder">;

type SubfolderRowProps = {
  child: Folder;
  count: number;
  onOpenFolder: (folderId: string) => void;
};

const SubfolderRow = React.memo(function SubfolderRow({ child, count, onOpenFolder }: SubfolderRowProps) {
  const onPress = useCallback(() => {
    onOpenFolder(child.id);
  }, [child.id, onOpenFolder]);

  return <FolderCard folder={child} count={count} onPress={onPress} />;
});

type FolderItemRowProps = {
  item: SavedItem;
  onOpenItemDetail: (itemId: string) => void;
  onToggleChecklistItem: (itemId: string, listItemId: string) => void;
};

const FolderItemRow = React.memo(function FolderItemRow({ item, onOpenItemDetail, onToggleChecklistItem }: FolderItemRowProps) {
  const onPress = useCallback(() => {
    onOpenItemDetail(item.id);
  }, [item.id, onOpenItemDetail]);

  const onPressOpenUrl = useCallback(() => {
    if (item.url) void Linking.openURL(item.url);
  }, [item.url]);
  const hasStoredMedia = !!item.mediaItems?.length || !!item.media?.storagePath || !!item.media?.tiktokUrl;
  const shouldShowAttachments = !!item.attachments?.length && !hasStoredMedia;

  return (
    <View style={styles.fullItemBlock}>
      <Text style={styles.fullItemSubheading}>{item.title}</Text>
      <View style={styles.fullItemCard}>
        <View style={styles.fullItemHeader}>
          <View style={styles.fullItemTitleGroup}>
            <Text style={styles.fullItemType}>{getItemTypeLabel(item.type).toUpperCase()}</Text>
          </View>
          <Pressable onPress={onPress} style={({ pressed }) => [styles.openItemButton, pressed && styles.openItemButtonPressed]}>
            <Text style={styles.openItemButtonText}>Open item</Text>
          </Pressable>
        </View>

        {!!item.url && (
          <Pressable onPress={onPressOpenUrl} style={({ pressed }) => [styles.fullItemLink, pressed && styles.fullItemLinkPressed]}>
            <Text numberOfLines={2} style={styles.fullItemLinkText}>{item.url}</Text>
          </Pressable>
        )}

        <MediaCollectionDisplay
          media={item.media}
          mediaItems={item.mediaItems}
          itemHeight={300}
          itemWidth={300}
          style={styles.fullItemMedia}
        />

        {!!item.description && <Text style={styles.fullItemDescription}>{item.description}</Text>}

        {item.type === "list" && !!item.listItems?.length && (
          <View style={styles.fullItemList}>
            {item.listItems.map((listItem) => (
              <View key={listItem.id} style={styles.fullItemListRow}>
                {listItem.kind === "check" ? (
                  <Pressable
                    accessibilityLabel={listItem.checked ? "Mark checklist item incomplete" : "Mark checklist item complete"}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!listItem.checked }}
                    onPress={() => onToggleChecklistItem(item.id, listItem.id)}
                    style={({ pressed }) => [styles.fullItemCheckbox, pressed && styles.fullItemCheckboxPressed]}
                  >
                    <Text style={styles.fullItemMarker}>{listItem.checked ? "☑" : "☐"}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.fullItemMarker, styles.fullItemBullet]}>•</Text>
                )}
                <Text style={[styles.fullItemListText, listItem.checked && styles.fullItemListTextDone]}>{listItem.text}</Text>
              </View>
            ))}
          </View>
        )}

        {shouldShowAttachments && (
          <View style={styles.fullItemAttachments}>
            {item.attachments?.map((attachment) =>
              attachment.mediaType === "image" ? (
                <Image key={attachment.id} source={{ uri: attachment.uri }} style={styles.fullItemAttachmentImage} />
              ) : (
                <VideoPreview key={attachment.id} uri={attachment.uri} style={styles.fullItemAttachmentVideo} />
              ),
            )}
          </View>
        )}

        <View style={styles.fullItemFooter}>
          <View style={styles.fullItemPills}>
            <Text style={styles.fullItemPill}>{item.status}</Text>
            <Text style={styles.fullItemPill}>{item.priority} priority</Text>
          </View>
          <Text numberOfLines={1} style={styles.fullItemTags}>{item.tags.join(", ") || "No tags"}</Text>
        </View>
      </View>
    </View>
  );
});

export const FolderScreen = ({ navigation, route }: Props) => {
  const { folders, items, updateItem, deleteFolder, canManageFolder, canEditFolderContent, canEditItem } = useWaitingList();
  const [showAllSubfolders, setShowAllSubfolders] = useState(false);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);

  const folder = getFolderById(folders, route.params.folderId);
  const subfolders = useMemo(() => (folder ? getChildFolders(folders, folder.id) : []), [folder, folders]);
  const visibleSubfolders = showAllSubfolders ? subfolders : subfolders.slice(0, 3);
  const hiddenSubfolderCount = subfolders.length - visibleSubfolders.length;
  const folderItems = useMemo(() => (folder ? getItemsInFolder(items, folder.id) : []), [folder, items]);
  const folderPatterns = useMemo(() => getFolderPatterns(folderItems), [folderItems]);
  const selectedPattern = folderPatterns.find((pattern) => pattern.id === selectedPatternId);
  const displayedItems = selectedPattern
    ? folderItems.filter((item) => selectedPattern.itemIds.includes(item.id))
    : folderItems;
  const canNestMore = folder ? canAddChildFolder(folders, folder.id) : false;
  const canManageCurrentFolder = folder ? canManageFolder(folder.id) : false;
  const canEditCurrentFolderContent = folder ? canEditFolderContent(folder.id) : false;

  const onBreadcrumbHome = useCallback(() => {
    navigation.navigate("Home");
  }, [navigation]);

  const onBreadcrumbFolder = useCallback(
    (folderId: string) => {
      navigation.navigate("Folder", { folderId });
    },
    [navigation],
  );

  const onOpenFolder = useCallback(
    (folderId: string) => {
      navigation.navigate("Folder", { folderId });
    },
    [navigation],
  );

  const onOpenItemDetail = useCallback(
    (itemId: string) => {
      navigation.navigate("ItemDetail", { itemId });
    },
    [navigation],
  );

  const onToggleChecklistItem = useCallback(
    (itemId: string, listItemId: string): void => {
      const currentItem = items.find((candidate) => candidate.id === itemId);
      if (!currentItem?.listItems) return;
      if (!canEditItem(itemId)) {
        Alert.alert("Cannot edit item", "You do not have permission to edit this item.");
        return;
      }

      const listItems = currentItem.listItems.map((listItem) =>
        listItem.id === listItemId && listItem.kind === "check"
          ? { ...listItem, checked: !listItem.checked }
          : listItem,
      );
      const checklistItems = listItems.filter((listItem) => listItem.kind === "check");
      const isChecklistComplete = checklistItems.length > 0 && checklistItems.every((listItem) => listItem.checked);

      updateItem(currentItem.id, {
        listItems,
        status: isChecklistComplete ? "done" : currentItem.status === "done" ? "waiting" : currentItem.status,
      });
    },
    [canEditItem, items, updateItem],
  );

  const onPressEditFolder = useCallback(() => {
    if (!folder || !canManageCurrentFolder) return;
    navigation.navigate("AddEditFolder", { folderId: folder.id });
  }, [canManageCurrentFolder, folder, navigation]);

  const onPressAddItem = useCallback(() => {
    if (!folder) return;
    if (!canEditCurrentFolderContent) {
      Alert.alert("Cannot add item", "You only have view access to this folder.");
      return;
    }
    navigation.navigate("AddEditItem", { folderId: folder.id });
  }, [canEditCurrentFolderContent, folder, navigation]);

  const onPressAddSubfolder = useCallback(() => {
    if (!folder || !canNestMore || !canManageCurrentFolder) return;
    navigation.navigate("AddEditFolder", { parentFolderId: folder.id });
  }, [canManageCurrentFolder, canNestMore, folder, navigation]);

  const onPressPickSomething = useCallback(() => {
    if (!folder) return;
    const picked = pickRandomWaitingItem(items, folders, folder.id);
    if (!picked) {
      Alert.alert("Nothing waiting here", "This folder does not have any waiting items to pick from.");
      return;
    }
    navigation.navigate("ItemDetail", { itemId: picked.id });
  }, [folder, folders, items, navigation]);

  const onPressManageAccess = useCallback(() => {
    if (!folder || !canManageCurrentFolder) return;
    navigation.navigate("ShareFolder", { folderId: folder.id });
  }, [canManageCurrentFolder, folder, navigation]);

  const onPressShare = useCallback(async (): Promise<void> => {
    if (!folder) return;
    const itemLines = folderItems.map((item) => `- ${item.title}`);
    const subfolderLines = subfolders.map((child) => `- ${child.icon ?? "📁"} ${child.name}`);
    const sections = [
      `${folder.icon ?? "📁"} ${folder.name}`,
      folder.purpose ?? "",
      subfolderLines.length ? `Subfolders:\n${subfolderLines.join("\n")}` : "",
      itemLines.length ? `Items:\n${itemLines.join("\n")}` : "",
    ].filter(Boolean);

    await Share.share({ message: sections.join("\n\n") });
  }, [folder, folderItems, subfolders]);

  const confirmDelete = useCallback((): void => {
    if (!folder || !canManageCurrentFolder) return;
    Alert.alert(
      "Delete folder?",
      "This recursively deletes nested subfolders and saved items inside this folder.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const result = await deleteFolder(folder.id);
              if (!result.ok) {
                Alert.alert("Could not delete folder", result.error ?? "Unable to delete uploaded media.");
                return;
              }
              navigation.navigate("Home");
            })();
          },
        },
      ],
    );
  }, [canManageCurrentFolder, deleteFolder, folder, navigation]);

  const onOpenMenu = useCallback((): void => {
    if (!folder) return;
    Alert.alert("Folder actions", folder.name, [
      ...(canManageCurrentFolder
        ? [
            { text: "Edit", onPress: onPressEditFolder },
            { text: "Manage access", onPress: onPressManageAccess },
          ]
        : []),
      { text: "Pick Something", onPress: onPressPickSomething },
      { text: "Share summary", onPress: () => void onPressShare() },
      ...(canManageCurrentFolder
        ? [{ text: "Delete folder", style: "destructive" as const, onPress: confirmDelete }]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  }, [canManageCurrentFolder, confirmDelete, folder, onPressEditFolder, onPressManageAccess, onPressPickSomething, onPressShare]);

  const onPressPattern = useCallback((patternId: string): void => {
    setSelectedPatternId((current) => (current === patternId ? null : patternId));
  }, []);

  if (!folder) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <EmptyState title="Folder not found" message="This folder may have been deleted." />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Breadcrumbs
          path={getFolderPath(folders, folder.id)}
          onHome={onBreadcrumbHome}
          onFolder={onBreadcrumbFolder}
        />

        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {folder.icon} {folder.name}
          </Text>
          <Pressable onPress={onOpenMenu} style={({ pressed }) => [styles.moreButton, pressed && styles.moreButtonPressed]}>
            <Text style={styles.moreButtonText}>More</Text>
          </Pressable>
        </View>
        {isSharedAccess(folder) && (
          <View style={styles.accessBadge}>
            <Text style={styles.accessBadgeText}>Shared · {accessRoleLabel(folder.accessRole)}</Text>
          </View>
        )}
        {!!folder.purpose && <Text style={styles.purpose}>{folder.purpose}</Text>}

        <View style={styles.actions}>
          <AppButton
            label={canEditCurrentFolderContent ? "Add item" : "View only"}
            onPress={onPressAddItem}
            style={styles.action}
            disabled={!canEditCurrentFolderContent}
          />
          <AppButton
            label={!canManageCurrentFolder ? "Owner only" : canNestMore ? "Add subfolder" : "Max depth reached"}
            variant="secondary"
            onPress={onPressAddSubfolder}
            style={styles.action}
            disabled={!canNestMore || !canManageCurrentFolder}
          />
        </View>

        <Text style={styles.section}>Subfolders</Text>
        {subfolders.length === 0 ? (
          <EmptyState
            title="No subfolders yet."
            message={canManageCurrentFolder ? "Create a subfolder to organize this list." : "No shared subfolders are visible here."}
          />
        ) : (
          <>
            {visibleSubfolders.map((child) => (
              <SubfolderRow
                key={child.id}
                child={child}
                count={items.filter((item) => item.folderId === child.id).length}
                onOpenFolder={onOpenFolder}
              />
            ))}
            {subfolders.length > 3 && (
              <Pressable
                onPress={() => setShowAllSubfolders((current) => !current)}
                style={({ pressed }) => [styles.showAllSubfolders, pressed && styles.showAllSubfoldersPressed]}
              >
                <Text style={styles.showAllSubfoldersText}>
                  {showAllSubfolders ? "Show fewer subfolders" : `Show all subfolders (${hiddenSubfolderCount} more)`}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {folderPatterns.length > 0 && (
          <>
            <Text style={styles.section}>Patterns</Text>
            <View style={styles.patternGrid}>
              {folderPatterns.map((pattern) => {
                const isSelected = selectedPattern?.id === pattern.id;
                return (
                  <Pressable
                    key={pattern.id}
                    onPress={() => onPressPattern(pattern.id)}
                    style={({ pressed }) => [
                      styles.patternChip,
                      isSelected && styles.patternChipSelected,
                      pressed && styles.patternChipPressed,
                    ]}
                  >
                    <Text style={[styles.patternLabel, isSelected && styles.patternLabelSelected]}>{pattern.label}</Text>
                    <Text style={[styles.patternDetail, isSelected && styles.patternDetailSelected]}>{pattern.itemIds.length}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.section}>{selectedPattern ? selectedPattern.label : "Items"}</Text>
        {!!selectedPattern && <Text style={styles.selectedPatternDetail}>{selectedPattern.detail}</Text>}
        {folderItems.length === 0 ? (
          <EmptyState
            title="No items here yet."
            message="Add a note, list, link, or media item to this folder."
          />
        ) : displayedItems.length === 0 ? (
          <EmptyState
            title="No matches here."
            message="Try another pattern or clear the current one."
          />
        ) : (
          displayedItems.map((item) => (
            <FolderItemRow
              key={item.id}
              item={item}
              onOpenItemDetail={onOpenItemDetail}
              onToggleChecklistItem={onToggleChecklistItem}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};
