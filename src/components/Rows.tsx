import React, { Children, ReactNode, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SquarePen, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, ThemeColors, withAlpha } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { Folder, SavedItem, SavedListItem } from "../types/models";
import { isSharedAccess } from "../utils/access";
import { listDisplayTitle, listPreviewText } from "../utils/listEntries";
import { formatListDate } from "../utils/listView";

// Small caps heading above a group of rows, with an optional action.
export const SectionHeader = ({ title, action }: { title: string; action?: ReactNode }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {action}
    </View>
  );
};

// The text button on the right of a section header.
export const SectionLink = ({ label, onPress }: { label: string; onPress: () => void }) => {
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress}>
      {({ pressed }) => (
        <Text style={{ color: colors.accentDark, fontSize: 15, fontWeight: "600", opacity: pressed ? 0.5 : 1 }}>{label}</Text>
      )}
    </Pressable>
  );
};

// Rows on one rounded card, with a hairline between them.
export const RowGroup = ({ children }: { children: ReactNode }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rows = Children.toArray(children);
  return (
    <View style={styles.group}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 && <View style={styles.divider} />}
          {row}
        </View>
      ))}
    </View>
  );
};

// Folders as a strip of chips that scrolls sideways, so the lists under it
// stay near the top of the screen. `bleed` is the screen's side padding, which
// the strip scrolls through.
export const FolderStrip = ({
  folders,
  countFor,
  onOpen,
  bleed = spacing.md,
}: {
  folders: Array<Pick<Folder, "id" | "name" | "icon" | "color" | "accessRole" | "ownerId">>;
  countFor: (folderId: string) => number;
  onOpen: (folderId: string) => void;
  bleed?: number;
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={[styles.strip, { paddingHorizontal: bleed }]}
    >
      {folders.map((folder) => {
        const count = countFor(folder.id);
        return (
          <Pressable
            key={folder.id}
            accessibilityRole="button"
            accessibilityLabel={`${folder.name}, ${count} ${count === 1 ? "list" : "lists"}`}
            onPress={() => onOpen(folder.id)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <View style={[styles.chipIcon, { backgroundColor: folder.color ?? colors.border }]}>
              <Text style={styles.chipEmoji}>{folder.icon ?? "📁"}</Text>
            </View>
            <Text numberOfLines={1} style={styles.chipName}>
              {folder.name}
            </Text>
            {isSharedAccess(folder) && <Users size={13} color={colors.muted} />}
            <Text style={styles.count}>{count}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export const ListRow = ({
  list,
  // When the list last changed, counting edits to its lines.
  activityAt,
  // Where the list is kept, shown when the row isn't already inside that folder.
  folderLabel,
  onPress,
  onLongPress,
}: {
  list: Pick<SavedItem, "title" | "updatedAt"> & { listItems?: Array<Pick<SavedListItem, "kind" | "text" | "checked">> };
  activityAt?: string;
  folderLabel?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const lines = list.listItems ?? [];
  const title = listDisplayTitle(list, lines);
  const preview = listPreviewText(list, lines);
  const checks = lines.filter((line) => line.kind === "check");
  const done = checks.filter((line) => line.checked).length;
  const date = formatListDate(activityAt ?? list.updatedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={onLongPress ? "Hold for more actions" : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, styles.listRow, pressed && styles.rowPressed]}
    >
      <View style={styles.listText}>
        <Text numberOfLines={1} style={styles.listTitle}>
          {title}
        </Text>
        <View style={styles.listMeta}>
          <Text style={styles.listDate}>{date}</Text>
          <Text numberOfLines={1} style={styles.listPreview}>
            {preview || (folderLabel ? folderLabel : "No lines yet")}
          </Text>
        </View>
        {!!folderLabel && !!preview && (
          <Text numberOfLines={1} style={styles.listFolder}>
            {folderLabel}
          </Text>
        )}
      </View>
      {checks.length > 0 && (
        <Text accessibilityLabel={`${done} of ${checks.length} done`} style={styles.count}>
          {done}/{checks.length}
        </Text>
      )}
    </Pressable>
  );
};

// The floating button that starts a new list.
export const ComposeButton = ({ onPress, label = "New list" }: { onPress: () => void; label?: string }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compose,
        { bottom: Math.max(insets.bottom, spacing.sm) + spacing.sm },
        pressed && styles.composePressed,
      ]}
    >
      <SquarePen size={24} color={colors.onAccent} strokeWidth={2.2} />
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
      marginTop: spacing.lg,
      minHeight: 28,
      paddingHorizontal: spacing.xs,
    },
    sectionTitle: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    group: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: "hidden",
    },
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: spacing.md,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    rowPressed: {
      backgroundColor: withAlpha(colors.border, 0.5),
    },
    strip: {
      gap: spacing.xs,
    },
    chip: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 14,
      flexDirection: "row",
      gap: 8,
      height: 46,
      maxWidth: 220,
      paddingLeft: 8,
      paddingRight: 14,
    },
    chipPressed: {
      backgroundColor: withAlpha(colors.border, 0.6),
    },
    chipIcon: {
      alignItems: "center",
      borderRadius: 9,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    chipEmoji: {
      fontSize: 15,
    },
    chipName: {
      color: colors.ink,
      flexShrink: 1,
      fontSize: 16,
      fontWeight: "600",
    },
    count: {
      color: colors.muted,
      fontSize: 15,
      fontVariant: ["tabular-nums"],
    },
    listRow: {
      minHeight: 62,
      paddingVertical: 10,
    },
    listText: {
      flex: 1,
    },
    listTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "600",
    },
    listMeta: {
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: 3,
    },
    listDate: {
      color: colors.muted,
      fontSize: 14,
    },
    listPreview: {
      color: withAlpha(colors.muted, 0.85),
      flex: 1,
      fontSize: 14,
    },
    listFolder: {
      color: withAlpha(colors.muted, 0.85),
      fontSize: 12,
      marginTop: 3,
    },
    compose: {
      alignItems: "center",
      backgroundColor: colors.buttonPrimaryBg,
      borderRadius: 29,
      height: 58,
      justifyContent: "center",
      position: "absolute",
      right: spacing.md + 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      width: 58,
    },
    composePressed: {
      opacity: 0.85,
      transform: [{ scale: 0.96 }],
    },
  });
