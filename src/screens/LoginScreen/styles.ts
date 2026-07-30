import { StyleSheet } from "react-native";
import { colors, spacing } from "../../theme/theme";

export const styles = StyleSheet.create({
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
  authOptionsRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "center",
  },
  authOption: {
    alignItems: "center",
    gap: spacing.xs,
    width: 78,
  },
  authOptionCircle: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  authOptionDisabled: {
    opacity: 0.48,
  },
  authOptionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  authOptionPressed: {
    opacity: 0.72,
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
