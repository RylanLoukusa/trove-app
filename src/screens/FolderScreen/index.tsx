import React, { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { EllipsisVertical, Lock, Pencil, UserPlus } from "lucide-react-native";
import { AppButton } from "../../components/AppButton";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { CommentThread } from "../../components/CommentThread";
import { EmptyState } from "../../components/EmptyState";
import { FolderCard } from "../../components/FolderCard";
import { MediaCollectionDisplay } from "../../components/MediaCollectionDisplay";
import { MediaImage } from "../../components/MediaImage";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { SpotlightMessageCard, SpotlightOverlay, useSpotlightAnchor } from "../../components/SpotlightTour";
import { VideoPreview } from "../../components/VideoPreview";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { spacing } from "../../theme/theme";
import { Folder, SavedItem, TagOption } from "../../types/models";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { canAddChildFolder, getChildFolders, getFolderById, getFolderPath, getItemsInFolder } from "../../utils/folderTree";
import { bulletGlyphForIndent } from "../../utils/itemTypes";
import { requiresProForSharing } from "../../utils/limits";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Folder">;

type ScreenStyles = ReturnType<typeof createStyles>;

const FolderSkeleton = ({ styles }: { styles: ScreenStyles }) => (
  <ScreenSkeleton>
    <SkeletonBlock height={20} radius={10} width="58%" />
    <View style={styles.titleRow}>
      <SkeletonBlock height={38} radius={16} style={{ flex: 1 }} />
      <SkeletonBlock height={42} radius={21} width={82} />
    </View>
    <SkeletonText lineCount={2} lineWidths={["86%", "64%"]} />
    <View style={styles.actions}>
      <SkeletonBlock height={52} radius={16} style={styles.action} />
      <SkeletonBlock height={52} radius={16} style={styles.action} />
    </View>
    <SkeletonBlock height={24} radius={12} width="44%" style={styles.skeletonSection} />
    <SkeletonList
      count={3}
      renderItem={() => (
        <View style={styles.skeletonCard}>
          <SkeletonBlock height={24} radius={12} width={56} />
          <SkeletonText lineCount={2} lineWidths={["70%", "36%"]} style={styles.skeletonCardText} />
        </View>
      )}
    />
    <SkeletonBlock height={24} radius={12} width="32%" style={styles.skeletonSection} />
    <SkeletonList
      count={5}
      renderItem={() => (
        <View style={styles.skeletonFullItemCard}>
          <View style={styles.fullItemHeader}>
            <SkeletonText lineCount={1} lineWidths={["60%"]} style={styles.fullItemTitle} />
            <SkeletonBlock height={36} radius={18} width={36} />
          </View>
          <SkeletonBlock height={160} radius={14} style={styles.fullItemMedia} />
          <SkeletonText lineCount={3} lineWidths={["88%", "72%", "42%"]} style={styles.skeletonCardText} />
        </View>
      )}
    />
  </ScreenSkeleton>
);

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
  tagOptions: TagOption[];
  onOpenItemDetail: (itemId: string) => void;
  onToggleChecklistItem: (itemId: string, listItemId: string) => void;
  styles: ScreenStyles;
};

const FolderItemRow = React.memo(function FolderItemRow({ item, tagOptions, onOpenItemDetail, onToggleChecklistItem, styles }: FolderItemRowProps) {
  const assignedTags = item.tagOptionIds
    .map((tagOptionId) => tagOptions.find((option) => option.id === tagOptionId))
    .filter((option): option is TagOption => !!option);
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
      <View style={styles.fullItemCard}>
        <View style={styles.fullItemHeader}>
          <Text style={styles.fullItemTitle} numberOfLines={2}>{item.title}</Text>
          <Pressable
            accessibilityLabel="Open item"
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.openItemButton, pressed && styles.openItemButtonPressed]}
          >
            <Text style={styles.openItemButtonIcon}>›</Text>
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
              <View
                key={listItem.id}
                style={[styles.fullItemListRow, { marginLeft: Math.min(listItem.indentLevel ?? 0, 3) * spacing.lg }]}
              >
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
                  <Text style={[styles.fullItemMarker, styles.fullItemBullet]}>{bulletGlyphForIndent(listItem.indentLevel)}</Text>
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
                <MediaImage key={attachment.id} source={{ uri: attachment.uri }} style={styles.fullItemAttachmentImage} />
              ) : (
                <VideoPreview key={attachment.id} uri={attachment.uri} style={styles.fullItemAttachmentVideo} />
              ),
            )}
          </View>
        )}

        <View style={styles.fullItemFooter}>
          {assignedTags.length > 0 && (
            <View style={styles.fullItemPills}>
              {assignedTags.map((tag) => (
                <Text key={tag.id} style={[styles.fullItemPill, tag.color ? { color: tag.color } : undefined]}>
                  {tag.name}
                </Text>
              ))}
            </View>
          )}
          {assignedTags.length === 0 && <Text style={styles.fullItemTags}>No tags</Text>}
        </View>
      </View>
    </View>
  );
});

export const FolderScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items, tagOptions, updateItem, deleteFolder, canManageFolder, canEditFolderContent, canEditItem } = useTrove();
  const { isPro, presentPaywall } = useEntitlement();
  const [showAllSubfolders, setShowAllSubfolders] = useState(false);

  const folder = getFolderById(folders, route.params.folderId);
  const subfolders = useMemo(() => (folder ? getChildFolders(folders, folder.id) : []), [folder, folders]);
  const visibleSubfolders = showAllSubfolders ? subfolders : subfolders.slice(0, 3);
  const hiddenSubfolderCount = subfolders.length - visibleSubfolders.length;
  const folderItems = useMemo(() => (folder ? getItemsInFolder(items, folder.id) : []), [folder, items]);
  const canNestMore = folder ? canAddChildFolder(folders, folder.id) : false;
  const canManageCurrentFolder = folder ? canManageFolder(folder.id) : false;
  const canEditCurrentFolderContent = folder ? canEditFolderContent(folder.id) : false;
  const { isShared: isFolderSharedByOwner } = useFolderShareStatus(folder?.id);
  const showComments = isSharedAccess(folder) || isFolderSharedByOwner;
  const sharingLocked = requiresProForSharing(isPro);

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

      updateItem(currentItem.id, { listItems });
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

  const onPressManageAccess = useCallback(() => {
    if (!folder) return;
    if (requiresProForSharing(isPro)) {
      presentPaywall("sharing");
      return;
    }
    navigation.navigate("ShareFolder", { folderId: folder.id });
  }, [folder, isPro, navigation, presentPaywall]);

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
      { text: "Share summary", onPress: () => void onPressShare() },
      ...(canManageCurrentFolder ? [{ text: "Get shareable link", onPress: onPressManageAccess }] : []),
      ...(canManageCurrentFolder
        ? [{ text: "Delete folder", style: "destructive" as const, onPress: confirmDelete }]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  }, [canManageCurrentFolder, confirmDelete, folder, onPressManageAccess, onPressShare]);

  const { currentStep, stepNumber, totalSteps, stepTargetFolderId, next, skip, reportFocus } = useOnboardingTour();
  const isTourStepHere = currentStep?.screen === "Folder" && !!folder && folder.id === stepTargetFolderId;
  const isSpotlightStepHere = isTourStepHere && currentStep?.mode !== "message";
  const isMessageStepHere = isTourStepHere && currentStep?.mode === "message";
  const { scrollRef, onScroll, registerAnchor, rect } = useSpotlightAnchor(
    isSpotlightStepHere ? currentStep?.anchorKey : undefined,
  );

  useFocusEffect(
    useCallback(() => {
      reportFocus({ screen: "Folder", folderId: folder?.id ?? null, parentFolderId: folder?.parentFolderId ?? null });
    }, [folder, reportFocus]),
  );

  if (!isReady) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <FolderSkeleton styles={styles} />
        </ScrollView>
      </View>
    );
  }

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
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Breadcrumbs
          path={getFolderPath(folders, folder.id)}
          onHome={onBreadcrumbHome}
          onFolder={onBreadcrumbFolder}
        />

        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {folder.icon} {folder.name}
          </Text>
          <View style={styles.headerActions}>
            {canManageCurrentFolder && (
              <Pressable
                accessibilityLabel="Edit folder"
                accessibilityRole="button"
                onPress={onPressEditFolder}
                style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}
              >
                <Pencil color={colors.accentDark} size={18} strokeWidth={2.4} />
              </Pressable>
            )}
            <View style={styles.headerIconButtonWrapper}>
              <Pressable
                accessibilityLabel={
                  sharingLocked ? "Share folder (Pro required)" : canManageCurrentFolder ? "Manage access" : "View access"
                }
                accessibilityRole="button"
                onPress={onPressManageAccess}
                style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}
              >
                <UserPlus color={colors.accentDark} size={18} strokeWidth={2.4} />
              </Pressable>
              {sharingLocked && (
                <View style={styles.headerIconLockBadge}>
                  <Lock size={11} color={colors.surface} />
                </View>
              )}
            </View>
            <Pressable
              accessibilityLabel="More folder actions"
              accessibilityRole="button"
              onPress={onOpenMenu}
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}
            >
              <EllipsisVertical color={colors.muted} size={18} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>
        {isSharedAccess(folder) && (
          <View style={styles.accessBadge}>
            <Text style={styles.accessBadgeText}>Shared · {accessRoleLabel(folder.accessRole)}</Text>
          </View>
        )}
        {!!folder.purpose && <Text style={styles.purpose}>{folder.purpose}</Text>}

        <View style={styles.actions}>
          <View style={styles.action} ref={registerAnchor("add-item")}>
            <AppButton
              label={canEditCurrentFolderContent ? "Add item" : "View only"}
              onPress={onPressAddItem}
              disabled={!canEditCurrentFolderContent}
            />
          </View>
          <View style={styles.action} ref={registerAnchor("add-subfolder")}>
            <AppButton
              label={!canManageCurrentFolder ? "Owner only" : canNestMore ? "Add subfolder" : "Max depth reached"}
              variant="secondary"
              onPress={onPressAddSubfolder}
              disabled={!canNestMore || !canManageCurrentFolder}
            />
          </View>
        </View>

        <View ref={registerAnchor("subfolders", spacing.lg, spacing.xs)}>
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
        </View>

        <Text style={styles.section}>Items</Text>
        {folderItems.length === 0 ? (
          <EmptyState
            title="No items here yet."
            message="Add a note, list, link, or media item to this folder."
          />
        ) : (
          folderItems.map((item) => (
            <FolderItemRow
              key={item.id}
              item={item}
              tagOptions={tagOptions}
              onOpenItemDetail={onOpenItemDetail}
              onToggleChecklistItem={onToggleChecklistItem}
              styles={styles}
            />
          ))
        )}

        {showComments && <CommentThread targetType="folder" targetId={folder.id} />}
      </ScrollView>
      </KeyboardAvoidingView>
      {isSpotlightStepHere && currentStep && rect ? (
        <SpotlightOverlay
          rect={rect}
          title={currentStep.title}
          body={currentStep.body}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          mode={currentStep.mode === "info" ? "info" : "action"}
          placement={currentStep.preferredPlacement}
          onNext={next}
          onSkip={skip}
        />
      ) : null}
      {isMessageStepHere && currentStep ? (
        <SpotlightMessageCard title={currentStep.title} body={currentStep.body} primaryLabel="Next" onPrimary={next} onSkip={skip} />
      ) : null}
    </View>
  );
};
