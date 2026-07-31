import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Folder } from "../types/models";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  path: Folder[];
  onHome: () => void;
  onFolder: (folderId: string) => void;
};

export const Breadcrumbs = ({ path, onHome, onFolder }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Pressable onPress={onHome} style={styles.crumbHit}>
        <Text style={styles.crumb}>Home</Text>
      </Pressable>
      {path.map((folder) => (
        <React.Fragment key={folder.id}>
          <Text style={styles.sep}>›</Text>
          <Pressable onPress={() => onFolder(folder.id)} style={styles.crumbHit}>
            <Text style={styles.crumb}>{folder.name}</Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  crumbHit: {
    borderRadius: radius.sm,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  crumb: {
    color: colors.accentDark,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  sep: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: "700",
    marginHorizontal: spacing.xs,
    opacity: 0.85,
  },
});
