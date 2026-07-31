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
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  notFoundBody: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 44,
    borderWidth: 1,
    height: 88,
    justifyContent: "center",
    overflow: "hidden",
    width: 88,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  avatarText: {
    color: colors.accentDark,
    fontSize: 26,
    fontWeight: "900",
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    marginTop: spacing.xs,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  readOnlyRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: spacing.xs,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  readOnlyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  success: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  button: {
    marginTop: spacing.lg,
  },
  skeletonSection: {
    marginTop: spacing.lg,
  },
});
