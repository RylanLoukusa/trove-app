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
      fontSize: 32,
      fontWeight: "900",
      marginBottom: spacing.xs,
    },
    subtitle: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.lg,
    },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      flexDirection: "row",
      marginBottom: spacing.sm,
      padding: spacing.md,
    },
    rowPressed: {
      opacity: 0.75,
    },
    rowMain: {
      flex: 1,
    },
    rowTitleLine: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
    },
    rowTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "800",
    },
    rowSubtitle: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 2,
    },
    badge: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    reorderColumn: {
      gap: 2,
      marginLeft: spacing.sm,
    },
    reorderButton: {
      alignItems: "center",
      justifyContent: "center",
      padding: 4,
    },
    addButton: {
      marginTop: spacing.md,
    },
  });
