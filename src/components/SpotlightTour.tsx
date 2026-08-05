import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

export type SpotlightStep = {
  key: string;
  title: string;
  body: string;
};

type Rect = { x: number; y: number; width: number; height: number };
type AnchorTrim = { top: number; bottom: number };

const DESIRED_TOP = 170;
const SCROLL_SETTLE_MS = 380;
// Only scroll when the anchor genuinely isn't visible — not just "not exactly
// at DESIRED_TOP" — so steps whose target is already comfortably on screen
// don't cause a jarring scroll jump between steps.
const MIN_VISIBLE_TOP = 110;
const MIN_VISIBLE_BOTTOM_MARGIN = 40;

// Measures whichever anchor key is currently active and, if it's not already
// reasonably visible, scrolls it into view first. Doesn't own step sequencing
// itself — the caller (a screen, or a cross-screen tour context) decides
// which key is active.
export const useSpotlightAnchor = (activeKey: string | undefined) => {
  const [rect, setRect] = useState<Rect | null>(null);
  const anchorNodes = useRef<Record<string, View | null>>({});
  const anchorTrim = useRef<Record<string, AnchorTrim>>({});
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const { height: windowHeight } = useWindowDimensions();

  const measure = useCallback(() => {
    const node = activeKey ? anchorNodes.current[activeKey] : null;
    if (!node || !activeKey) return;
    const trim = anchorTrim.current[activeKey] ?? { top: 0, bottom: 0 };

    node.measureInWindow((x, y, width, height) => {
      const trimmedY = y + trim.top;
      const trimmedHeight = Math.max(0, height - trim.top - trim.bottom);
      const needsScroll =
        trimmedY < MIN_VISIBLE_TOP || trimmedY + trimmedHeight > windowHeight - MIN_VISIBLE_BOTTOM_MARGIN;

      if (needsScroll && scrollRef.current) {
        const delta = trimmedY - DESIRED_TOP;
        const nextOffset = Math.max(0, scrollYRef.current + delta);
        scrollRef.current.scrollTo({ y: nextOffset, animated: true });
        setTimeout(() => {
          node.measureInWindow((x2, y2, width2, height2) => {
            setRect({ x: x2, y: y2 + trim.top, width: width2, height: Math.max(0, height2 - trim.top - trim.bottom) });
          });
        }, SCROLL_SETTLE_MS);
        return;
      }
      setRect({ x, y: trimmedY, width, height: trimmedHeight });
    });
  }, [activeKey, windowHeight]);

  useEffect(() => {
    setRect(null);
    if (!activeKey) return;
    const timer = setTimeout(measure, 60);
    return () => clearTimeout(timer);
  }, [activeKey, measure]);

  // `trimTop`/`trimBottom` shrink the measured box by a known amount — some anchors
  // wrap content whose first or last child carries its own external margin (e.g. a
  // section heading with marginTop, or the last card in a list with marginVertical),
  // which React Native's flex layout otherwise folds into the wrapper's own measured
  // size, making the highlight visibly overshoot into whatever's before or after it.
  const registerAnchor = useCallback(
    (key: string, trimTop = 0, trimBottom = 0) => {
      anchorTrim.current[key] = { top: trimTop, bottom: trimBottom };
      return (node: View | null) => {
        anchorNodes.current[key] = node;
      };
    },
    [],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  return { scrollRef, onScroll, registerAnchor, rect };
};

type SpotlightOverlayProps = {
  rect: Rect;
  title: string;
  body: string;
  stepNumber: number;
  totalSteps: number;
  mode: "info" | "action";
  /** Forces the tooltip above or below the highlight instead of auto-picking
   * based on available space, for anchors where auto-placement misjudges. */
  placement?: "above" | "below";
  onNext: () => void;
  onSkip: () => void;
};

const TOOLTIP_ESTIMATED_HEIGHT = 170;
const HIGHLIGHT_PADDING = 8;

// No dimming overlay — this is a new user's first look at the real app, so the
// screen underneath stays fully visible and interactive. A highlight box marks
// the element to look at (or tap, for "action" steps — nothing covers it, so the
// tap reaches the real element and the caller advances the tour once the
// resulting action/navigation is observed). Only the tooltip card itself
// intercepts touches (`box-none` on the root lets everything else through).
export const SpotlightOverlay = ({ rect, title, body, stepNumber, totalSteps, mode, placement, onNext, onSkip }: SpotlightOverlayProps) => {
  const colors = useThemeColors();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const highlightTop = Math.max(0, rect.y - HIGHLIGHT_PADDING);
  const highlightLeft = Math.max(0, rect.x - HIGHLIGHT_PADDING);
  const highlightWidth = rect.width + HIGHLIGHT_PADDING * 2;
  const highlightHeight = rect.y - highlightTop + rect.height + HIGHLIGHT_PADDING;
  const highlightBottom = highlightTop + highlightHeight;

  const placeBelow =
    placement === "below" || (placement !== "above" && windowHeight - highlightBottom > TOOLTIP_ESTIMATED_HEIGHT + spacing.lg);
  const tooltipTop = placeBelow
    ? highlightBottom + spacing.md
    : Math.max(spacing.xl, highlightTop - spacing.md - TOOLTIP_ESTIMATED_HEIGHT);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        pointerEvents="none"
        style={[styles.highlightBorder, { top: highlightTop, left: highlightLeft, width: highlightWidth, height: highlightHeight }]}
      />
      <View style={[styles.tooltip, { top: tooltipTop, left: spacing.lg, width: windowWidth - spacing.lg * 2 }]}>
        <Text style={styles.stepCount}>
          {stepNumber} of {totalSteps}
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
          {mode === "info" ? (
            <Pressable accessibilityRole="button" onPress={onNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>Next</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};

type SpotlightMessageCardProps = {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip: () => void;
};

// Not anchored to any element — a centered card for orientation moments
// (welcome, "you made your first X!") or the closing Pro preview. No dimming
// here either, so whatever the user just made stays visible behind the card.
export const SpotlightMessageCard = ({ title, body, primaryLabel, onPrimary, onSkip }: SpotlightMessageCardProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.messageCardWrap} pointerEvents="box-none">
        <View style={styles.messageCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8}>
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onPrimary} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    highlightBorder: {
      backgroundColor: `${colors.accentDark}26`,
      borderColor: colors.accentDark,
      borderRadius: radius.sm,
      borderWidth: 3,
      elevation: 4,
      position: "absolute",
      shadowColor: colors.accentDark,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
    },
    tooltip: {
      backgroundColor: colors.surface,
      borderColor: colors.accentDark,
      borderRadius: radius.md,
      borderWidth: 1.5,
      elevation: 6,
      padding: spacing.md,
      position: "absolute",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
    messageCardWrap: {
      alignItems: "center",
      flex: 1,
      justifyContent: "flex-end",
      padding: spacing.lg,
    },
    messageCard: {
      backgroundColor: colors.surface,
      borderColor: colors.accentDark,
      borderRadius: radius.md,
      borderWidth: 1.5,
      elevation: 6,
      maxWidth: 420,
      padding: spacing.lg,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      width: "100%",
    },
    stepCount: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: spacing.xs,
      textTransform: "uppercase",
    },
    title: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: spacing.xs,
    },
    body: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.md,
    },
    footer: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    skip: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "700",
    },
    nextButton: {
      backgroundColor: colors.accentDark,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    nextButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "800",
    },
  });
