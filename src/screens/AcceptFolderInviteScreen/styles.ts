import { StyleSheet } from "react-native";
import { radius, spacing, ThemeColors } from "../../theme/theme";

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    icon: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      height: 82,
      justifyContent: "center",
      marginBottom: spacing.lg,
      width: 82,
    },
    iconText: {
      fontSize: 38,
    },
    title: {
      color: colors.ink,
      fontSize: 32,
      fontWeight: "900",
      textAlign: "center",
    },
    message: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
      marginTop: spacing.sm,
      textAlign: "center",
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 20,
      marginTop: spacing.md,
      textAlign: "center",
    },
    primaryButton: {
      marginTop: spacing.lg,
    },
    secondaryButton: {
      marginTop: spacing.sm,
    },
  });
