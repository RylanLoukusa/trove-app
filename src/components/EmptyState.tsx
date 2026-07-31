import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  title: string;
  message: string;
};

export const EmptyState = ({ title, message }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginVertical: spacing.sm,
    padding: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: "center",
  },
});
