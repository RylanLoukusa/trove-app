import { StyleSheet } from "react-native";
import { colors, radius, spacing } from "../../theme/theme";

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  notFoundBody: {
    flex: 1,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  path: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  choiceRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  choicePill: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choicePillSelected: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accentDark,
  },
  choicePillPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
  choiceLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  choiceLabelSelected: {
    color: colors.surface,
  },
  choiceDetail: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  choiceDetailSelected: {
    color: colors.surface,
    opacity: 0.82,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  submitButton: {
    marginTop: spacing.md,
  },
  section: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
  },
  loadingRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 84,
    justifyContent: "center",
  },
  accessCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  accessHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
  },
  accessCopy: {
    flex: 1,
  },
  accessTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  accessMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  smallButton: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  smallButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  smallButtonText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
  },
  dangerButton: {
    borderColor: "#E2BBB5",
  },
  dangerButtonText: {
    color: colors.danger,
  },
});
