import React, { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ImagePlus } from "lucide-react-native";

import { CheckMark } from "./ListMarks";
import { useLineImageUri } from "../media/lineImages";
import { radius, spacing, ThemeColors, withAlpha } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { LineImage, ListEntry } from "../types/models";
import { formatPrice, formatQuantity, formatRating } from "../utils/fields";

// A list shown as a Collection: each line is a card with its first photo,
// its text and its fields. A plain line with no indent starts a new section,
// so headings still split the collection up.

const COLUMNS = 2;
const GAP = spacing.sm;
const SIDE = 20;

export type CollectionSection = { heading?: ListEntry; cards: ListEntry[] };

// Splits the lines into sections at each top-level plain line.
export const collectionSections = (entries: ListEntry[]): CollectionSection[] => {
  const sections: CollectionSection[] = [];
  entries.forEach((entry) => {
    if (entry.kind === "text" && entry.indentLevel === 0) {
      sections.push({ heading: entry, cards: [] });
      return;
    }
    if (sections.length === 0) sections.push({ cards: [] });
    sections[sections.length - 1].cards.push(entry);
  });
  return sections.filter((section) => section.heading || section.cards.length > 0);
};

// What a card says under its text: price, quantity and rating.
export const cardFieldsLabel = (entry: Pick<ListEntry, "price" | "quantity">): string =>
  [
    ...(entry.price !== undefined ? [formatPrice(entry.price)] : []),
    ...(entry.quantity ? [`×${formatQuantity(entry.quantity)}`] : []),
  ].join(" · ");

type Props = {
  entries: ListEntry[];
  canEdit: boolean;
  selecting: boolean;
  selectedIds: Set<string>;
  onOpen: (entryId: string) => void;
  onToggle: (entry: ListEntry) => void;
  onToggleSelect: (entryId: string) => void;
  // Picks photos for a card that has none.
  onAddPhoto?: (entryId: string) => void;
};

export const CollectionGrid = ({ entries, canEdit, selecting, selectedIds, onOpen, onToggle, onToggleSelect, onAddPhoto }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const cardWidth = width > 0 ? Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const sections = useMemo(() => collectionSections(entries), [entries]);

  return (
    <View testID="collection-grid" onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.root}>
      {cardWidth > 0 &&
        sections.map((section, index) => (
          <View key={section.heading?.id ?? `section-${index}`}>
            {section.heading && (
              <Pressable
                accessibilityRole="header"
                onPress={() => (selecting ? onToggleSelect(section.heading!.id) : onOpen(section.heading!.id))}
              >
                <Text style={[styles.heading, selectedIds.has(section.heading.id) && styles.headingSelected]}>
                  {section.heading.text || " "}
                </Text>
              </Pressable>
            )}
            <View style={styles.grid}>
              {section.cards.map((entry) => (
                <CollectionCard
                  key={entry.id}
                  entry={entry}
                  width={cardWidth}
                  styles={styles}
                  colors={colors}
                  canEdit={canEdit}
                  selecting={selecting}
                  selected={selectedIds.has(entry.id)}
                  onOpen={() => (selecting ? onToggleSelect(entry.id) : onOpen(entry.id))}
                  onToggle={() => onToggle(entry)}
                  onAddPhoto={onAddPhoto && !selecting ? () => onAddPhoto(entry.id) : undefined}
                />
              ))}
            </View>
          </View>
        ))}
    </View>
  );
};

type CardProps = {
  entry: ListEntry;
  width: number;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  canEdit: boolean;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onAddPhoto?: () => void;
};

const CollectionCard = ({ entry, width, styles, colors, canEdit, selecting, selected, onOpen, onToggle, onAddPhoto }: CardProps) => {
  const photo = entry.images?.[0];
  const fields = cardFieldsLabel(entry);
  const label = [
    entry.text || "Untitled",
    entry.kind === "check" ? (entry.checked ? "done" : "") : "",
    fields,
    entry.rating ? `rated ${entry.rating} of 5` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const photoHeight = Math.round(width * 0.8);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={selecting ? "Selects it" : "Opens its details"}
      accessibilityState={selecting ? { selected } : undefined}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, { width }, selected && styles.cardSelected, pressed && styles.pressed]}
    >
      <View style={[styles.photo, { height: photoHeight }]}>
        {photo ? (
          <CardPhoto image={photo} styles={styles} />
        ) : canEdit && onAddPhoto ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={onAddPhoto} style={styles.addPhoto}>
            <ImagePlus size={26} color={colors.muted} />
          </Pressable>
        ) : (
          <Text style={styles.initial}>{(entry.text.trim()[0] ?? "·").toUpperCase()}</Text>
        )}
        {entry.kind === "check" && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={entry.checked ? "Uncheck" : "Check off"}
            accessibilityState={{ checked: entry.checked }}
            disabled={!canEdit || selecting}
            hitSlop={8}
            onPress={onToggle}
            style={styles.check}
          >
            <CheckMark checked={entry.checked} colors={colors} size={24} />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.text, entry.bold && styles.bold, entry.checked && styles.done]}>
          {entry.text || "Untitled"}
        </Text>
        {!!fields && <Text style={styles.fields}>{fields}</Text>}
        {!!entry.rating && <Text style={styles.rating}>{formatRating(entry.rating)}</Text>}
      </View>
    </Pressable>
  );
};

const CardPhoto = ({ image, styles }: { image: LineImage; styles: ReturnType<typeof createStyles> }) => {
  const uri = useLineImageUri(image);
  return uri ? <Image source={{ uri }} resizeMode="cover" style={styles.image} /> : null;
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { paddingBottom: spacing.sm },
    heading: {
      color: colors.ink,
      fontSize: 19,
      fontWeight: "700",
      paddingHorizontal: SIDE,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    headingSelected: { color: colors.accentDark, textDecorationLine: "underline" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingHorizontal: SIDE, paddingVertical: spacing.xs },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    cardSelected: { borderColor: colors.accent, borderWidth: 2 },
    pressed: { opacity: 0.75 },
    photo: {
      alignItems: "center",
      backgroundColor: withAlpha(colors.muted, 0.12),
      justifyContent: "center",
    },
    image: { height: "100%", width: "100%" },
    addPhoto: { alignItems: "center", alignSelf: "stretch", flex: 1, justifyContent: "center" },
    initial: { color: withAlpha(colors.muted, 0.8), fontSize: 34, fontWeight: "600" },
    check: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 2,
      position: "absolute",
      right: spacing.xs,
      top: spacing.xs,
    },
    body: { gap: 2, padding: spacing.sm },
    text: { color: colors.ink, fontSize: 15, lineHeight: 20 },
    bold: { fontWeight: "700" },
    done: { color: colors.muted, textDecorationLine: "line-through" },
    fields: { color: colors.muted, fontSize: 13 },
    rating: { color: colors.accent, fontSize: 13, letterSpacing: 1 },
  });
