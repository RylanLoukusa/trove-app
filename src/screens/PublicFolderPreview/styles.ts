import { StyleSheet } from "react-native";
import { radius, spacing, ThemeColors } from "../../theme/theme";

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
    scroll: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
    },
    eyebrow: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    title: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "900",
      marginTop: spacing.xs,
    },
    purpose: {
      color: colors.muted,
      fontSize: 15,
      marginTop: spacing.xs,
    },
    section: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "800",
      marginBottom: spacing.sm,
      marginTop: spacing.lg,
    },
    itemCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      marginBottom: spacing.sm,
      overflow: "hidden",
      padding: spacing.md,
    },
    itemImage: {
      backgroundColor: colors.background,
      borderRadius: radius.sm,
      height: 160,
      marginBottom: spacing.sm,
      width: "100%",
    },
    itemTitle: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "700",
    },
    itemDescription: {
      color: colors.muted,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    itemUrl: {
      color: colors.accentDark,
      fontSize: 13,
      marginTop: spacing.xs,
    },
    listRow: {
      flexDirection: "row",
      marginTop: spacing.xs,
    },
    listRowText: {
      color: colors.ink,
      fontSize: 14,
      marginLeft: spacing.xs,
    },
    listRowTextChecked: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    folderChip: {
      alignSelf: "flex-start",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
    },
    folderChipText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700",
      marginTop: spacing.sm,
      textAlign: "center",
    },
    footer: {
      alignItems: "center",
      marginTop: spacing.xl,
    },
    footerText: {
      color: colors.muted,
      fontSize: 13,
      textAlign: "center",
    },
  });
