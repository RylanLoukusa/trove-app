import React, { useRef } from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import { LINE_HEIGHT } from "./ListMarks";
import { useLineImageUri } from "../media/lineImages";
import { ThemeColors, withAlpha } from "../theme/theme";
import type { LineImage, LineImageSize } from "../types/models";

export type { LineImageSize };

// A photo on a line starts as a thumbnail the height of the text. A tap makes
// it bigger, another makes it as wide as the line, and a third shrinks it back.
export const nextLineImageSize = (size: LineImageSize): LineImageSize =>
  size === "thumb" ? "medium" : size === "medium" ? "large" : "thumb";

const MEDIUM_HEIGHT = 150;
const LARGE_MAX_HEIGHT = 520;

// How big a photo shows at each size, keeping its shape, within `maxWidth`.
export const lineImageFrame = (
  image: Pick<LineImage, "width" | "height">,
  size: LineImageSize,
  maxWidth: number,
): { width: number; height: number } => {
  if (size === "thumb") return { width: LINE_HEIGHT, height: LINE_HEIGHT };
  const aspect = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  const room = Math.max(maxWidth, LINE_HEIGHT);
  if (size === "medium") {
    const width = Math.min(room, MEDIUM_HEIGHT * aspect);
    return { width: Math.round(width), height: Math.round(width / aspect) };
  }
  const height = Math.min(room / aspect, LARGE_MAX_HEIGHT);
  return { width: Math.round(height * aspect), height: Math.round(height) };
};

type Props = {
  image: LineImage;
  size: LineImageSize;
  maxWidth: number;
  colors: ThemeColors;
  onPress: () => void;
  onLongPress?: () => void;
};

// How much wider a photo can get than the size it was loaded for before it
// is loaded again.
const RELOAD_GROWTH = 1.1;

export const LineImageView = ({ image, size, maxWidth, colors, onPress, onLongPress }: Props) => {
  const uri = useLineImageUri(image);
  const frame = lineImageFrame(image, size, maxWidth);
  // iOS decodes a photo for the size it first shows at, and keeps that decode
  // when the photo grows (a new load only starts when the address changes).
  // So a photo that grows past what it was loaded for is loaded again, or it
  // would be a blurry stretch of a small copy.
  const loaded = useRef({ width: frame.width, version: 0 });
  if (frame.width > loaded.current.width * RELOAD_GROWTH) {
    loaded.current = { width: frame.width, version: loaded.current.version + 1 };
  }
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel="Photo"
      accessibilityHint={
        (size === "large" ? "Tap to make it small again" : "Tap to make it bigger") + (onLongPress ? ". Hold to remove it." : "")
      }
      hitSlop={size === "thumb" ? 6 : 0}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.frame,
        size === "thumb" ? styles.thumb : styles.big,
        frame,
        { backgroundColor: withAlpha(colors.muted, 0.15) },
        pressed && styles.pressed,
      ]}
    >
      {!!uri && (
        <Image
          key={loaded.current.version}
          testID="line-photo"
          source={{ uri }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
  thumb: {
    borderRadius: 5,
  },
  big: {
    borderRadius: 10,
  },
  pressed: {
    opacity: 0.8,
  },
});
