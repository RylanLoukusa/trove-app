import React, { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RotateCcw, Trash2 } from "lucide-react-native";

import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar } from "../../components/NavBar";
import { DetailRow, RowGroup, SectionHeader } from "../../components/Rows";
import { HOME_LABEL } from "../../navigation/backLabel";
import type { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { listDisplayTitle } from "../../utils/listEntries";
import { DELETED_KEEP_DAYS, purgeLabel } from "../../utils/listLifecycle";
import { createSetAsideStyles } from "../setAsideStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RecentlyDeleted">;
type Chosen = { kind: "list" | "folder"; id: string; title: string };

const countLabel = (count: number): string => (count === 1 ? "1 list" : `${count} lists`);

// Deleted lists and folders, kept for 30 days. Tapping one offers to put it
// back or delete it for good.
export const RecentlyDeletedScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createSetAsideStyles(colors), [colors]);
  const { deletedItems, deletedFolders, restoreItem, restoreFolder, deleteItem, deleteFolder, canEditItem, canManageFolder } =
    useTrove();
  const [chosen, setChosen] = useState<Chosen | null>(null);

  // Lists deleted with their folder come back with it, so they aren't listed
  // one by one.
  const lists = useMemo(() => {
    const folderIds = new Set(deletedFolders.map(({ folder }) => folder.id));
    return deletedItems
      .filter((item) => !(item.deletedWithFolderId && folderIds.has(item.deletedWithFolderId)))
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }, [deletedFolders, deletedItems]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  const deleteForGood = (target: Chosen) => {
    Alert.alert(
      target.kind === "folder" ? "Delete this folder for good?" : "Delete this list for good?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const result = target.kind === "folder" ? await deleteFolder(target.id) : await deleteItem(target.id);
              if (!result.ok) Alert.alert("Could not delete", result.error ?? "Try again in a moment.");
            })();
          },
        },
      ],
    );
  };

  const canChange = chosen ? (chosen.kind === "folder" ? canManageFolder(chosen.id) : canEditItem(chosen.id)) : false;
  const actions: MenuAction[] =
    chosen && canChange
      ? [
          {
            key: "restore",
            label: "Put back",
            icon: <RotateCcw size={20} color={colors.accentDark} />,
            onPress: () => {
              if (chosen.kind === "folder") restoreFolder(chosen.id);
              else restoreItem(chosen.id);
            },
          },
          {
            key: "delete",
            label: "Delete for good",
            icon: <Trash2 size={20} color={colors.danger} />,
            destructive: true,
            separated: true,
            onPress: () => deleteForGood(chosen),
          },
        ]
      : [];

  const isEmpty = lists.length === 0 && deletedFolders.length === 0;

  return (
    <View style={styles.screen}>
      <NavBar backLabel={HOME_LABEL} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Recently deleted
        </Text>
        <Text style={styles.note}>
          Lists and folders stay here for {DELETED_KEEP_DAYS} days, then they are deleted for good.
        </Text>

        {isEmpty && <Text style={styles.empty}>Nothing has been deleted.</Text>}

        {deletedFolders.length > 0 && (
          <>
            <SectionHeader title="Folders" />
            <RowGroup>
              {deletedFolders.map(({ folder, at, listCount }) => (
                <DetailRow
                  key={folder.id}
                  title={folder.name}
                  detail={`${countLabel(listCount)} · ${purgeLabel(at)}`}
                  hint="Offers to put it back or delete it for good"
                  onPress={() => setChosen({ kind: "folder", id: folder.id, title: folder.name })}
                />
              ))}
            </RowGroup>
          </>
        )}

        {lists.length > 0 && (
          <>
            <SectionHeader title="Lists" />
            <RowGroup>
              {lists.map((list) => {
                const title = listDisplayTitle(list, list.listItems);
                return (
                  <DetailRow
                    key={list.id}
                    title={title}
                    detail={list.deletedAt ? purgeLabel(list.deletedAt) : undefined}
                    hint="Offers to put it back or delete it for good"
                    onPress={() => setChosen({ kind: "list", id: list.id, title })}
                  />
                );
              })}
            </RowGroup>
          </>
        )}
      </ScrollView>

      <MenuSheet visible={!!chosen && canChange} title={chosen?.title} actions={actions} onClose={() => setChosen(null)} />
    </View>
  );
};
