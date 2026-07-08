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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  value: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  compareTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  fieldRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  choiceRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  choice: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    padding: spacing.sm,
  },
  choiceSelected: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accentDark,
  },
  choiceLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  choiceLabelSelected: {
    color: colors.surface,
  },
  compareValue: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  compareValueSelected: {
    color: colors.surface,
  },
  button: {
    marginTop: spacing.sm,
  },
  busy: {
    marginTop: spacing.md,
  },
});
