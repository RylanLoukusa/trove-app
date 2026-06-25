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
  notFoundBody: {
    flex: 1,
    padding: spacing.lg,
  },
  notFoundText: {
    color: colors.muted,
    fontSize: 16,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  itemNav: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  itemNavButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  itemNavButtonPressed: {
    opacity: 0.72,
  },
  itemNavButtonDisabled: {
    opacity: 0.45,
  },
  itemNavText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
  },
  itemNavTextDisabled: {
    color: colors.muted,
  },
  itemNavCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    minWidth: 48,
    textAlign: "center",
  },
  type: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  path: {
    color: colors.accentDark,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  accessBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  accessBadgeText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
  },
  description: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.lg,
  },
  listBlock: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  listRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: 4,
  },
  listCheckbox: {
    alignItems: "center",
    borderRadius: 8,
    minHeight: 34,
    justifyContent: "center",
    width: 34,
  },
  listCheckboxPressed: {
    backgroundColor: colors.background,
    opacity: 0.72,
  },
  listMarker: {
    color: colors.accentDark,
    fontSize: 18,
    fontWeight: "900",
    width: 24,
  },
  listBullet: {
    textAlign: "center",
  },
  listText: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
  },
  listTextDone: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  attachmentBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  attachmentImage: {
    borderRadius: 18,
    height: 400,
    width: "100%",
  },
  attachmentVideo: {
    alignItems: "center",
    backgroundColor: "#000",
    borderRadius: 18,
    height: 400,
    justifyContent: "center",
    width: "100%",
  },
  attachmentVideoText: {
    color: colors.surface,
    fontWeight: "800",
  },
  mediaPreview: {
    marginTop: spacing.lg,
  },
  preview: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  previewTitle: {
    color: colors.ink,
    fontWeight: "900",
  },
  url: {
    color: colors.blue,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pill: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.muted,
    fontWeight: "800",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  section: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.lg,
  },
  meta: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  relatedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  relatedCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
  relatedTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  relatedMeta: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  button: {
    marginTop: spacing.md,
  },
  readOnlyNote: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
