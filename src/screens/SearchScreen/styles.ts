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
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: spacing.md,
  },
  clearQuery: {
    alignSelf: "flex-end",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  clearQueryText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "800",
  },
  controlScroller: {
    marginTop: spacing.md,
  },
  controlRow: {
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextSelected: {
    color: colors.surface,
  },
  sortBlock: {
    marginTop: spacing.md,
  },
  sortLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  sortRow: {
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  sortChip: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sortChipSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
  },
  sortChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  sortChipTextSelected: {
    color: colors.accentDark,
  },
  controlPressed: {
    opacity: 0.72,
  },
  resetRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.md,
  },
  resetText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
    paddingLeft: spacing.md,
  },
  section: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
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
