import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Folder } from "../types/models";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { accessRoleLabel, isSharedAccess } from "../utils/access";

type Props = {
  folder: Folder;
  count?: number;
  onPress: () => void;
};

export const FolderCard = ({ folder, count, onPress }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: folder.color ?? colors.border }]}>
        <Text style={styles.emoji}>{folder.icon ?? "📁"}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{folder.name}</Text>
          {isSharedAccess(folder) && <Text style={styles.sharedPill}>{accessRoleLabel(folder.accessRole)}</Text>}
        </View>
        <Text style={styles.meta}>{count ?? 0} saved here</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: "row",
    marginVertical: spacing.xs,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  icon: {
    alignItems: "center",
    borderRadius: 14,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  emoji: { fontSize: 22 },
  content: { flex: 1, marginLeft: spacing.md },
  nameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  name: { color: colors.ink, flexShrink: 1, fontSize: 17, fontWeight: "800" },
  sharedPill: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.muted, fontSize: 28 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
