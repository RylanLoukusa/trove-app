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
  subtitle: {
    color: colors.muted,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  section: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.lg,
  },
  anyFolderChoice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: spacing.xs,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  anyFolderSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  anyFolderText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  anyFolderTextSelected: {
    color: colors.accentDark,
  },
  button: {
    marginVertical: spacing.lg,
  },
  skeletonChoice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: spacing.xs,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skeletonChoiceDetail: {
    marginTop: spacing.xs,
  },
  skeletonSection: {
    marginTop: spacing.lg,
  },
});
