import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Folder } from "../types/models";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  folder: Folder;
  depth?: number;
  isSelected: boolean;
  onPress: () => void;
  detail?: string;
  prefix?: string;
};

export const FolderChoiceRow = ({ folder, depth = 0, isSelected, onPress, detail, prefix }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.row,
        { marginLeft: Math.min(depth, 4) * spacing.lg },
        depth > 0 && styles.childRow,
        isSelected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {depth > 0 && <View style={styles.branch} />}
      <View style={[styles.icon, { backgroundColor: folder.color ?? colors.border }]}>
        <Text style={styles.emoji}>{folder.icon ?? "📁"}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, isSelected && styles.selectedName]} numberOfLines={1}>
          {prefix ? `${prefix}: ` : ""}
          {folder.name}
        </Text>
        {!!detail && (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      {isSelected && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: spacing.xs,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  childRow: {
    borderTopLeftRadius: radius.sm,
  },
  selected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  branch: {
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 26,
    left: -spacing.md,
    position: "absolute",
    width: 3,
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  emoji: { fontSize: 17 },
  copy: { flex: 1, marginLeft: spacing.sm },
  name: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  selectedName: { color: colors.accentDark },
  detail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  check: { color: colors.accentDark, fontSize: 18, fontWeight: "900", marginLeft: spacing.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
