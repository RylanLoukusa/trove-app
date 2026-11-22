import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import { Bell, Check, RotateCcw } from "lucide-react-native";

import { spacing, ThemeColors, withAlpha } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";

// The brand's own colors, from the app icon.
const BRAND_GREEN = "#2F4A38";
const BRAND_GOLD = "#C9A54E";
const BRAND_SAGE = "#AFBEA0";
const BRAND_CREAM = "#F2EAE0";
const AVATAR_COLORS = ["#5B7A66", "#C08A5B"];

type PreviewLine = {
  text: string;
  done?: boolean;
  due?: string;
  // Which list it came from (Today gathers lines from every list).
  from?: string;
  reminder?: boolean;
  // Initials of the person who added it, on a shared list.
  by?: string;
};
type PreviewCard = {
  title: string;
  color: string;
  // The feature this card shows off, under the stack.
  caption: string;
  // What sits at the right of the title.
  corner: { kind: "count" } | { kind: "people"; initials: string[] } | { kind: "repeat"; label: string };
  lines: PreviewLine[];
};

// Three lists, stacked like the icon, each showing off one thing Trove does.
// The front one shows; the others peek out above it in their own color.
const previewCards: PreviewCard[] = [
  {
    title: "Today",
    color: BRAND_GREEN,
    caption: "Everything due today, from all your lists, in one place.",
    corner: { kind: "count" },
    lines: [
      { text: "Dry cleaning", done: true, from: "Errands" },
      { text: "Call the vet", due: "10:30 am", reminder: true },
      { text: "Pay rent", due: "Today", from: "Home" },
    ],
  },
  {
    title: "Groceries",
    color: BRAND_GOLD,
    caption: "Share a list and check it off together.",
    corner: { kind: "people", initials: ["R", "S"] },
    lines: [
      { text: "Oat milk", done: true, by: "S" },
      { text: "Lemons", by: "R" },
      { text: "Coffee beans", by: "S" },
    ],
  },
  {
    title: "Morning routine",
    color: BRAND_SAGE,
    caption: "Routines that uncheck themselves, ready for tomorrow.",
    corner: { kind: "repeat", label: "Every day" },
    lines: [
      { text: "Make the bed", done: true },
      { text: "Stretch for 10 minutes", done: true },
      { text: "Take vitamins" },
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

  const captionOpacity = useRef(new Animated.Value(1)).current;

  const advance = useCallback(() => {
    if (moving.current) return;
    moving.current = true;
    Animated.timing(captionOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
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
      Animated.timing(captionOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      toSlot(motions[front], 2, 320).start(() => {
        moving.current = false;
      });
    });
  }, [captionOpacity, motions]);

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
                {card.corner.kind === "count" ? (
                  <Text style={styles.cardCount}>{left} left</Text>
                ) : card.corner.kind === "people" ? (
                  <View style={styles.people}>
                    {card.corner.initials.map((initial, i) => (
                      <View key={initial} style={[styles.avatar, i > 0 && styles.avatarOverlap, { backgroundColor: AVATAR_COLORS[i % 2] }]}>
                        <Text style={styles.avatarText}>{initial}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.repeat}>
                    <RotateCcw size={12} color={BRAND_GREEN} strokeWidth={2.5} />
                    <Text style={styles.repeatText}>{card.corner.label}</Text>
                  </View>
                )}
              </View>
              {card.lines.map((line) => (
                <View key={line.text} style={styles.line}>
                  <View style={[styles.box, line.done && styles.boxDone]}>
                    {line.done && <Check size={12} color={BRAND_CREAM} strokeWidth={3} />}
                  </View>
                  <Text numberOfLines={1} style={[styles.lineText, line.done && styles.lineTextDone]}>
                    {line.text}
                  </Text>
                  {!!line.from && <Text style={styles.from}>{line.from}</Text>}
                  {line.reminder && <Bell size={12} color={BRAND_GOLD} strokeWidth={2.5} />}
                  {!!line.due && <Text style={styles.due}>{line.due}</Text>}
                  {!!line.by && (
                    <View style={[styles.avatarSmall, { backgroundColor: AVATAR_COLORS[line.by === "R" ? 0 : 1] }]}>
                      <Text style={styles.avatarSmallText}>{line.by}</Text>
                    </View>
                  )}
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
      <Animated.Text style={[styles.tagline, { opacity: captionOpacity }]}>
        {previewCards[order[0]].caption}
      </Animated.Text>
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
      alignItems: "center",
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
      lineHeight: 21,
      marginTop: spacing.md,
      minHeight: 42,
      paddingHorizontal: spacing.lg,
      textAlign: "center",
    },
    from: {
      backgroundColor: withAlpha(colors.muted, 0.12),
      borderRadius: 6,
      color: colors.muted,
      fontSize: 11,
      fontWeight: "600",
      overflow: "hidden",
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    people: {
      flexDirection: "row",
    },
    avatar: {
      alignItems: "center",
      borderColor: colors.surface,
      borderRadius: 12,
      borderWidth: 2,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    avatarOverlap: {
      marginLeft: -6,
    },
    avatarText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "800",
    },
    avatarSmall: {
      alignItems: "center",
      borderRadius: 9,
      height: 18,
      justifyContent: "center",
      width: 18,
    },
    avatarSmallText: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "800",
    },
    repeat: {
      alignItems: "center",
      backgroundColor: withAlpha(BRAND_SAGE, 0.35),
      borderRadius: 999,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    repeatText: {
      color: BRAND_GREEN,
      fontSize: 11,
      fontWeight: "700",
    },
  });
