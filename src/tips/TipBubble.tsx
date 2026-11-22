import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Lightbulb, X } from "lucide-react-native";

import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  text: string;
  onClose: () => void;
  // Where the little pointer sits: under the bubble (pointing down) or above it.
  pointer?: "up" | "down" | "none";
  // How far from the left or right the pointer sits.
  pointerAlign?: "left" | "center" | "right";
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
};

// A small dark bubble that points at something. It never covers more than
// a line of the screen, and closing it is one tap.
export const TipBubble = ({ text, onClose, pointer = "none", pointerAlign = "left", action, style }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  const pointerStyle = [
    styles.pointer,
    pointerAlign === "left" ? { left: 22 } : pointerAlign === "right" ? { right: 22 } : { alignSelf: "center" as const },
  ];

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }, style]}
    >
      {pointer === "up" && <View style={[pointerStyle, styles.pointerUp]} />}
      <View style={styles.bubble}>
        <Lightbulb size={16} color={colors.warm} />
        <Text style={styles.text}>{text}</Text>
        {!!action && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={action.onPress}>
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Close tip" hitSlop={10} onPress={onClose}>
          <X size={16} color="#FFFFFFB3" />
        </Pressable>
      </View>
      {pointer === "down" && <View style={[pointerStyle, styles.pointerDown]} />}
    </Animated.View>
  );
};

const BUBBLE = "#22302A";

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      maxWidth: 360,
    },
    bubble: {
      alignItems: "center",
      backgroundColor: BUBBLE,
      borderRadius: 14,
      flexDirection: "row",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 9,
      elevation: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
    },
    text: {
      color: "#FFFFFF",
      flex: 1,
      fontSize: 14,
      lineHeight: 19,
    },
    action: {
      color: colors.warm,
      fontSize: 14,
      fontWeight: "700",
    },
    pointer: {
      borderLeftColor: "transparent",
      borderLeftWidth: 7,
      borderRightColor: "transparent",
      borderRightWidth: 7,
      height: 0,
      position: "relative",
      width: 0,
    },
    pointerUp: {
      borderBottomColor: BUBBLE,
      borderBottomWidth: 7,
    },
    pointerDown: {
      borderTopColor: BUBBLE,
      borderTopWidth: 7,
    },
  });
