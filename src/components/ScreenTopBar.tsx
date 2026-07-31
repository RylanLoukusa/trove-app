import React, { ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NavigationProp } from "@react-navigation/native";
import { ArrowLeftIcon, MenuIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../navigation/types";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Navigation = NavigationProp<RootStackParamList>;

type Props = {
  navigation: Navigation;
  /** When false, only top safe-area padding is applied (e.g. Home). */
  showBack?: boolean;
  onMenuPress?: () => void;
  /** Extra actions rendered on the right side of the bar (e.g. edit/delete icon buttons). */
  rightActions?: ReactNode;
};

export const ScreenTopBar = ({ navigation, showBack = true, onMenuPress, rightActions }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const canGoBack = showBack && navigation.canGoBack();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.leftActions}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={() => navigation.goBack()}
            style={({ pressed }: { pressed: boolean }) => [styles.action, pressed && styles.backPressed]}
          >
            <ArrowLeftIcon size={28} color={colors.accentDark} />
          </Pressable>
        ) : onMenuPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={12}
            onPress={onMenuPress}
            style={({ pressed }: { pressed: boolean }) => [styles.action, pressed && styles.backPressed]}
          >
            <MenuIcon size={28} color={colors.accentDark} />
          </Pressable>
        ) : null}
      </View>
      {rightActions ? (
        <View style={styles.rightActions}>{rightActions}</View>
      ) : canGoBack && onMenuPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={12}
          onPress={onMenuPress}
          style={({ pressed }: { pressed: boolean }) => [styles.action, pressed && styles.backPressed]}
        >
          <MenuIcon size={28} color={colors.accentDark} />
        </Pressable>
      ) : null}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    leftActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    rightActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
    },
    action: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      paddingRight: spacing.md,
      paddingVertical: spacing.xs,
    },
    backPressed: {
      opacity: 0.55,
    },
  });
