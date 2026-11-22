import React, { ReactNode, useEffect, useMemo, useRef } from "react";
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, ThemeColors, withAlpha } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

// `group` names a run of choices, shown as a small heading above them.
export type MenuChoice = { value: string; label: string; group?: string };

// Splits choices into runs that share a group, keeping their order.
const choiceRuns = (choices: MenuChoice[]): Array<{ group?: string; choices: MenuChoice[] }> =>
  choices.reduce<Array<{ group?: string; choices: MenuChoice[] }>>((runs, choice) => {
    const last = runs[runs.length - 1];
    if (last && last.group === choice.group) last.choices.push(choice);
    else runs.push({ group: choice.group, choices: [choice] });
    return runs;
  }, []);

export type MenuAction = {
  key: string;
  label: string;
  // Shown on the right, e.g. the current setting.
  detail?: string;
  // A small tag after the label, e.g. "Pro" on a feature that needs it.
  badge?: string;
  icon?: ReactNode;
  destructive?: boolean;
  // Starts a new group, with a gap above it.
  separated?: boolean;
  // Runs the action and closes the menu.
  onPress?: () => void;
  // A setting instead: its options are shown under the label and picking
  // one leaves the menu open, so several settings can be changed in one go.
  choices?: MenuChoice[];
  selectedValue?: string;
  onChoose?: (value: string) => void;
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

  // Android's back button closes the menu instead of leaving the screen.
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  if (!visible) return null;
  const hasSettings = actions.some((action) => !!action.choices);

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
        {hasSettings ? (
          // With settings to change, an obvious way out.
          <View style={styles.header}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {title ?? ""}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Done" hitSlop={10} onPress={onClose}>
              {({ pressed }) => <Text style={[styles.done, pressed && styles.donePressed]}>Done</Text>}
            </Pressable>
          </View>
        ) : (
          !!title && (
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          )
        )}
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
          {actions.map((action, index) => (
            <React.Fragment key={action.key}>
              {index > 0 && (
                <View
                  style={[styles.divider, action.separated ? styles.dividerGroup : !!action.icon && styles.dividerInset]}
                />
              )}
              {action.choices ? (
                <View accessibilityRole="radiogroup" accessibilityLabel={action.label} style={styles.setting}>
                  <View style={styles.settingLabel}>
                    {!!action.icon && <View style={styles.icon}>{action.icon}</View>}
                    <LabelWithBadge label={action.label} badge={action.badge} styles={styles} />
                  </View>
                  {choiceRuns(action.choices).map((run, runIndex) => (
                    <View key={runIndex} style={!!action.icon && styles.choicesInset}>
                      {!!run.group && <Text style={styles.choiceGroup}>{run.group}</Text>}
                      <View style={styles.choices}>
                        {run.choices.map((choice) => {
                          const selected = choice.value === action.selectedValue;
                          return (
                            <Pressable
                              key={choice.value}
                              accessibilityRole="radio"
                              accessibilityLabel={`${action.label}: ${choice.group ? `${choice.group} ` : ""}${choice.label}`}
                              accessibilityState={{ selected, checked: selected }}
                              hitSlop={4}
                              onPress={() => action.onChoose?.(choice.value)}
                              style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.choicePressed]}
                            >
                              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => {
                    onClose();
                    action.onPress?.();
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  {!!action.icon && <View style={styles.icon}>{action.icon}</View>}
                  <LabelWithBadge label={action.label} badge={action.badge} destructive={action.destructive} styles={styles} />
                  {!!action.detail && (
                    <Text numberOfLines={1} style={styles.detail}>
                      {action.detail}
                    </Text>
                  )}
                </Pressable>
              )}
            </React.Fragment>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

// The label fills the row; a badge such as "Pro" sits right after the words.
const LabelWithBadge = ({
  label,
  badge,
  destructive,
  styles,
}: {
  label: string;
  badge?: string;
  destructive?: boolean;
  styles: ReturnType<typeof createStyles>;
}) =>
  badge ? (
    <View style={styles.labelRow}>
      <Text numberOfLines={1} style={[styles.labelText, styles.labelShrink, destructive && styles.labelDestructive]}>
        {label}
      </Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    </View>
  ) : (
    <Text numberOfLines={1} style={[styles.label, destructive && styles.labelDestructive]}>
      {label}
    </Text>
  );

const ICON_WIDTH = 26;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: "rgba(0, 0, 0, 0.32)",
    },
    badge: {
      backgroundColor: withAlpha(colors.accent, 0.16),
      borderRadius: 6,
      marginLeft: spacing.xs,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    badgeText: {
      color: colors.accentDark,
      fontSize: 12,
      fontWeight: "700",
    },
    labelRow: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
    },
    labelText: {
      color: colors.ink,
      fontSize: 17,
    },
    labelShrink: {
      flexShrink: 1,
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
      elevation: 16,
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
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
      paddingBottom: 2,
      paddingHorizontal: spacing.sm,
    },
    headerTitle: {
      color: colors.muted,
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
    },
    done: {
      color: colors.accentDark,
      fontSize: 17,
      fontWeight: "700",
    },
    donePressed: {
      opacity: 0.5,
    },
    setting: {
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    settingLabel: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 44,
    },
    choices: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    choicesInset: {
      paddingLeft: ICON_WIDTH + spacing.sm,
    },
    choiceGroup: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 6,
      marginTop: spacing.sm,
    },
    choice: {
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    choiceSelected: {
      backgroundColor: colors.accentDark,
      borderColor: colors.accentDark,
    },
    choicePressed: {
      opacity: 0.6,
    },
    choiceText: {
      color: colors.ink,
      fontSize: 15,
    },
    choiceTextSelected: {
      color: colors.onAccent,
      fontWeight: "600",
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
