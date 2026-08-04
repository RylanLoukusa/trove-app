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
    kicker: {
      color: colors.accentDark,
      fontSize: 14,
      fontWeight: "800",
    },
    title: {
      color: colors.ink,
      fontSize: 36,
      fontWeight: "900",
      letterSpacing: -1,
      marginBottom: spacing.md,
    },
    upgradePill: {
      alignItems: "center",
      backgroundColor: colors.accentDark,
      borderRadius: 999,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    upgradePillPressed: {
      opacity: 0.8,
    },
    upgradePillText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "800",
    },
    syncPill: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    syncPillFailed: {
      borderColor: colors.danger,
    },
    syncPillText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "800",
    },
    syncPillTextFailed: {
      color: colors.danger,
    },
    search: {
      backgroundColor: colors.surface,
      borderRadius: 999,
      padding: spacing.md,
    },
    searchText: {
      color: colors.muted,
    },
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    action: {
      flex: 1,
    },
    rowHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.lg,
    },
    rowHeaderActions: {
      flexDirection: "row",
      gap: spacing.md,
    },
    section: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "900",
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    link: {
      color: colors.accentDark,
      fontWeight: "900",
    },
    legalLinks: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    legalLink: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 52,
      padding: spacing.md,
    },
    legalLinkPressed: {
      opacity: 0.7,
    },
    legalLinkText: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "800",
    },
    legalLinkArrow: {
      color: colors.muted,
      fontSize: 26,
      lineHeight: 26,
    },
    skeletonCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: spacing.sm,
      padding: spacing.md,
    },
    skeletonCardText: {
      marginTop: spacing.sm,
    },
    skeletonSection: {
      marginTop: spacing.lg,
    },
  });
