import { StyleSheet } from "react-native";
import { spacing, ThemeColors } from "../../theme/theme";

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.surface,
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
      paddingHorizontal: 20,
      paddingTop: spacing.xs,
    },
    title: {
      color: colors.ink,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.3,
      lineHeight: 34,
    },
    caption: {
      color: colors.muted,
      fontSize: 13,
      marginBottom: spacing.xs,
      marginTop: 4,
    },
    empty: {
      color: colors.muted,
      fontSize: 17,
      paddingVertical: spacing.sm,
    },
    footer: {
      color: colors.muted,
      fontSize: 13,
      marginTop: spacing.xl,
      textAlign: "center",
    },
  });
