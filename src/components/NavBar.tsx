import React, { ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  // Name of the place Back returns to. Without onBack there is no back button.
  backLabel?: string;
  onBack?: () => void;
  right?: ReactNode;
};

// The slim bar at the top of the list screens: Back on the left, actions on
// the right, and the screen's own large title underneath it.
export const NavBar = ({ backLabel, onBack, right }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <ChevronLeft size={26} color={colors.accentDark} strokeWidth={2.4} />
            {!!backLabel && (
              <Text numberOfLines={1} style={styles.backLabel}>
                {backLabel}
              </Text>
            )}
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
};

export const NavIconButton = ({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={8}
    onPress={onPress}
    style={({ pressed }) => [iconStyles.button, pressed && iconStyles.pressed]}
  >
    {children}
  </Pressable>
);

export const NavTextButton = ({ label, onPress }: { label: string; onPress: () => void }) => {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [iconStyles.textButton, pressed && iconStyles.pressed]}
    >
      <Text style={[iconStyles.text, { color: colors.accentDark }]}>{label}</Text>
    </Pressable>
  );
};

const iconStyles = StyleSheet.create({
  button: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  textButton: {
    height: 36,
    justifyContent: "center",
    paddingLeft: spacing.xs,
  },
  text: {
    fontSize: 17,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.5,
  },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      paddingHorizontal: spacing.sm,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      height: 44,
      justifyContent: "space-between",
    },
    back: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      marginRight: spacing.md,
    },
    backLabel: {
      color: colors.accentDark,
      flexShrink: 1,
      fontSize: 17,
    },
    right: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      paddingRight: 6,
    },
    pressed: {
      opacity: 0.5,
    },
  });
