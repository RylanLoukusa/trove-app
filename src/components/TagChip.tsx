import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  label: string;
  onPress?: () => void;
};

export const TagChip = ({ label, onPress }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chip: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    pressed: {
      opacity: 0.72,
    },
    label: {
      color: colors.accentDark,
      fontSize: 13,
      fontWeight: "800",
    },
  });
