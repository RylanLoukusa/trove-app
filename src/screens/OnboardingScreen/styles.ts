import { StyleSheet } from "react-native";
import { radius, spacing, ThemeColors } from "../../theme/theme";

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    skipRow: {
      alignItems: "flex-end",
      paddingHorizontal: spacing.lg,
    },
    skip: {
      color: colors.muted,
      fontSize: 15,
      fontWeight: "700",
      padding: spacing.xs,
    },
    content: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
    },
    iconWrap: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      height: 96,
      justifyContent: "center",
      marginBottom: spacing.xl,
      width: 96,
    },
    title: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "900",
      marginBottom: spacing.sm,
      textAlign: "center",
    },
    body: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 23,
      textAlign: "center",
    },
    dots: {
      flexDirection: "row",
      gap: spacing.xs,
      justifyContent: "center",
      marginBottom: spacing.lg,
    },
    dot: {
      backgroundColor: colors.border,
      borderRadius: 999,
      height: 8,
      width: 8,
    },
    dotActive: {
      backgroundColor: colors.accentDark,
      width: 20,
    },
    footer: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    footerButton: {
      flex: 1,
    },
  });
