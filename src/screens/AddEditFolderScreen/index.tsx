import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Maximize2, Minimize2 } from "lucide-react-native";
import { AppButton } from "../../components/AppButton";
import { FolderChoiceRow } from "../../components/FolderChoiceRow";
import { emojiCategories } from "../../data/emojiPalette";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { spacing } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import { canAddChildFolder, canMoveFolder, getChildFolders, getFolderById, getFolderHierarchyRows, getFolderPath, getFolderPathLabel } from "../../utils/folderTree";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "AddEditFolder">;

const FOLDER_COLORS = [
  "#D98A8A",
  "#F0A66A",
  "#F3B562",
  "#E4C45E",
  "#D8C7AA",
  "#7EBEA6",
  "#8AC9A7",
  "#7FB7AE",
  "#8AA8D8",
  "#92A8D1",
  "#A48AD8",
  "#B399D8",
];

const categoryNavGlyphs: Record<string, string> = {
  activity: "🏈",
  flags: "🏳️",
  food: "🍔",
  nature: "🍃",
  objects: "💡",
  people: "😀",
  recent: "◷",
  smileys: "☺",
  symbols: "☮",
  travel: "✈",
};

const collapsedCategoryLimit = 56;

const isSingleEmoji = (value: string): boolean => {
  const trimmed = value.trim();
  return /^(?:\p{Extended_Pictographic}\uFE0F?)(?:\u200D\p{Extended_Pictographic}\uFE0F?)*$/u.test(trimmed);
};

const normalizeFolderIcon = (value: string): string => (isSingleEmoji(value) ? value.trim() : "📁");

export const AddEditFolderScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, createFolder, updateFolder, canManageFolder } = useTrove();
  const editing = getFolderById(folders, route.params?.folderId);

  const [name, setName] = useState(editing?.name ?? "");
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? "📁");
  const [color, setColor] = useState(editing?.color ?? "#D8C7AA");
  const [parentFolderId, setParentFolderId] = useState<string | null>(
    editing?.parentFolderId ?? route.params?.parentFolderId ?? null,
  );
  const iconScrollRef = useRef<ScrollView>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isIconPickerExpanded, setIsIconPickerExpanded] = useState(false);
  const [hasHydratedFullIconPicker, setHasHydratedFullIconPicker] = useState(false);
  const [iconSectionOffsets, setIconSectionOffsets] = useState<Record<string, number>>({});
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [expandedParentFolderIds, setExpandedParentFolderIds] = useState<Set<string>>(new Set());

  const parentChoices = useMemo(
    () =>
      editing
        ? folders.filter((folder) => folder.id !== editing.id && canMoveFolder(folders, editing.id, folder.id) && canManageFolder(folder.id))
        : folders.filter((folder) => canAddChildFolder(folders, folder.id) && canManageFolder(folder.id)),
    [canManageFolder, editing, folders],
  );
  const parentChoiceIds = useMemo(() => new Set(parentChoices.map((folder) => folder.id)), [parentChoices]);
  const parentRows = useMemo(
    () => getFolderHierarchyRows(folders).filter((row) => parentChoiceIds.has(row.folder.id)),
    [folders, parentChoiceIds],
  );
  const searchedParentRows = useMemo(() => {
    const query = parentSearch.trim().toLowerCase();
    if (!query) return [];

    return parentRows.filter(({ folder }) => getFolderPathLabel(folders, folder.id).toLowerCase().includes(query));
  }, [folders, parentRows, parentSearch]);
  const browsedParentRows = useMemo(() => {
    const rows: typeof parentRows = [];

    const visit = (parentId: string | null, depth: number): void => {
      getChildFolders(folders, parentId)
        .filter((folder) => parentChoiceIds.has(folder.id))
        .forEach((folder) => {
          rows.push({ folder, depth });
          if (expandedParentFolderIds.has(folder.id)) {
            visit(folder.id, depth + 1);
          }
        });
    };

    visit(null, 0);
    return rows;
  }, [expandedParentFolderIds, folders, parentChoiceIds]);
  const displayedParentRows = parentSearch.trim().length > 0 ? searchedParentRows : browsedParentRows;
  const selectedParentFolder = getFolderById(folders, parentFolderId);
  const visibleEmojiCategories = useMemo(() => {
    if (isIconPickerExpanded || hasHydratedFullIconPicker) {
      return emojiCategories;
    }

    return emojiCategories.map((category) => ({
      ...category,
      emoji: category.emoji.slice(0, category.key === "recent" ? category.emoji.length : collapsedCategoryLimit),
    }));
  }, [hasHydratedFullIconPicker, isIconPickerExpanded]);

  useEffect(() => {
    if (isIconPickerExpanded) {
      setHasHydratedFullIconPicker(true);
    }
  }, [isIconPickerExpanded]);

  const openParentPicker = useCallback((): void => {
    setExpandedParentFolderIds(new Set(getFolderPath(folders, parentFolderId).map((folder) => folder.id)));
    setParentPickerOpen(true);
  }, [folders, parentFolderId]);

  const closeParentPicker = useCallback((): void => {
    setParentPickerOpen(false);
    setParentSearch("");
  }, []);

  const chooseParentFolder = useCallback((nextParentFolderId: string | null): void => {
    setParentFolderId(nextParentFolderId);
    setParentSearch("");
    if (nextParentFolderId) {
      setExpandedParentFolderIds((current) => {
        const next = new Set(current);
        if (next.has(nextParentFolderId)) {
          next.delete(nextParentFolderId);
          return next;
        }
        getFolderPath(folders, nextParentFolderId).forEach((folder) => next.add(folder.id));
        return next;
      });
      return;
    }
    setExpandedParentFolderIds(new Set());
  }, [folders]);

  const chooseHomeFolder = useCallback((): void => {
    chooseParentFolder(null);
  }, [chooseParentFolder]);

  const scrollToIconSection = useCallback(
    (categoryKey: string) => {
      if (!hasHydratedFullIconPicker) {
        setHasHydratedFullIconPicker(true);
      }

      iconScrollRef.current?.scrollTo({
        animated: true,
        y: Math.max((iconSectionOffsets[categoryKey] ?? 0) - spacing.sm, 0),
      });
    },
    [hasHydratedFullIconPicker, iconSectionOffsets],
  );

  const save = useCallback((): void => {
    const normalizedIcon = normalizeFolderIcon(icon);

    if (editing) {
      if (!canManageFolder(editing.id)) {
        Alert.alert("Cannot edit folder", "Only the folder owner can edit this folder.");
        return;
      }
      if (!canMoveFolder(folders, editing.id, parentFolderId)) {
        Alert.alert(
          "Cannot move folder",
          "That destination would create a loop or exceed the 5-level nesting limit.",
        );
        return;
      }
      updateFolder(editing.id, { name, purpose, icon: normalizedIcon, color, parentFolderId });
      navigation.goBack();
      return;
    }
    if (parentFolderId && !canManageFolder(parentFolderId)) {
      Alert.alert("Cannot create folder", "Only the folder owner can create subfolders here.");
      return;
    }
    if (!canAddChildFolder(folders, parentFolderId)) {
      Alert.alert("Max depth reached", "Folders can be nested up to 5 levels deep.");
      return;
    }
    const folder = createFolder({ name, purpose, icon: normalizedIcon, color, parentFolderId });
    if (!folder) return;
    navigation.replace("Folder", { folderId: folder.id });
  }, [canManageFolder, color, createFolder, editing, folders, icon, name, navigation, parentFolderId, purpose, updateFolder]);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{editing ? "Edit folder" : "New folder"}</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Weekend Ideas" />

        <Text style={styles.label}>Purpose</Text>
        <TextInput
          multiline
          onChangeText={setPurpose}
          placeholder="Things that belong together here..."
          style={[styles.input, styles.purposeInput]}
          textAlignVertical="top"
          value={purpose}
        />

        <Text style={styles.label}>Icon</Text>
        <Pressable
          accessibilityLabel="Choose folder icon"
          accessibilityRole="button"
          onPress={() => setIconPickerOpen((current) => !current)}
          style={({ pressed }) => [
            styles.iconSummary,
            iconPickerOpen && styles.iconSummaryOpen,
            pressed && styles.iconSummaryPressed,
          ]}
        >
          <View style={[styles.iconPreview, { backgroundColor: color }]}>
            <Text style={styles.iconPreviewEmoji}>{normalizeFolderIcon(icon)}</Text>
          </View>
          <View style={styles.iconSummaryCopy}>
            <Text style={styles.iconSummaryMeta}>Tap to choose an emoji</Text>
          </View>
          <Text style={styles.iconSummaryAction}>{iconPickerOpen ? "Close" : "Change"}</Text>
        </Pressable>

        {iconPickerOpen && (
          <View style={[styles.iconPicker, isIconPickerExpanded && styles.iconPickerExpanded]}>
            <View style={styles.iconPickerHeader}>
              <Pressable
                accessibilityLabel={isIconPickerExpanded ? "Collapse emoji picker" : "Expand emoji picker"}
                onPress={() => setIsIconPickerExpanded((current) => !current)}
                style={({ pressed }) => [styles.iconPickerSizeButton, pressed && styles.iconPickerPressed]}
              >
                {isIconPickerExpanded ? (
                  <Minimize2 color={colors.muted} size={18} strokeWidth={2.6} />
                ) : (
                  <Maximize2 color={colors.muted} size={18} strokeWidth={2.6} />
                )}
              </Pressable>
            </View>

            <ScrollView
              ref={iconScrollRef}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={[styles.iconEmojiScroll, isIconPickerExpanded && styles.iconEmojiScrollExpanded]}
              contentContainerStyle={styles.iconEmojiScrollContent}
            >
              {visibleEmojiCategories.map((category) => (
                <View
                  key={category.key}
                  onLayout={(event) => {
                    const offset = event.nativeEvent.layout.y;
                    setIconSectionOffsets((current) =>
                      current[category.key] === offset ? current : { ...current, [category.key]: offset },
                    );
                  }}
                  style={styles.iconEmojiSection}
                >
                  <Text style={styles.iconEmojiSectionTitle}>{category.label}</Text>
                  <View style={styles.iconEmojiGrid}>
                    {category.emoji.map((emoji) => {
                      const isSelected = emoji === icon;

                      return (
                        <Pressable
                          key={emoji}
                          accessibilityLabel={`Use ${emoji} as folder icon`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => setIcon(emoji)}
                          style={({ pressed }) => [
                            styles.iconEmojiButton,
                            isSelected && styles.iconEmojiButtonSelected,
                            pressed && styles.iconPickerPressed,
                          ]}
                        >
                          <Text style={styles.iconEmojiGlyph}>{emoji}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.iconNavBar}>
              {emojiCategories.map((category) => (
                <Pressable
                  key={category.key}
                  accessibilityLabel={`Jump to ${category.label}`}
                  onPress={() => scrollToIconSection(category.key)}
                  style={({ pressed }) => [styles.iconNavButton, pressed && styles.iconPickerPressed]}
                >
                  <Text style={styles.iconNavGlyph}>{categoryNavGlyphs[category.key] ?? "•"}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.label}>Color</Text>
        <View style={styles.colorGrid}>
          {FOLDER_COLORS.map((option) => {
            const isSelected = color === option;

            return (
              <Pressable
                key={option}
                accessibilityLabel={`Use folder color ${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setColor(option)}
                style={({ pressed }) => [
                  styles.colorSwatch,
                  { backgroundColor: option },
                  isSelected && styles.colorTileSelected,
                  pressed && styles.colorTilePressed,
                ]}
              >
                {isSelected && <Text style={styles.colorCheck}>✓</Text>}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Parent folder</Text>
        <Pressable
          onPress={openParentPicker}
          style={({ pressed }) => [
            styles.parentSummary,
            pressed && styles.parentSummaryPressed,
          ]}
        >
          <View style={[styles.parentSummaryIcon, selectedParentFolder?.color ? { backgroundColor: selectedParentFolder.color } : undefined]}>
            <Text style={styles.parentSummaryIconText}>{selectedParentFolder?.icon ?? "⌂"}</Text>
          </View>
          <View style={styles.parentSummaryCopy}>
            <Text style={styles.parentSummaryTitle}>{selectedParentFolder?.name ?? "Home"}</Text>
            <Text style={styles.parentSummaryMeta}>
              {selectedParentFolder ? getFolderPathLabel(folders, selectedParentFolder.id) : "Top-level folder"}
            </Text>
          </View>
          <Text style={styles.parentSummaryAction}>Change</Text>
        </Pressable>

        <AppButton label="Save folder" onPress={save} style={styles.save} />
      </ScrollView>

      <Modal animationType="slide" visible={parentPickerOpen} presentationStyle="pageSheet" onRequestClose={closeParentPicker}>
        <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Parent folder</Text>
            <Pressable onPress={closeParentPicker}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            autoCorrect={false}
            onChangeText={setParentSearch}
            placeholder="Search folders..."
            style={styles.input}
            value={parentSearch}
          />

          <Pressable
            onPress={chooseHomeFolder}
            style={({ pressed }) => [
              styles.homeChoice,
              parentFolderId === null && styles.homeChoiceSelected,
              pressed && styles.homeChoicePressed,
            ]}
          >
            <View style={styles.homeIcon}>
              <Text style={styles.homeIconText}>⌂</Text>
            </View>
            <View style={styles.homeCopy}>
              <Text style={[styles.homeTitle, parentFolderId === null && styles.homeTitleSelected]}>Home</Text>
              <Text style={styles.homeMeta}>Top-level folder</Text>
            </View>
            {parentFolderId === null && <Text style={styles.homeCheck}>✓</Text>}
          </Pressable>

          <Text style={styles.modalSection}>{parentSearch.trim() ? "Matching folders" : "Browse folders"}</Text>
          {displayedParentRows.length === 0 ? (
            <Text style={styles.emptyPickerText}>No valid parent folders found.</Text>
          ) : (
            displayedParentRows.map(({ folder, depth }) => (
                <FolderChoiceRow
                  key={folder.id}
                  folder={folder}
                  depth={depth}
                  isSelected={parentFolderId === folder.id}
                  onPress={() => chooseParentFolder(folder.id)}
                />
            ))
          )}
        </ScrollView>
      </Modal>
    </View>
  );
};
