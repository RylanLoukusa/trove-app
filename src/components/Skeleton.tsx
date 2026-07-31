import React, { useMemo } from "react";
import {
  DimensionValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { radius, spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

type SkeletonBlockProps = {
  height: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  width?: DimensionValue;
};

export const SkeletonBlock = ({
  height,
  radius: borderRadius = radius.sm,
  style,
  testID,
  width = "100%",
}: SkeletonBlockProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[
        styles.block,
        {
          borderRadius,
          height,
          width,
        },
        style,
      ]}
    />
  );
};

type SkeletonTextProps = {
  lineCount?: number;
  lineHeight?: number;
  lineWidths?: DimensionValue[];
  style?: StyleProp<ViewStyle>;
};

export const SkeletonText = ({
  lineCount = 3,
  lineHeight = 14,
  lineWidths,
  style,
}: SkeletonTextProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.textGroup, style]}
    >
      {Array.from({ length: lineCount }).map((_, index) => (
        <SkeletonBlock
          key={index}
          height={lineHeight}
          radius={999}
          width={lineWidths?.[index] ?? (index === lineCount - 1 ? "68%" : "100%")}
        />
      ))}
    </View>
  );
};

type SkeletonAvatarProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export const SkeletonAvatar = ({ size = 40, style }: SkeletonAvatarProps) => (
  <SkeletonBlock height={size} radius={size / 2} style={style} width={size} />
);

type SkeletonListProps = {
  count?: number;
  renderItem: (index: number) => React.ReactElement;
  style?: StyleProp<ViewStyle>;
};

export const SkeletonList = ({ count = 6, renderItem, style }: SkeletonListProps) => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={style}
  >
    {Array.from({ length: count }).map((_, index) =>
      React.cloneElement(renderItem(index), { key: index }),
    )}
  </View>
);

type ScreenSkeletonProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const ScreenSkeleton = ({ children, style }: ScreenSkeletonProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityLabel="Loading content"
      accessibilityRole="progressbar"
      style={[styles.screen, style]}
    >
      {children}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    block: {
      backgroundColor: colors.skeleton,
    },
    screen: {
      gap: spacing.md,
    },
    textGroup: {
      gap: spacing.xs,
    },
  });
