import React, { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Share, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ellipsis, FolderPlus, Pencil, Share2, Trash2, Users } from "lucide-react-native";

import { SkeletonBlock, SkeletonText } from "../../components";
import { CommentThread } from "../../components/CommentThread";
import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar, NavIconButton } from "../../components/NavBar";
import { ComposeButton, FolderStrip, ListRow, RowGroup, SectionHeader } from "../../components/Rows";
import { useListRowActions } from "../../components/useListRowActions";
import { useFolderShareStatus } from "../../collaboration/useFolderShareStatus";
import { backLabelFor } from "../../navigation/backLabel";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { accessRoleLabel, isSharedAccess } from "../../utils/access";
import { canAddChildFolder, getChildFolders, getDescendantFolderIds, getFolderById } from "../../utils/folderTree";
import { listActivityTimes, listDisplayTitle, sortListsByActivity, UNTITLED_LIST_TITLE } from "../../utils/listEntries";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Folder">;

// One folder: its subfolders and the lists kept in it.
export const FolderScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items, listEntries, createItem, deleteFolder, canManageFolder, canEditFolderContent } = useTrove();
  const { openListActions, overlays } = useListRowActions();
  const [menuOpen, setMenuOpen] = useState(false);

  const folder = getFolderById(folders, route.params.folderId);
  const folderId = folder?.id;
  const subfolders = useMemo(() => (folderId ? getChildFolders(folders, folderId) : []), [folderId, folders]);
  const activity = useMemo(() => listActivityTimes(items, listEntries ?? []), [items, listEntries]);
  const lists = useMemo(
    () => (folderId ? sortListsByActivity(items.filter((item) => item.folderId === folderId), activity) : []),
    [activity, folderId, items],
  );
  const canManage = folder ? canManageFolder(folder.id) : false;
  const canEditContent = folder ? canEditFolderContent(folder.id) : false;
  const canNestMore = folder ? canAddChildFolder(folders, folder.id) : false;
  const { isShared: isSharedByOwner } = useFolderShareStatus(folderId);
  const showComments = isSharedAccess(folder) || isSharedByOwner;

  const backLabel = backLabelFor(navigation.getState(), route.key, folders);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  const countForFolder = useCallback(
    (id: string): number => {
      const ids = new Set([id, ...getDescendantFolderIds(folders, id)]);
      return items.reduce((count, item) => count + (ids.has(item.folderId) ? 1 : 0), 0);
    },
    [folders, items],
  );

  // One tap starts a list in this folder: it opens with the cursor in its title.
  const onNewList = useCallback(() => {
    if (!folderId) return;
    const list = createItem({ folderId, title: UNTITLED_LIST_TITLE, type: "list", tagOptionIds: [] });
    if (list) navigation.navigate("List", { listId: list.id, isNew: true });
  }, [createItem, folderId, navigation]);

  const shareAsText = useCallback(async (): Promise<void> => {
    if (!folder) return;
    const sections = [
      `${folder.icon ?? "📁"} ${folder.name}`,
      folder.purpose ?? "",
      subfolders.length ? `Folders:\n${subfolders.map((child) => `- ${child.icon ?? "📁"} ${child.name}`).join("\n")}` : "",
      lists.length ? `Lists:\n${lists.map((list) => `- ${listDisplayTitle(list, list.listItems)}`).join("\n")}` : "",
    ].filter(Boolean);

    await Share.share({ message: sections.join("\n\n") });
  }, [folder, lists, subfolders]);

  const confirmDelete = useCallback((): void => {
    if (!folder) return;
    Alert.alert("Delete this folder?", "Its subfolders and every list inside them are deleted too.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await deleteFolder(folder.id);
            if (!result.ok) {
              Alert.alert("Could not delete folder", result.error ?? "Try again in a moment.");
              return;
            }
            goBack();
          })();
        },
      },
    ]);
  }, [deleteFolder, folder, goBack]);

  if (!isReady || !folder) {
    return (
      <View style={styles.screen}>
        <NavBar backLabel={backLabel} onBack={goBack} />
        <View style={styles.content}>
          {!isReady ? (
            <>
              <SkeletonBlock height={34} radius={10} width="56%" />
              <SkeletonBlock height={62} radius={14} style={styles.skeletonRow} />
              <SkeletonText lineCount={3} lineWidths={["82%", "64%", "74%"]} style={styles.skeletonRow} />
            </>
          ) : (
            <Text style={styles.missing}>This folder isn't here any more.</Text>
          )}
        </View>
      </View>
    );
  }

  const menuActions: MenuAction[] = [
    ...(canManage && canNestMore
      ? [
          {
            key: "subfolder",
            label: "New subfolder",
            icon: <FolderPlus size={20} color={colors.accentDark} />,
            onPress: () => navigation.navigate("AddEditFolder", { parentFolderId: folder.id }),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: "edit",
            label: "Edit folder",
            icon: <Pencil size={20} color={colors.accentDark} />,
            onPress: () => navigation.navigate("AddEditFolder", { folderId: folder.id }),
          },
        ]
      : []),
    {
      key: "access",
      label: canManage ? "Share folder" : "See who has access",
      icon: <Users size={20} color={colors.accentDark} />,
      onPress: () => navigation.navigate("ShareFolder", { folderId: folder.id }),
    },
    {
      key: "text",
      label: "Send as text",
      icon: <Share2 size={20} color={colors.accentDark} />,
      onPress: () => void shareAsText(),
    },
    ...(canManage
      ? [
          {
            key: "delete",
            label: "Delete folder",
            icon: <Trash2 size={20} color={colors.danger} />,
            destructive: true,
            separated: true,
            onPress: confirmDelete,
          },
        ]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <NavBar
        backLabel={backLabel}
        onBack={goBack}
        right={
          <NavIconButton label="Folder options" onPress={() => setMenuOpen(true)}>
            <Ellipsis size={24} color={colors.accentDark} />
          </NavIconButton>
        }
      />
      <KeyboardAvoidingView style={styles.scroll} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <View style={[styles.icon, { backgroundColor: folder.color ?? colors.border }]}>
              <Text style={styles.emoji}>{folder.icon ?? "📁"}</Text>
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {folder.name}
            </Text>
          </View>
          {(!!folder.purpose || isSharedAccess(folder) || !canEditContent) && (
            <Text style={styles.caption}>
              {[
                folder.purpose ?? "",
                isSharedAccess(folder) ? `Shared · ${accessRoleLabel(folder.accessRole)}` : "",
                !canEditContent ? "View only" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}

          {subfolders.length > 0 && (
            <>
              <SectionHeader title="Folders" />
              <FolderStrip folders={subfolders} countFor={countForFolder} onOpen={(id) => navigation.push("Folder", { folderId: id })} />
            </>
          )}

          <SectionHeader title="Lists" />
          {lists.length > 0 ? (
            <RowGroup>
              {lists.map((list) => (
                <ListRow
                  key={list.id}
                  list={list}
                  activityAt={activity.get(list.id)}
                  onPress={() => navigation.navigate("List", { listId: list.id })}
                  onLongPress={() => openListActions(list.id)}
                />
              ))}
            </RowGroup>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No lists here yet</Text>
              <Text style={styles.emptyText}>
                {canEditContent ? "Tap the pencil to start one." : "Lists added to this folder show up here."}
              </Text>
            </View>
          )}

          {showComments && <CommentThread targetType="folder" targetId={folder.id} style={styles.comments} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {canEditContent && <ComposeButton onPress={onNewList} />}

      <MenuSheet visible={menuOpen} title={folder.name} actions={menuActions} onClose={() => setMenuOpen(false)} />
      {overlays}
    </View>
  );
};
