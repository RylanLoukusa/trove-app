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
      paddingBottom: 120,
      paddingHorizontal: spacing.md,
    },
    titleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
      paddingTop: 2,
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
    caption: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    empty: {
      alignItems: "center",
      paddingTop: spacing.xl,
    },
    emptyTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700",
    },
    emptyText: {
      color: colors.muted,
      fontSize: 15,
      marginTop: 4,
      textAlign: "center",
    },
    missing: {
      color: colors.muted,
      fontSize: 17,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
    },
    skeletonRow: {
      marginTop: spacing.md,
    },
    comments: {
      marginTop: spacing.lg,
    },
  });
