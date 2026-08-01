import { StyleSheet } from "react-native";
import { radius, spacing, ThemeColors } from "../../theme/theme";

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
      fontSize: 30,
      fontWeight: "900",
      marginBottom: spacing.sm,
    },
    body: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 23,
      marginBottom: spacing.lg,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      marginBottom: spacing.lg,
      padding: spacing.md,
    },
    featureRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    featureBullet: {
      color: colors.accentDark,
      fontSize: 16,
      fontWeight: "900",
    },
    featureText: {
      color: colors.ink,
      flex: 1,
      fontSize: 15,
      lineHeight: 21,
    },
    price: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: spacing.md,
      textAlign: "center",
    },
    button: {
      marginBottom: spacing.sm,
    },
    devNote: {
      color: colors.muted,
      fontSize: 12,
      marginTop: spacing.lg,
      textAlign: "center",
    },
  });
