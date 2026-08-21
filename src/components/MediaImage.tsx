import React, { useEffect, useState } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { radius } from "../theme/theme";
import { SkeletonBlock } from "./Skeleton";

type MediaImageProps = {
  source: { uri: string };
  skeletonRadius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export const MediaImage = ({ source, skeletonRadius = radius.sm, style, accessibilityLabel }: MediaImageProps) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
  }, [source.uri]);

  return (
    <View style={[styles.container, style]}>
      {isLoading && <SkeletonBlock height="100%" radius={skeletonRadius} style={StyleSheet.absoluteFill} />}
      <Image
        source={source}
        style={[styles.image, isLoading && styles.hidden]}
        onLoadEnd={() => setIsLoading(false)}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  hidden: {
    opacity: 0,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
});
