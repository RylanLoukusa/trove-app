import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTrove } from "../storage/storage";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { detectItemType, suggestFolders, suggestTitle } from "../utils/folderSuggestions";
import { AppButton } from "./AppButton";
import { FolderPickerField } from "./FolderPickerField";

type Props = {
  visible: boolean;
  currentFolderId?: string;
  onClose: () => void;
};

export const QuickAddModal = ({ visible, currentFolderId, onClose }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, items, tagOptions, createItem, canEditFolderContent } = useTrove();
  const [content, setContent] = useState("");
  const editableFolders = useMemo(
    () => folders.filter((folder) => canEditFolderContent(folder.id)),
    [canEditFolderContent, folders],
  );
  const suggestions = useMemo(
    () => suggestFolders(content, editableFolders, items, tagOptions),
    [content, editableFolders, items, tagOptions],
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(currentFolderId);
  const targetFolderId = selectedFolderId ?? suggestions[0]?.folder.id ?? currentFolderId ?? editableFolders[0]?.id;

  useEffect(() => {
    if (!visible) return;
    setSelectedFolderId(currentFolderId && canEditFolderContent(currentFolderId) ? currentFolderId : undefined);
  }, [canEditFolderContent, currentFolderId, visible]);

  const preview = useMemo(
    () => ({ title: suggestTitle(content), type: detectItemType(content) }),
    [content],
  );

  const save = (): void => {
    if (!targetFolderId || content.trim().length === 0 || !canEditFolderContent(targetFolderId)) return;

    const item = createItem({
      folderId: targetFolderId,
      title: preview.title,
      description: content.trim(),
      type: preview.type,
      url: preview.type === "link" ? content.trim() : undefined,
      mediaUri: preview.type === "media" ? content.trim() : undefined,
      tagOptionIds: [],
    });
    if (!item) return;
    setContent("");
    setSelectedFolderId(undefined);
    onClose();
  };

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Quick Add</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>Paste a thought, URL, or media URI</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Try the new ramen place downtown"
          value={content}
          onChangeText={setContent}
          autoFocus
        />
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>{preview.title}</Text>
          <Text style={styles.meta}>Type: {preview.type}</Text>
        </View>
        <Text style={styles.section}>Suggested folder</Text>
        {suggestions.length === 0 ? (
          <Text style={styles.meta}>No confident match yet. Create a new folder or choose one below.</Text>
        ) : (
          <Pressable style={styles.suggestion} onPress={() => setSelectedFolderId(suggestions[0].folder.id)}>
            <Text style={styles.suggestionTitle}>{suggestions[0].folder.name}</Text>
            <Text style={styles.meta}>{suggestions[0].reasons.join(" · ")}</Text>
          </Pressable>
        )}
        <Text style={styles.section}>Folder</Text>
        <FolderPickerField folders={editableFolders} selectedFolderId={targetFolderId} onSelectFolder={setSelectedFolderId} />
        <AppButton label="Save to Trove" onPress={save} style={styles.save} />
      </ScrollView>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 60 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    title: { color: colors.ink, fontSize: 28, fontWeight: "900" },
    close: { color: colors.accentDark, fontWeight: "800" },
    label: { color: colors.muted, fontWeight: "700", marginBottom: spacing.xs },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      color: colors.ink,
      minHeight: 130,
      padding: spacing.md,
      textAlignVertical: "top",
    },
    preview: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      marginTop: spacing.md,
      padding: spacing.md,
    },
    previewTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
    meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
    section: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "900",
      marginBottom: spacing.xs,
      marginTop: spacing.lg,
    },
    suggestion: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: spacing.xs,
      padding: spacing.md,
    },
    suggestionTitle: { color: colors.ink, fontWeight: "900" },
    save: { marginTop: spacing.lg },
  });
