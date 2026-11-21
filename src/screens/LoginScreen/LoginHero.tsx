import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { spacing, ThemeColors, withAlpha } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";

// The brand's own colors, from the app icon.
const BRAND_GREEN = "#2F4A38";
const BRAND_GOLD = "#C9A54E";
const BRAND_SAGE = "#AFBEA0";
const BRAND_CREAM = "#F2EAE0";

const previewLines: Array<{ text: string; done?: boolean; due?: string }> = [
  { text: "Pick up the dry cleaning", done: true },
  { text: "Call the vet", due: "10:30 am" },
  { text: "Groceries for Sunday", due: "Today" },
];

type Props = {
  // With the sign-in buttons there's room for a picture of Trove at work;
  // while typing an email, only the name.
  showPreview?: boolean;
};

// The top of the login screen: the app icon, its name and maker, and a
// small Today list made of stacked cards, like the icon.
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

      {showPreview && (
        <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.card, styles.cardBack, { backgroundColor: BRAND_SAGE }]} />
          <View style={[styles.card, styles.cardMiddle, { backgroundColor: BRAND_GOLD }]} />
          <View style={[styles.card, styles.cardFront]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Today</Text>
              <Text style={styles.cardCount}>2 left</Text>
            </View>
            {previewLines.map((line) => (
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
          </View>
          <Text style={styles.tagline}>Lists that keep up with you.</Text>
        </View>
      )}
    </View>
  );
};

const CARD_WIDTH = 290;

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
    card: {
      borderRadius: 18,
      maxWidth: "100%",
      width: CARD_WIDTH,
    },
    cardBack: {
      height: 40,
      position: "absolute",
      top: 0,
      width: CARD_WIDTH - 44,
    },
    cardMiddle: {
      height: 40,
      position: "absolute",
      top: 11,
      width: CARD_WIDTH - 22,
    },
    cardFront: {
      backgroundColor: colors.surface,
      borderColor: withAlpha(BRAND_GREEN, 0.12),
      borderWidth: 1,
      padding: spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 18,
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
      marginTop: spacing.lg,
      textAlign: "center",
    },
  });
