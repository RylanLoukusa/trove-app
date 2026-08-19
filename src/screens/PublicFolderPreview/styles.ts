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
    // Item card visuals mirror FolderScreen's fullItem* styles (src/screens/FolderScreen/styles.ts)
    // so a shared folder looks the same here as it does inside the app.
    itemCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: spacing.md,
      padding: spacing.md,
    },
    itemHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
    },
    itemTitle: {
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
    itemTagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    itemLink: {
      backgroundColor: colors.background,
      borderRadius: 14,
      marginTop: spacing.md,
      padding: spacing.md,
    },
    itemLinkPressed: {
      opacity: 0.72,
    },
    itemLinkText: {
      color: colors.blue,
      fontWeight: "800",
    },
    itemMedia: {
      marginTop: spacing.md,
    },
    itemMediaRow: {
      gap: 10,
      paddingRight: spacing.md,
    },
    // Matches MediaCollectionDisplay's centerContent behavior: a single image centers
    // instead of hugging the left edge like a scrollable multi-image row does.
    itemMediaRowCentered: {
      flexGrow: 1,
      justifyContent: "center",
      paddingRight: 0,
    },
    // 300x300 matches FolderScreen's MediaCollectionDisplay usage (itemHeight/itemWidth={300}).
    itemMediaTile: {
      borderRadius: 8,
      height: 300,
      overflow: "hidden",
      width: 300,
    },
    itemDescription: {
      color: colors.ink,
      fontSize: 15,
      lineHeight: 22,
      marginTop: spacing.md,
    },
    itemList: {
      backgroundColor: colors.background,
      borderRadius: 14,
      marginTop: spacing.md,
      padding: spacing.sm,
    },
    listRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingVertical: 4,
    },
    listMarker: {
      color: colors.accentDark,
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
      width: 30,
    },
    listBullet: {
      fontSize: 16,
    },
    listRowText: {
      color: colors.ink,
      flex: 1,
      fontSize: 15,
      lineHeight: 22,
    },
    listRowTextChecked: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    itemAttachments: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    // 300 matches FolderScreen's fullItemAttachmentImage/fullItemAttachmentVideo height.
    itemAttachmentImage: {
      borderRadius: 14,
      height: 300,
      width: "100%",
    },
    itemAttachmentVideo: {
      borderRadius: 14,
      height: 300,
      width: "100%",
    },
    // Matches src/components/FolderCard.tsx's visual style -- tapping navigates into the
    // subfolder, same as the app, just without the edit/manage affordances FolderCard's
    // parent screen adds separately.
    folderCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 18,
      flexDirection: "row",
      marginTop: spacing.lg,
      padding: spacing.md,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 12,
    },
    folderCardPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
    folderCardChevron: {
      color: colors.muted,
      fontSize: 28,
    },
    folderCardIcon: {
      alignItems: "center",
      borderRadius: 14,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    folderCardEmoji: {
      fontSize: 22,
    },
    folderCardContent: {
      flex: 1,
      marginLeft: spacing.md,
    },
    folderCardName: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "800",
    },
    folderCardMeta: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 2,
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
