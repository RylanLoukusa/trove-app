import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { spacing, ThemeColors, withAlpha } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";

// The brand's own colors, from the app icon.
const BRAND_GREEN = "#2F4A38";
const BRAND_GOLD = "#C9A54E";
const BRAND_SAGE = "#AFBEA0";
const BRAND_CREAM = "#F2EAE0";

type PreviewLine = { text: string; done?: boolean; due?: string };
type PreviewCard = { title: string; color: string; lines: PreviewLine[] };

// Three lists, stacked like the icon. The front one shows; the others peek
// out above it in their own color.
const previewCards: PreviewCard[] = [
  {
    title: "Today",
    color: BRAND_GREEN,
    lines: [
      { text: "Pick up the dry cleaning", done: true },
      { text: "Call the vet", due: "10:30 am" },
      { text: "Groceries for Sunday", due: "Today" },
    ],
  },
  {
    title: "Groceries",
    color: BRAND_GOLD,
    lines: [
      { text: "Oat milk", done: true },
      { text: "Lemons" },
      { text: "Coffee beans", due: "Sat" },
    ],
  },
  {
    title: "Weekend trip",
    color: BRAND_SAGE,
    lines: [
      { text: "Book the cabin", done: true },
      { text: "Pack hiking boots" },
      { text: "Charge the camera", due: "Fri" },
    ],
  },
];

// Where each place in the stack sits: the front card, then each card behind
// it a little higher and narrower.
const SLOTS = [
  { y: 0, scale: 1, tint: 0 },
  { y: -11, scale: 0.925, tint: 1 },
  { y: -22, scale: 0.85, tint: 1 },
];
const AUTO_ADVANCE_MS = 4000;
const SWIPE_DISTANCE = 24;

type CardMotion = { y: Animated.Value; scale: Animated.Value; tint: Animated.Value };

const toSlot = (motion: CardMotion, slot: number, duration: number) => {
  const target = SLOTS[slot];
  return Animated.parallel([
    Animated.timing(motion.y, { toValue: target.y, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    Animated.timing(motion.scale, { toValue: target.scale, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    Animated.timing(motion.tint, { toValue: target.tint, duration, useNativeDriver: true }),
  ]);
};

type Props = {
  // With the sign-in buttons there's room for a picture of Trove at work;
  // while typing an email, only the name.
  showPreview?: boolean;
};

// The top of the login screen: the app icon, its name and maker, and a
// small stack of lists. Every few seconds, or on a swipe or tap, the front
// card drops down and tucks in at the back, and the next one comes forward.
export const LoginHero = ({ showPreview = true }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.hero}>
      <Image
        source={require("../../../assets/icon.png")}
        style={styles.icon}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <Text accessibilityRole="header" style={styles.title}>
        Trove
      </Text>
      <Text style={styles.byline}>by Nova Endeavor</Text>

      {showPreview && <CardStack styles={styles} />}
    </View>
  );
};

const CardStack = ({ styles }: { styles: ReturnType<typeof createStyles> }) => {
  // order[0] is the card in front.
  const [order, setOrder] = useState([0, 1, 2]);
  const orderRef = useRef(order);
  const moving = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [autoKey, setAutoKey] = useState(0);
  const motions = useRef<CardMotion[]>(
    previewCards.map((_, index) => ({
      y: new Animated.Value(SLOTS[index].y),
      scale: new Animated.Value(SLOTS[index].scale),
      tint: new Animated.Value(SLOTS[index].tint),
    })),
  ).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const advance = useCallback(() => {
    if (moving.current) return;
    moving.current = true;
    const [front, middle, back] = orderRef.current;
    const next = [middle, back, front];
    // The front card drops down while the others each move up a place...
    Animated.parallel([
      Animated.timing(motions[front].y, { toValue: 64, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(motions[front].scale, { toValue: 0.96, duration: 240, useNativeDriver: true }),
      toSlot(motions[middle], 0, 300),
      toSlot(motions[back], 1, 300),
    ]).start(() => {
      // ...then slips behind them and rises into the back.
      orderRef.current = next;
      setOrder(next);
      toSlot(motions[front], 2, 320).start(() => {
        moving.current = false;
      });
    });
  }, [motions]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const timer = setInterval(advance, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [advance, autoKey, reduceMotion]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderRelease: (_, g) => {
          const swiped = Math.abs(g.dx) > SWIPE_DISTANCE || Math.abs(g.dy) > SWIPE_DISTANCE;
          const tapped = Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6;
          if (swiped || tapped) {
            advance();
            // Give the person a full pause on the new card.
            setAutoKey((key) => key + 1);
          }
        },
      }),
    [advance],
  );

  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.deck} {...pan.panHandlers}>
        {/* Drawn back to front, so the front card is on top. */}
        {[...order].reverse().map((cardIndex) => {
          const card = previewCards[cardIndex];
          const motion = motions[cardIndex];
          const left = card.lines.filter((line) => !line.done).length;
          return (
            <Animated.View
              key={card.title}
              style={[
                styles.card,
                { transform: [{ translateY: motion.y }, { scale: motion.scale }] },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardCount}>{left} left</Text>
              </View>
              {card.lines.map((line) => (
                <View key={line.text} style={styles.line}>
                  <View style={[styles.box, line.done && styles.boxDone]}>
                    {line.done && <Check size={12} color={BRAND_CREAM} strokeWidth={3} />}
                  </View>
                  <Text numberOfLines={1} style={[styles.lineText, line.done && styles.lineTextDone]}>
                    {line.text}
                  </Text>
                  {!!line.due && <Text style={styles.due}>{line.due}</Text>}
                </View>
              ))}
              <Animated.View
                pointerEvents="none"
                style={[styles.tint, { backgroundColor: card.color, opacity: motion.tint }]}
              />
            </Animated.View>
          );
        })}
      </View>
      <View style={styles.dots}>
        {previewCards.map((card, index) => (
          <View
            key={card.title}
            style={[styles.dot, order[0] === index && { backgroundColor: card.color, width: 16 }]}
          />
        ))}
      </View>
      <Text style={styles.tagline}>Lists that keep up with you.</Text>
    </View>
  );
};

const CARD_WIDTH = 290;
const CARD_HEIGHT = 148;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    hero: {
      alignItems: "center",
      paddingTop: spacing.md,
    },
    icon: {
      borderRadius: 22,
      height: 84,
      marginBottom: spacing.md,
      width: 84,
    },
    title: {
      color: colors.ink,
      fontSize: 34,
      fontWeight: "900",
      lineHeight: 40,
      textAlign: "center",
    },
    byline: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "500",
      letterSpacing: 0.3,
      marginTop: 2,
      textAlign: "center",
    },
    stage: {
      alignItems: "center",
      marginTop: spacing.xl,
      paddingTop: 22,
      width: "100%",
    },
    deck: {
      height: CARD_HEIGHT,
      maxWidth: "100%",
      width: CARD_WIDTH,
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: withAlpha(BRAND_GREEN, 0.12),
      borderRadius: 18,
      borderWidth: 1,
      height: CARD_HEIGHT,
      left: 0,
      overflow: "hidden",
      padding: spacing.md,
      position: "absolute",
      right: 0,
      top: 0,
      transformOrigin: "top",
    },
    // Covers a card while it waits behind, so only its color shows.
    tint: {
      ...StyleSheet.absoluteFillObject,
    },
    dots: {
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      marginTop: spacing.lg,
    },
    dot: {
      backgroundColor: withAlpha(colors.muted, 0.35),
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    cardHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    cardTitle: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "800",
    },
    cardCount: {
      color: colors.muted,
      fontSize: 13,
    },
    line: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingVertical: 6,
    },
    box: {
      alignItems: "center",
      borderColor: withAlpha(colors.muted, 0.6),
      borderRadius: 6,
      borderWidth: 1.5,
      height: 18,
      justifyContent: "center",
      width: 18,
    },
    boxDone: {
      backgroundColor: BRAND_GREEN,
      borderColor: BRAND_GREEN,
    },
    lineText: {
      color: colors.ink,
      flex: 1,
      fontSize: 15,
    },
    lineTextDone: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    due: {
      color: BRAND_GOLD,
      fontSize: 12,
      fontWeight: "700",
    },
    tagline: {
      color: colors.muted,
      fontSize: 15,
      marginTop: spacing.md,
      textAlign: "center",
    },
  });
