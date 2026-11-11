import React, { ReactNode, useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, ThemeColors, withAlpha } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

export type MenuAction = {
  key: string;
  label: string;
  // Shown on the right, e.g. the current setting.
  detail?: string;
  icon?: ReactNode;
  destructive?: boolean;
  // Starts a new group, with a gap above it.
  separated?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  onClose: () => void;
};

// A menu that slides up from the bottom of the screen. Render it as the last
// child of a screen's root view: it is drawn in place rather than as a native
// modal, so an action can open another sheet straight away.
export const MenuSheet = ({ visible, title, actions, onClose }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 190, useNativeDriver: true }).start();
  }, [progress, visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          { paddingBottom: insets.bottom + spacing.sm },
          {
            opacity: progress,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
          },
        ]}
      >
        <View style={styles.grabber} />
        {!!title && (
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        )}
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
          {actions.map((action, index) => (
            <React.Fragment key={action.key}>
              {index > 0 && (
                <View
                  style={[styles.divider, action.separated ? styles.dividerGroup : !!action.icon && styles.dividerInset]}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {!!action.icon && <View style={styles.icon}>{action.icon}</View>}
                <Text numberOfLines={1} style={[styles.label, action.destructive && styles.labelDestructive]}>
                  {action.label}
                </Text>
                {!!action.detail && (
                  <Text numberOfLines={1} style={styles.detail}>
                    {action.detail}
                  </Text>
                )}
              </Pressable>
            </React.Fragment>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const ICON_WIDTH = 26;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: "rgba(0, 0, 0, 0.32)",
    },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      bottom: 0,
      left: 0,
      maxHeight: "80%",
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs,
      position: "absolute",
      right: 0,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
    },
    grabber: {
      alignSelf: "center",
      backgroundColor: withAlpha(colors.muted, 0.4),
      borderRadius: 3,
      height: 5,
      marginBottom: spacing.xs,
      width: 38,
    },
    title: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
      paddingBottom: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingTop: 2,
      textAlign: "center",
    },
    row: {
      alignItems: "center",
      borderRadius: 12,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.sm,
    },
    // The line between two actions. It is its own view rather than a border
    // on the row, whose rounded corners would bend its ends.
    divider: {
      backgroundColor: withAlpha(colors.border, 0.9),
      height: StyleSheet.hairlineWidth,
      marginHorizontal: spacing.sm,
    },
    // Within a group the line starts under the labels, past the icons.
    dividerInset: {
      marginLeft: spacing.sm + ICON_WIDTH + spacing.sm,
    },
    // A full line with room around it starts a new group.
    dividerGroup: {
      marginVertical: 4,
    },
    rowPressed: {
      backgroundColor: colors.background,
    },
    icon: {
      alignItems: "center",
      width: ICON_WIDTH,
    },
    label: {
      color: colors.ink,
      flex: 1,
      fontSize: 17,
    },
    labelDestructive: {
      color: colors.danger,
    },
    detail: {
      color: colors.muted,
      flexShrink: 1,
      fontSize: 15,
      maxWidth: "50%",
    },
  });
