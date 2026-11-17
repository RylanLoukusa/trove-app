import React, { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArchiveRestore, Trash2 } from "lucide-react-native";

import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar } from "../../components/NavBar";
import { DetailRow, ListRow, RowGroup, SectionHeader } from "../../components/Rows";
import { HOME_LABEL } from "../../navigation/backLabel";
import type { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { listDisplayTitle } from "../../utils/listEntries";
import { createSetAsideStyles } from "../setAsideStyles";

type Props = NativeStackScreenProps<RootStackParamList, "Archived">;
type Chosen = { kind: "list" | "folder"; id: string; title: string };

const countLabel = (count: number): string => (count === 1 ? "1 list" : `${count} lists`);

// Lists and folders kept out of the way. A list opens as usual; holding it, or
// tapping a folder, offers to bring it back or delete it.
export const ArchivedScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createSetAsideStyles(colors), [colors]);
  const {
    archivedItems,
    archivedFolders,
    setItemArchived,
    setFolderArchived,
    trashItem,
    trashFolder,
    canEditItem,
    canManageFolder,
  } = useTrove();
  const [chosen, setChosen] = useState<Chosen | null>(null);

  const folderNames = useMemo(
    () => new Map(archivedFolders.map(({ folder }) => [folder.id, `${folder.icon ?? "📁"} ${folder.name}`])),
    [archivedFolders],
  );
  const lists = useMemo(
    () => [...archivedItems].sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    [archivedItems],
  );

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  const canChange = chosen ? (chosen.kind === "folder" ? canManageFolder(chosen.id) : canEditItem(chosen.id)) : false;
  const actions: MenuAction[] =
    chosen && canChange
      ? [
          {
            key: "unarchive",
            label: "Unarchive",
            icon: <ArchiveRestore size={20} color={colors.accentDark} />,
            onPress: () => {
              if (chosen.kind === "folder") setFolderArchived(chosen.id, false);
              else setItemArchived(chosen.id, false);
            },
          },
          {
            key: "delete",
            label: chosen.kind === "folder" ? "Delete folder" : "Delete list",
            icon: <Trash2 size={20} color={colors.danger} />,
            destructive: true,
            separated: true,
            onPress: () => {
              if (chosen.kind === "list") {
                const result = trashItem(chosen.id);
                if (!result.ok) Alert.alert("Could not delete list", result.error ?? "Try again in a moment.");
                return;
              }
              void (async () => {
                const result = await trashFolder(chosen.id);
                if (!result.ok) Alert.alert("Could not delete folder", result.error ?? "Try again in a moment.");
              })();
            },
          },
        ]
      : [];

  const isEmpty = lists.length === 0 && archivedFolders.length === 0;

  return (
    <View style={styles.screen}>
      <NavBar backLabel={HOME_LABEL} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Archived
        </Text>
        <Text style={styles.note}>
          Archived lists are kept and still show up in Search, but stay off Home and out of Today.
        </Text>

        {isEmpty && <Text style={styles.empty}>Nothing is archived.</Text>}

        {archivedFolders.length > 0 && (
          <>
            <SectionHeader title="Folders" />
            <RowGroup>
              {archivedFolders.map(({ folder, listCount }) => (
                <DetailRow
                  key={folder.id}
                  title={folderNames.get(folder.id) ?? folder.name}
                  detail={countLabel(listCount)}
                  hint="Offers to unarchive or delete it"
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
              {lists.map((list) => (
                <ListRow
                  key={list.id}
                  list={list}
                  activityAt={list.archivedAt}
                  folderLabel={list.archivedWithFolderId ? folderNames.get(list.archivedWithFolderId) : undefined}
                  onPress={() => navigation.navigate("List", { listId: list.id })}
                  onLongPress={() =>
                    setChosen({ kind: "list", id: list.id, title: listDisplayTitle(list, list.listItems) })
                  }
                />
              ))}
            </RowGroup>
          </>
        )}
      </ScrollView>

      <MenuSheet visible={!!chosen && canChange} title={chosen?.title} actions={actions} onClose={() => setChosen(null)} />
    </View>
  );
};
