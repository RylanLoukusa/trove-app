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
    content: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
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
    requiredMarker: {
      color: colors.danger,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: "transparent",
      borderWidth: 1,
      borderRadius: 16,
      color: colors.ink,
      padding: spacing.md,
    },
    inputError: {
      borderColor: colors.danger,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
      marginTop: spacing.xs,
    },
    textArea: {
      minHeight: 120,
    },
    section: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "900",
      marginTop: spacing.lg,
    },
    listEditor: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: spacing.xs,
      padding: spacing.md,
    },
    listKindPicker: {
      marginBottom: spacing.sm,
    },
    listRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    listDragHandle: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xs,
    },
    listRowContent: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: spacing.sm,
    },
    listMarker: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderRadius: 12,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    listMarkerText: {
      color: colors.accentDark,
      fontSize: 24,
      fontWeight: "900",
    },
    listBulletText: {
      color: colors.accentDark,
      fontSize: 16,
      fontWeight: "900",
    },
    listInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      color: colors.ink,
      flex: 1,
      padding: spacing.sm,
    },
    listIndentButton: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xs,
    },
    listButtons: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    listButton: {
      flex: 1,
    },
    button: {
      marginTop: spacing.lg,
    },
  });
