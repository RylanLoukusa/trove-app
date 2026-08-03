import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ItemType, SavedItem } from "../types/models";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { bulletGlyphForIndent, normalizeItemType } from "../utils/itemTypes";
import { MediaCollectionDisplay } from "./MediaCollectionDisplay";

const typeIcon: Record<ItemType, string> = {
  text: "📝",
  list: "☑️",
  link: "🔗",
  media: "🖼️",
  image: "🖼️",
  video: "🎥",
};

type Props = {
  item: SavedItem;
  folderPath?: string;
  onPress: () => void;
};

export const ItemCard = ({ item, folderPath, onPress }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mediaCount = item.mediaItems?.length ?? (item.media?.storagePath ? 1 : 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.icon}>{typeIcon[normalizeItemType(item.type)]}</Text>
      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        {!!folderPath && <Text style={styles.path}>{folderPath}</Text>}
        {!!item.description && (
          <Text numberOfLines={2} style={styles.description}>
            {item.description}
          </Text>
        )}
        {item.type === "list" && !!item.listItems?.length && (
          <View style={styles.previewBlock}>
            {item.listItems.slice(0, 3).map((listItem) => (
              <Text
                key={listItem.id}
                numberOfLines={1}
                style={[styles.previewLine, { marginLeft: Math.min(listItem.indentLevel ?? 0, 3) * spacing.md }]}
              >
                {listItem.kind === "check" ? (listItem.checked ? "☑" : "☐") : bulletGlyphForIndent(listItem.indentLevel)}{" "}
                {listItem.text || "Untitled row"}
              </Text>
            ))}
          </View>
        )}
        {!!item.attachments?.length && (
          <Text style={styles.attachmentMeta}>
            {item.attachments.length} attachment{item.attachments.length === 1 ? "" : "s"}
          </Text>
        )}
        {mediaCount > 0 && (
          <MediaCollectionDisplay
            centerContent={false}
            media={item.media}
            mediaItems={item.mediaItems}
            itemHeight={74}
            itemWidth={74}
            nativeVideoControls={false}
            style={styles.mediaStrip}
          />
        )}
        <View style={styles.row}>
          <Text style={styles.pill}>{item.status}</Text>
          <Text style={[styles.pill, item.priority === "high" && styles.high]}>{item.priority}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: "row",
    marginVertical: spacing.xs,
    padding: spacing.md,
  },
  icon: { fontSize: 22, marginRight: spacing.md, marginTop: 2 },
  content: { flex: 1 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  path: { color: colors.accentDark, fontSize: 12, marginTop: 2 },
  description: { color: colors.muted, fontSize: 13, marginTop: spacing.xs },
  previewBlock: { marginTop: spacing.xs },
  previewLine: { color: colors.muted, fontSize: 13, marginTop: 2 },
  attachmentMeta: { color: colors.accentDark, fontSize: 12, fontWeight: "800", marginTop: spacing.xs },
  mediaStrip: { marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  pill: {
    backgroundColor: colors.background,
    borderRadius: 999,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  high: { color: colors.danger },
  pressed: { opacity: 0.75 },
});
