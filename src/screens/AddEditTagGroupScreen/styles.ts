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
    notFoundBody: {
      flex: 1,
      padding: spacing.lg,
    },
    notFoundText: {
      color: colors.muted,
      fontSize: 16,
    },
    title: {
      color: colors.ink,
      fontSize: 32,
      fontWeight: "900",
      marginBottom: spacing.lg,
    },
    label: {
      color: colors.muted,
      fontWeight: "800",
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      color: colors.ink,
      padding: spacing.md,
    },
    section: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "900",
      marginTop: spacing.lg,
    },
    optionRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.xs,
      padding: spacing.sm,
    },
    colorSwatch: {
      borderRadius: 15,
      height: 30,
      width: 30,
    },
    colorSwatchEmpty: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderStyle: "dashed",
      borderWidth: 2,
    },
    optionInput: {
      color: colors.ink,
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
      paddingVertical: spacing.xs,
    },
    reorderColumn: {
      gap: 2,
    },
    reorderButton: {
      alignItems: "center",
      justifyContent: "center",
      padding: 4,
    },
    deleteButton: {
      alignItems: "center",
      justifyContent: "center",
      padding: 4,
    },
    addOptionButton: {
      marginTop: spacing.sm,
    },
    deleteGroupButton: {
      marginTop: spacing.xl,
    },
  });
