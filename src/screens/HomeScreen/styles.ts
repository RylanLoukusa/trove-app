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
  kicker: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "800",
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: spacing.md,
  },
  syncPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  syncPillFailed: {
    borderColor: colors.danger,
  },
  syncPillText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  syncPillTextFailed: {
    color: colors.danger,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: spacing.md,
  },
  searchText: {
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  section: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  link: {
    color: colors.accentDark,
    fontWeight: "900",
  },
  settings: {
    marginTop: spacing.lg,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  skeletonCardText: {
    marginTop: spacing.sm,
  },
  skeletonSection: {
    marginTop: spacing.lg,
  },
});
