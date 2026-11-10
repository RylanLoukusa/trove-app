import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { ThemeColors, withAlpha } from "../theme/theme";
import type { ListItemKind } from "../types/models";

// Layout shared by every place a list's lines are drawn, so a line sits in
// the same spot whether it is being edited or only shown.
export const LINE_FONT_SIZE = 17;
export const LINE_HEIGHT = 24;
export const LINE_PADDING_Y = 7;
export const LINE_ROW_HEIGHT = LINE_HEIGHT + LINE_PADDING_Y * 2;
export const MARKER_WIDTH = 32;
export const INDENT_WIDTH = 22;

// The round checkbox of a checklist line.
export const CheckMark = ({
  checked,
  colors,
  size = 22,
  dim = false,
}: {
  checked: boolean;
  colors: ThemeColors;
  size?: number;
  dim?: boolean;
}) => (
  <View
    style={[
      styles.check,
      {
        backgroundColor: checked ? colors.accent : "transparent",
        borderColor: checked ? colors.accent : withAlpha(colors.muted, 0.65),
        borderRadius: size / 2,
        height: size,
        width: size,
      },
      dim && styles.dim,
    ]}
  >
    {checked && <Check size={Math.round(size * 0.62)} color={colors.onAccent} strokeWidth={3.4} />}
  </View>
);

// The mark of a bulleted line: a dot, then a ring, then a dash as lines nest.
export const BulletMark = ({
  indentLevel = 0,
  colors,
  dim = false,
}: {
  indentLevel?: number;
  colors: ThemeColors;
  dim?: boolean;
}) => {
  const tone = withAlpha(colors.ink, 0.6);
  const shape = indentLevel % 3;
  return (
    <View
      style={[
        shape === 0 && [styles.dot, { backgroundColor: tone }],
        shape === 1 && [styles.ring, { borderColor: tone }],
        shape === 2 && [styles.dash, { backgroundColor: tone }],
        dim && styles.dim,
      ]}
    />
  );
};

type PreviewLine = {
  id: string;
  kind: ListItemKind | string;
  text: string;
  checked?: boolean;
  indentLevel?: number;
  bold?: boolean;
  // Older apps and public links carry a plain line as a bullet with this flag.
  plain?: boolean;
};

// A list's lines, shown but not editable (shared folder links).
export const ListLinesPreview = ({ lines, colors }: { lines: PreviewLine[]; colors: ThemeColors }) => (
  <View>
    {lines.map((line) => {
      const isCheck = line.kind === "check";
      const isPlain = line.kind === "text" || !!line.plain;
      return (
        <View
          key={line.id}
          accessible
          accessibilityLabel={line.text}
          accessibilityRole={isCheck ? "checkbox" : undefined}
          accessibilityState={isCheck ? { checked: !!line.checked } : undefined}
          style={[styles.previewRow, { paddingLeft: Math.max(0, line.indentLevel ?? 0) * INDENT_WIDTH }]}
        >
          {!isPlain && (
            <View style={styles.previewMarker}>
              {isCheck ? (
                <CheckMark checked={!!line.checked} colors={colors} />
              ) : (
                <BulletMark indentLevel={line.indentLevel} colors={colors} />
              )}
            </View>
          )}
          <Text
            style={[
              styles.previewText,
              { color: line.checked ? colors.muted : colors.ink },
              line.bold && styles.bold,
            ]}
          >
            {line.text}
          </Text>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  check: {
    alignItems: "center",
    borderWidth: 1.6,
    justifyContent: "center",
  },
  dim: {
    opacity: 0.4,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  ring: {
    borderRadius: 3.5,
    borderWidth: 1.4,
    height: 7,
    width: 7,
  },
  dash: {
    borderRadius: 1,
    height: 2,
    width: 8,
  },
  previewRow: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  previewMarker: {
    alignItems: "center",
    height: LINE_ROW_HEIGHT,
    justifyContent: "center",
    marginRight: 6,
    width: MARKER_WIDTH - 6,
  },
  previewText: {
    flex: 1,
    fontSize: LINE_FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    paddingVertical: LINE_PADDING_Y,
  },
  bold: {
    fontWeight: "700",
  },
});
