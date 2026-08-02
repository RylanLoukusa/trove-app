import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { Folder } from "../types/models";
import { getFolderHierarchyRows, getFolderPathLabel } from "../utils/folderTree";
import { FolderChoiceRow } from "./FolderChoiceRow";

type Props = {
  visible: boolean;
  folders: Folder[];
  onClose: () => void;
  onSelectFolder: (folderId: string) => void;
};

export const FolderTreeBrowserModal = ({ visible, folders, onClose, onSelectFolder }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  const allRows = useMemo(() => getFolderHierarchyRows(folders), [folders]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allRows;
    return allRows.filter(({ folder }) =>
      getFolderPathLabel(folders, folder.id).toLowerCase().includes(normalized),
    );
  }, [allRows, folders, query]);

  const choose = useCallback(
    (folderId: string): void => {
      setQuery("");
      onSelectFolder(folderId);
    },
    [onSelectFolder],
  );

  const close = useCallback((): void => {
    setQuery("");
    onClose();
  }, [onClose]);

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={close}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>All folders</Text>
          <Pressable onPress={close}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>

        <TextInput
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search folders..."
          placeholderTextColor={colors.muted}
          style={styles.search}
          value={query}
        />

        {rows.length === 0 ? (
          <Text style={styles.empty}>No folders found.</Text>
        ) : (
          rows.map(({ folder, depth }) => (
            <FolderChoiceRow
              key={folder.id}
              folder={folder}
              depth={depth}
              isSelected={false}
              onPress={() => choose(folder.id)}
            />
          ))
        )}
      </ScrollView>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: 60,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    title: {
      color: colors.ink,
      fontSize: 28,
      fontWeight: "900",
    },
    close: {
      color: colors.accentDark,
      fontWeight: "800",
    },
    search: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      color: colors.ink,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    empty: {
      color: colors.muted,
      marginTop: spacing.sm,
    },
  });
