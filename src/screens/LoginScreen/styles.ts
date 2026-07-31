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
      flexGrow: 1,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.sm,
    },
    title: {
      color: colors.ink,
      fontSize: 34,
      fontWeight: "900",
      lineHeight: 40,
      textAlign: "center",
    },
    body: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
      marginVertical: spacing.lg,
    },
    label: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "800",
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    labelRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.md,
    },
    labelInline: {
      marginTop: 0,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 16,
      padding: spacing.md,
    },
    button: {
      marginTop: spacing.lg,
    },
    bottomAuthArea: {
      marginTop: "auto",
      paddingTop: spacing.xl,
    },
    authSection: {
      marginTop: 0,
    },
    authButtonsStack: {
      gap: spacing.sm,
    },
    googleButton: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: "#FFFFFF",
      borderColor: "#000000",
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      height: 48,
      justifyContent: "center",
      width: "100%",
    },
    googleButtonText: {
      color: "#000000",
      fontSize: 15,
      fontWeight: "800",
    },
    appleButton: {
      height: 48,
      width: "100%",
    },
    emailButton: {
      borderColor: "#000000",
      borderRadius: 8,
      height: 48,
      marginTop: 0,
    },
    authOptionDisabled: {
      opacity: 0.48,
    },
    emailFlowTopBar: {
      alignItems: "flex-start",
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    emailFlowBackButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      minHeight: 34,
      paddingRight: spacing.md,
      paddingVertical: spacing.xs,
    },
    emailFlowBackText: {
      color: colors.muted,
      fontSize: 15,
      fontWeight: "900",
    },
    emailFormSection: {
      marginTop: 0,
    },
    busyIndicator: {
      marginTop: spacing.lg,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginTop: spacing.sm,
    },
    errorCentered: {
      color: colors.danger,
      fontSize: 14,
      marginTop: spacing.lg,
      textAlign: "center",
    },
    forgotLink: {
      color: colors.accentDark,
      fontSize: 13,
      fontWeight: "900",
      paddingBottom: spacing.xs,
    },
    formTitle: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: spacing.sm,
    },
    inlineAction: {
      alignItems: "center",
      marginTop: spacing.md,
      minHeight: 40,
      justifyContent: "center",
    },
    inlineActionText: {
      color: colors.accentDark,
      fontSize: 14,
      fontWeight: "900",
    },
    inlineLinkPressed: {
      opacity: 0.64,
    },
    legalText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
    },
    legalFooter: {
      marginTop: spacing.xl,
    },
    legalLink: {
      color: colors.accentDark,
      fontWeight: "900",
    },
  });
