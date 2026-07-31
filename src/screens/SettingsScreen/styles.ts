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
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginVertical: spacing.lg,
  },
  stat: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    color: colors.ink,
    fontWeight: "800",
    marginVertical: spacing.xs,
    padding: spacing.md,
  },
  button: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.lg,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: spacing.xs,
    marginTop: spacing.md,
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
  error: {
    color: colors.danger,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  authRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  authAction: {
    flex: 1,
  },
  signedIn: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  legalLinks: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  legalLink: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    padding: spacing.md,
  },
  legalLinkPressed: {
    opacity: 0.7,
  },
  legalLinkText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  legalLinkArrow: {
    color: colors.muted,
    fontSize: 26,
    lineHeight: 26,
  },
  skeletonBody: {
    marginTop: spacing.lg,
  },
  skeletonSection: {
    marginTop: spacing.lg,
  },
});
