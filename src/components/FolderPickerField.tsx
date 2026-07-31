import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { Folder } from "../types/models";
import { getChildFolders, getFolderById, getFolderPath, getFolderPathLabel, getVisibleRootFolders } from "../utils/folderTree";
import { FolderChoiceRow } from "./FolderChoiceRow";

type Props = {
  folders: Folder[];
  selectedFolderId?: string;
  onSelectFolder: (folderId: string) => void;
};

export const FolderPickerField = ({ folders, selectedFolderId, onSelectFolder }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const selectedFolder = getFolderById(folders, selectedFolderId);

  const searchRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    return folders
      .filter((folder) => getFolderPathLabel(folders, folder.id).toLowerCase().includes(normalized))
      .map((folder) => ({ folder, depth: getFolderPath(folders, folder.id).length - 1 }));
  }, [folders, query]);

  const browseRows = useMemo(() => {
    const rows: Array<{ folder: Folder; depth: number }> = [];

    const visit = (parentFolderId: string | null, depth: number): void => {
      const children = parentFolderId === null ? getVisibleRootFolders(folders) : getChildFolders(folders, parentFolderId);
      children.forEach((folder) => {
        rows.push({ folder, depth });
        if (expandedFolderIds.has(folder.id)) {
          visit(folder.id, depth + 1);
        }
      });
    };

    visit(null, 0);
    return rows;
  }, [expandedFolderIds, folders]);

  const displayedRows = query.trim() ? searchRows : browseRows;

  const open = useCallback((): void => {
    setExpandedFolderIds(new Set(getFolderPath(folders, selectedFolderId).map((folder) => folder.id)));
    setIsOpen(true);
  }, [folders, selectedFolderId]);

  const close = useCallback((): void => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const chooseFolder = useCallback(
    (folderId: string): void => {
      onSelectFolder(folderId);
      setQuery("");
      setExpandedFolderIds((current) => {
        const next = new Set(current);
        if (next.has(folderId)) {
          next.delete(folderId);
          return next;
        }
        getFolderPath(folders, folderId).forEach((folder) => next.add(folder.id));
        return next;
      });
    },
    [folders, onSelectFolder],
  );

  return (
    <>
      <Pressable onPress={open} style={({ pressed }) => [styles.summary, pressed && styles.summaryPressed]}>
        <View style={[styles.icon, selectedFolder?.color ? { backgroundColor: selectedFolder.color } : undefined]}>
          <Text style={styles.iconText}>{selectedFolder?.icon ?? "📁"}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{selectedFolder?.name ?? "Choose folder"}</Text>
          <Text style={styles.meta}>
            {selectedFolder ? getFolderPathLabel(folders, selectedFolder.id) : "Select where this item belongs"}
          </Text>
        </View>
        <Text style={styles.action}>Change</Text>
      </Pressable>

      <Modal animationType="slide" visible={isOpen} presentationStyle="pageSheet" onRequestClose={close}>
        <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose folder</Text>
            <Pressable onPress={close}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search folders..."
            style={styles.search}
            value={query}
          />

          <Text style={styles.section}>{query.trim() ? "Matching folders" : "Browse folders"}</Text>
          {displayedRows.length === 0 ? (
            <Text style={styles.empty}>No folders found.</Text>
          ) : (
            displayedRows.map(({ folder, depth }) => (
              <FolderChoiceRow
                key={folder.id}
                folder={folder}
                depth={depth}
                isSelected={selectedFolderId === folder.id}
                onPress={() => chooseFolder(folder.id)}
              />
            ))
          )}
        </ScrollView>
      </Modal>
    </>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  summary: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: spacing.xs,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  icon: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconText: { fontSize: 20 },
  copy: { flex: 1, marginLeft: spacing.sm },
  title: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  action: { color: colors.accentDark, fontSize: 13, fontWeight: "900", marginLeft: spacing.sm },
  modalScreen: { backgroundColor: colors.background },
  modalContent: { padding: spacing.lg, paddingBottom: 60 },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  modalTitle: { color: colors.ink, fontSize: 28, fontWeight: "900" },
  modalClose: { color: colors.accentDark, fontWeight: "800" },
  search: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    color: colors.ink,
    padding: spacing.md,
  },
  section: { color: colors.ink, fontSize: 16, fontWeight: "900", marginTop: spacing.lg },
  empty: { color: colors.muted, marginTop: spacing.sm },
});
