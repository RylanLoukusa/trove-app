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
    keyboardAvoiding: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    notFoundBody: {
      flex: 1,
      padding: spacing.lg,
    },
    titleRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      flex: 1,
      fontSize: 32,
      fontWeight: "900",
    },
    headerActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
    },
    headerIconButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    headerIconButtonPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.96 }],
    },
    purpose: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
      marginTop: spacing.sm,
    },
    accessBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    accessBadgeText: {
      color: colors.accentDark,
      fontSize: 12,
      fontWeight: "900",
    },
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    action: {
      flex: 1,
    },
    section: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "900",
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    showAllSubfolders: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: spacing.xs,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    showAllSubfoldersPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
    showAllSubfoldersText: {
      color: colors.accentDark,
      fontSize: 14,
      fontWeight: "900",
    },
    fullItemBlock: {
      marginTop: spacing.lg,
    },
    fullItemCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      padding: spacing.md,
    },
    fullItemHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
    },
    fullItemTitle: {
      color: colors.ink,
      flex: 1,
      fontSize: 18,
      fontWeight: "900",
    },
    openItemButton: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    openItemButtonPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.98 }],
    },
    openItemButtonIcon: {
      color: colors.accentDark,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 22,
    },
    fullItemLink: {
      backgroundColor: colors.background,
      borderRadius: 14,
      marginTop: spacing.md,
      padding: spacing.md,
    },
    fullItemLinkPressed: {
      opacity: 0.72,
    },
    fullItemLinkText: {
      color: colors.blue,
      fontWeight: "800",
    },
    fullItemMedia: {
      marginTop: spacing.md,
    },
    fullItemDescription: {
      color: colors.ink,
      fontSize: 15,
      lineHeight: 22,
      marginTop: spacing.md,
    },
    fullItemList: {
      backgroundColor: colors.background,
      borderRadius: 14,
      marginTop: spacing.md,
      padding: spacing.sm,
    },
    fullItemListRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingVertical: 4,
    },
    fullItemCheckbox: {
      alignItems: "center",
      borderRadius: 10,
      minHeight: 44,
      justifyContent: "center",
      width: 44,
    },
    fullItemCheckboxPressed: {
      backgroundColor: colors.surface,
      opacity: 0.72,
    },
    fullItemMarker: {
      color: colors.accentDark,
      fontSize: 24,
      fontWeight: "900",
      width: 30,
    },
    fullItemBullet: {
      fontSize: 16,
      textAlign: "center",
    },
    fullItemListText: {
      color: colors.ink,
      flex: 1,
      fontSize: 15,
      lineHeight: 22,
    },
    fullItemListTextDone: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    fullItemAttachments: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    fullItemAttachmentImage: {
      borderRadius: 14,
      height: 300,
      width: "100%",
    },
    fullItemAttachmentVideo: {
      alignItems: "center",
      backgroundColor: "#000",
      borderRadius: 14,
      height: 300,
      justifyContent: "center",
      width: "100%",
    },
    fullItemAttachmentVideoText: {
      color: colors.surface,
      fontWeight: "800",
    },
    fullItemFooter: {
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    fullItemPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    fullItemPill: {
      backgroundColor: colors.background,
      borderRadius: 999,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    fullItemTags: {
      color: colors.muted,
      fontSize: 13,
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
    skeletonFullItemCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    skeletonSection: {
      marginTop: spacing.lg,
    },
  });
