import React, { ReactNode, useMemo } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  title?: string;
  count?: number;
  hideHeader?: boolean;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const Section = ({ title, count, hideHeader = false, action, children, style }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, style]}>
      {!hideHeader && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {!!title && <Text style={styles.title}>{title}</Text>}
            {count !== undefined && <Text style={styles.count}>{count}</Text>}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    headerLeft: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
    },
    title: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "900",
    },
    count: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
  });
