import { StyleSheet } from "react-native";
import { spacing, ThemeColors } from "../../theme/theme";

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    title: {
      color: colors.ink,
      fontSize: 32,
      fontWeight: "900",
    },
    body: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
      marginVertical: spacing.lg,
    },
    label: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "800",
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 16,
      padding: spacing.md,
    },
    button: {
      marginTop: spacing.lg,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginTop: spacing.sm,
    },
  });
