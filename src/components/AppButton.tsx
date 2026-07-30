import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Variant = "primary" | "secondary" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  style?: ViewStyle;
  disabled?: boolean;
  textColor?: string;
};

export const AppButton = ({ label, onPress, variant = "primary", style, disabled = false, textColor }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }: { pressed: boolean }) => [
        styles.base,
        styles[variant],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant !== "primary" && styles.secondaryText,
          textColor ? { color: textColor } : null,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      alignItems: "center",
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    primary: { backgroundColor: colors.accentDark },
    secondary: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    danger: { backgroundColor: colors.danger },
    text: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
    secondaryText: { color: colors.ink },
    pressed: { opacity: 0.78 },
    disabled: { opacity: 0.5 },
    disabledText: { opacity: 0.7 },
  });
