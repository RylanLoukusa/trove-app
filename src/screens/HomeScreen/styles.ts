import { StyleSheet } from "react-native";
import { spacing, ThemeColors, withAlpha } from "../../theme/theme";

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
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xs,
    },
    title: {
      color: colors.ink,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: -0.6,
      lineHeight: 41,
    },
    pressed: {
      opacity: 0.6,
    },
    upgradePill: {
      alignItems: "center",
      backgroundColor: colors.buttonPrimaryBg,
      borderRadius: 999,
      flexDirection: "row",
      gap: 4,
      marginRight: spacing.xs,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    upgradePillText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "800",
    },
    sync: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      paddingBottom: 9,
    },
    syncDot: {
      backgroundColor: colors.accent,
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    syncDotFailed: {
      backgroundColor: colors.danger,
    },
    syncText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
    },
    syncTextFailed: {
      color: colors.danger,
    },
    search: {
      alignItems: "center",
      backgroundColor: withAlpha(colors.border, 0.75),
      borderRadius: 12,
      flexDirection: "row",
      gap: spacing.xs,
      height: 40,
      marginTop: spacing.sm,
      paddingHorizontal: 12,
    },
    searchText: {
      color: colors.muted,
      fontSize: 17,
    },
    welcome: {
      backgroundColor: withAlpha(colors.accent, 0.16),
      borderRadius: 14,
      marginTop: spacing.md,
      padding: spacing.md,
    },
    welcomeTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700",
    },
    welcomeBody: {
      color: colors.ink,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 4,
    },
    welcomeButton: {
      alignSelf: "flex-start",
      marginTop: spacing.sm,
    },
    welcomeButtonText: {
      color: colors.accentDark,
      fontSize: 15,
      fontWeight: "700",
    },
    hint: {
      color: colors.muted,
      fontSize: 14,
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
    },
    skeleton: {
      marginTop: spacing.lg,
    },
    skeletonRow: {
      marginTop: spacing.md,
    },
  });
