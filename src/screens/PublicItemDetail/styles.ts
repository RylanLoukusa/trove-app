import { StyleSheet } from "react-native";
import { spacing, ThemeColors } from "../../theme/theme";

// Values below are copied from ItemDetailScreen's styles (src/screens/ItemDetailScreen/styles.ts)
// so an opened item looks the same here as it does in the app.
export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    center: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    type: {
      color: colors.accentDark,
      fontSize: 13,
      fontWeight: "900",
    },
    title: {
      color: colors.ink,
      fontSize: 32,
      fontWeight: "900",
      marginTop: spacing.xs,
    },
    path: {
      color: colors.accentDark,
      fontWeight: "800",
      marginTop: spacing.xs,
    },
    preview: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    previewTitle: {
      color: colors.ink,
      fontWeight: "900",
    },
    url: {
      color: colors.blue,
      marginTop: spacing.xs,
    },
    mediaPreview: {
      marginTop: spacing.lg,
    },
    mediaRow: {
      gap: 10,
      paddingRight: spacing.md,
    },
    mediaTile: {
      borderRadius: 8,
      height: 400,
      overflow: "hidden",
      width: 320,
    },
    contentCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    description: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 26,
    },
    descriptionSecondary: {
      marginTop: spacing.sm,
    },
    listBlock: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    listRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginVertical: 4,
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
    listText: {
      color: colors.ink,
      flex: 1,
      fontSize: 16,
      lineHeight: 23,
    },
    listTextDone: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    attachmentBlock: {
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    attachmentImage: {
      borderRadius: 18,
      height: 400,
      width: "100%",
    },
    attachmentVideo: {
      borderRadius: 18,
      height: 400,
      width: "100%",
    },
    createdAt: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      marginTop: spacing.lg,
    },
    tagGroupLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.4,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
      textTransform: "uppercase",
    },
    tagRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    readOnlyNote: {
      color: colors.muted,
      fontWeight: "800",
      marginTop: spacing.lg,
      textAlign: "center",
    },
  });
