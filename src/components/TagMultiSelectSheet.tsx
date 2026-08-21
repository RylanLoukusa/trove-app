import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { TagOption } from "../types/models";
import { OptionChoiceRow } from "./OptionChoiceRow";

type Props = {
  visible: boolean;
  title: string;
  options: TagOption[];
  selectedOptionIds: string[];
  allowInlineCreate: boolean;
  onToggleOption: (optionId: string) => void;
  onCreateOption: (name: string) => void;
  onClose: () => void;
};

export const TagMultiSelectSheet = ({
  visible,
  title,
  options,
  selectedOptionIds,
  allowInlineCreate,
  onToggleOption,
  onCreateOption,
  onClose,
}: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const normalizedQuery = query.trim().toLowerCase();
  const sortedOptions = useMemo(() => [...options].sort((a, b) => a.sortOrder - b.sortOrder), [options]);
  const displayedOptions = normalizedQuery
    ? sortedOptions.filter((option) => option.name.toLowerCase().includes(normalizedQuery))
    : sortedOptions;
  const hasExactMatch = options.some((option) => option.name.toLowerCase() === normalizedQuery);
  const canCreate = allowInlineCreate && normalizedQuery.length > 0 && !hasExactMatch;

  const submitCreate = (): void => {
    const name = query.trim();
    if (!name) return;
    onCreateOption(name);
    setQuery("");
  };

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>

        <TextInput
          accessibilityLabel={`Search ${title.toLowerCase()}`}
          autoCorrect={false}
          onChangeText={setQuery}
          onSubmitEditing={canCreate ? submitCreate : undefined}
          placeholder={`Search ${title.toLowerCase()}...`}
          placeholderTextColor={colors.muted}
          style={styles.search}
          value={query}
        />

        {displayedOptions.map((option) => (
          <OptionChoiceRow
            key={option.id}
            label={option.name}
            tone={option.color}
            isSelected={selectedOptionIds.includes(option.id)}
            onPress={() => onToggleOption(option.id)}
          />
        ))}

        {displayedOptions.length === 0 && !canCreate && <Text style={styles.empty}>No options found.</Text>}

        {canCreate && (
          <Pressable onPress={submitCreate} style={({ pressed }) => [styles.createRow, pressed && styles.createRowPressed]}>
            <Text style={styles.createText}>Create “{query.trim()}”</Text>
          </Pressable>
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
      marginBottom: spacing.sm,
      padding: spacing.md,
    },
    empty: {
      color: colors.muted,
      marginTop: spacing.sm,
    },
    createRow: {
      backgroundColor: colors.surface,
      borderColor: colors.accentDark,
      borderRadius: 16,
      borderStyle: "dashed",
      borderWidth: 1,
      marginTop: spacing.xs,
      padding: spacing.md,
    },
    createRowPressed: {
      opacity: 0.72,
    },
    createText: {
      color: colors.accentDark,
      fontSize: 15,
      fontWeight: "800",
    },
  });
