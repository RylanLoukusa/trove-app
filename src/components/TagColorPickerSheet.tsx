import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

// Mirrors AddEditFolderScreen's FOLDER_COLORS palette so folder and tag colors read consistently.
const TAG_COLORS = [
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

type Props = {
  visible: boolean;
  selectedColor?: string;
  onSelect: (color: string | undefined) => void;
  onClose: () => void;
};

export const TagColorPickerSheet = ({ visible, selectedColor, onSelect, onClose }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const choose = (color: string | undefined): void => {
    onSelect(color);
    onClose();
  };

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Color</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.colorGrid}>
          <Pressable
            accessibilityLabel="No color"
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedColor }}
            onPress={() => choose(undefined)}
            style={({ pressed }) => [
              styles.colorSwatch,
              styles.noColorSwatch,
              !selectedColor && styles.colorTileSelected,
              pressed && styles.colorTilePressed,
            ]}
          >
            {!selectedColor && <Text style={styles.colorCheckMuted}>✓</Text>}
          </Pressable>
          {TAG_COLORS.map((option) => {
            const isSelected = selectedColor === option;
            return (
              <Pressable
                key={option}
                accessibilityLabel={`Use tag color ${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => choose(option)}
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
    colorGrid: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      padding: spacing.md,
    },
    colorSwatch: {
      alignItems: "center",
      borderColor: colors.surface,
      borderRadius: 18,
      borderWidth: 3,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    noColorSwatch: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    colorTileSelected: {
      borderColor: colors.ink,
    },
    colorTilePressed: {
      opacity: 0.72,
      transform: [{ scale: 0.94 }],
    },
    colorCheck: {
      color: colors.surface,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 20,
      textShadowColor: "rgba(0, 0, 0, 0.35)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    colorCheckMuted: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 20,
    },
  });
