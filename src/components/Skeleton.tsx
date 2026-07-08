import React from "react";
import {
  DimensionValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { colors, radius, spacing } from "../theme/theme";

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
}: SkeletonBlockProps) => (
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
}: SkeletonTextProps) => (
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

export const ScreenSkeleton = ({ children, style }: ScreenSkeletonProps) => (
  <View
    accessibilityLabel="Loading content"
    accessibilityRole="progressbar"
    style={[styles.screen, style]}
  >
    {children}
  </View>
);

const styles = StyleSheet.create({
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
