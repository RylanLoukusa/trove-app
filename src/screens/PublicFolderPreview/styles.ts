import { StyleSheet } from "react-native";
import { spacing, ThemeColors } from "../../theme/theme";

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    center: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    unavailableTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700",
    },
    unavailableText: {
      color: colors.muted,
      fontSize: 15,
      marginTop: 4,
      textAlign: "center",
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: spacing.xl * 2,
      paddingHorizontal: spacing.md,
    },
    eyebrow: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
      paddingHorizontal: spacing.xs,
    },
    titleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    icon: {
      alignItems: "center",
      borderRadius: 11,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    emoji: {
      fontSize: 19,
    },
    title: {
      color: colors.ink,
      flex: 1,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.3,
      lineHeight: 34,
    },
    purpose: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    emptyText: {
      color: colors.muted,
      fontSize: 15,
      paddingHorizontal: spacing.xs,
    },
    footer: {
      color: colors.muted,
      fontSize: 13,
      marginTop: spacing.xl,
      textAlign: "center",
    },
  });
