import { StyleSheet } from "react-native";

import { spacing, ThemeColors } from "../theme/theme";

// Shared by the plain screens that list things set aside: Recently deleted,
// Archived and Templates.
export const createSetAsideStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      paddingBottom: 60,
      paddingHorizontal: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: -0.6,
      lineHeight: 41,
      paddingHorizontal: spacing.xs,
    },
    note: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 21,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    empty: {
      color: colors.muted,
      fontSize: 16,
      marginTop: spacing.xl,
      textAlign: "center",
    },
  });
