import { StyleSheet } from "react-native";
import { spacing, ThemeColors, withAlpha } from "../../theme/theme";

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    field: {
      alignItems: "center",
      backgroundColor: withAlpha(colors.border, 0.75),
      borderRadius: 12,
      flexDirection: "row",
      gap: spacing.xs,
      height: 40,
      marginHorizontal: spacing.md,
      marginTop: 2,
      paddingHorizontal: 12,
    },
    input: {
      color: colors.ink,
      flex: 1,
      fontSize: 17,
      height: 40,
      padding: 0,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: spacing.xl * 2,
      paddingHorizontal: spacing.md,
    },
    hint: {
      color: colors.muted,
      fontSize: 15,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.lg,
      textAlign: "center",
    },
    lineRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
    },
    lineRowPressed: {
      backgroundColor: withAlpha(colors.border, 0.5),
    },
    lineMark: {
      alignItems: "center",
      width: 20,
    },
    lineText: {
      flex: 1,
    },
    lineTitle: {
      color: colors.ink,
      fontSize: 16,
      lineHeight: 21,
    },
    lineTitleDone: {
      color: colors.muted,
    },
    lineMatch: {
      fontWeight: "800",
    },
    lineList: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 2,
    },
  });
