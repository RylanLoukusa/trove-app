import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  label: string;
  detail?: string;
  tone?: string;
  isSelected: boolean;
  onPress: () => void;
};

export const OptionChoiceRow = ({ label, detail, tone, isSelected, onPress }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const markerTone = tone ?? colors.accent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.row,
        isSelected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.marker, { backgroundColor: markerTone }]}>
        {isSelected && <Text style={styles.markerCheck}>✓</Text>}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, isSelected && styles.selectedLabel]}>{label}</Text>
        {!!detail && <Text style={styles.detail}>{detail}</Text>}
      </View>
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
    selected: {
      borderColor: colors.accent,
      borderWidth: 2,
    },
    marker: {
      alignItems: "center",
      borderRadius: 10,
      height: 20,
      justifyContent: "center",
      width: 20,
    },
    markerCheck: {
      color: colors.surface,
      fontSize: 13,
      fontWeight: "900",
      lineHeight: 16,
    },
    copy: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    label: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: "800",
    },
    selectedLabel: {
      color: colors.accentDark,
    },
    detail: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 2,
    },
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
  });
