import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { Folder } from "../types/models";
import { getFolderHierarchyRows, getFolderPathLabel } from "../utils/folderTree";
import { FolderChoiceRow } from "./FolderChoiceRow";
import { OptionChoiceRow } from "./OptionChoiceRow";

type Props = {
  visible: boolean;
  folders: Folder[];
  onClose: () => void;
  // Called with "" for the top level when `rootLabel` is given.
  onSelectFolder: (folderId: string) => void;
  title?: string;
  // Adds a first row for the top level (no folder), with this name.
  rootLabel?: string;
  selectedFolderId?: string;
};

export const FolderTreeBrowserModal = ({
  visible,
  folders,
  onClose,
  onSelectFolder,
  title = "All folders",
  rootLabel,
  selectedFolderId,
}: Props) => {
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
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={close} hitSlop={8}>
            <Text style={styles.close}>{rootLabel ? "Cancel" : "Done"}</Text>
          </Pressable>
        </View>

        <TextInput
          accessibilityLabel="Search folders"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search folders..."
          placeholderTextColor={colors.muted}
          style={styles.search}
          value={query}
        />

        {!!rootLabel && !query.trim() && (
          <OptionChoiceRow label={rootLabel} isSelected={selectedFolderId === ""} onPress={() => choose("")} />
        )}

        {rows.length === 0 ? (
          <Text style={styles.empty}>{folders.length === 0 ? "No folders yet." : "No folders found."}</Text>
        ) : (
          rows.map(({ folder, depth }) => (
            <FolderChoiceRow
              key={folder.id}
              folder={folder}
              depth={depth}
              isSelected={selectedFolderId === folder.id}
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
