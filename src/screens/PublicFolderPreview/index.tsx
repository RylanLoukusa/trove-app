import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { NavBar } from "../../components/NavBar";
import { FolderStrip, ListRow, RowGroup, SectionHeader } from "../../components/Rows";
import { usePublicFolder } from "../../collaboration/usePublicFolder";
import { backLabelFor } from "../../navigation/backLabel";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">;

// A folder someone shared by link: its subfolders and lists, read-only.
export const PublicFolderPreviewScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = route.params.token;
  const { data, error, isLoading } = usePublicFolder(token);

  const activeFolderId = route.params.folderId ?? data?.folder.id;
  const activeFolder = data?.folders.find((folder) => folder.id === activeFolderId);
  const subfolders = useMemo(
    () => (data ? data.folders.filter((folder) => folder.parentFolderId === activeFolderId) : []),
    [data, activeFolderId],
  );
  const lists = useMemo(
    () => (data ? data.items.filter((item) => item.folderId === activeFolderId) : []),
    [data, activeFolderId],
  );
  // Lists in a folder and in everything nested inside it, as the app counts them.
  const countForFolder = useCallback(
    (folderId: string): number => {
      if (!data) return 0;
      const ids = new Set([folderId]);
      let grew = true;
      while (grew) {
        grew = false;
        data.folders.forEach((folder) => {
          if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) {
            ids.add(folder.id);
            grew = true;
          }
        });
      }
      return data.items.filter((item) => ids.has(item.folderId)).length;
    },
    [data],
  );

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);
  const navBar = <NavBar backLabel={backLabelFor(navigation.getState(), route.key, [])} onBack={goBack} />;

  if (isLoading) {
    return (
      <View style={styles.screen}>
        {navBar}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentDark} />
        </View>
      </View>
    );
  }

  if (error || !data || !activeFolder) {
    return (
      <View style={styles.screen}>
        {navBar}
        <View style={styles.center}>
          <Text style={styles.unavailableTitle}>Link unavailable</Text>
          <Text style={styles.unavailableText}>{error ?? "This link is no longer available."}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {navBar}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{data.ownerName ? `Shared by ${data.ownerName}` : "Shared folder"}</Text>
        <View style={styles.titleRow}>
          <View style={[styles.icon, { backgroundColor: activeFolder.color ?? colors.border }]}>
            <Text style={styles.emoji}>{activeFolder.icon ?? "📁"}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {activeFolder.name}
          </Text>
        </View>
        {!!activeFolder.purpose && <Text style={styles.purpose}>{activeFolder.purpose}</Text>}

        {subfolders.length > 0 && (
          <>
            <SectionHeader title="Folders" />
            <FolderStrip
              folders={subfolders}
              countFor={countForFolder}
              onOpen={(folderId) => navigation.push("PublicFolderPreview", { token, folderId })}
            />
          </>
        )}

        <SectionHeader title="Lists" />
        {lists.length > 0 ? (
          <RowGroup>
            {lists.map((list) => (
              <ListRow
                key={list.id}
                list={list}
                onPress={() => navigation.push("PublicItemDetail", { token, itemId: list.id })}
              />
            ))}
          </RowGroup>
        ) : (
          <Text style={styles.emptyText}>No lists in this folder yet.</Text>
        )}

        <Text style={styles.footer}>Shared read-only from Trove</Text>
      </ScrollView>
    </View>
  );
};
