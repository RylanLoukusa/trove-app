import React, { useEffect, useState } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { radius } from "../theme/theme";
import { SkeletonBlock } from "./Skeleton";

type VideoPreviewContentFit = "contain" | "cover" | "fill";

interface VideoPreviewProps {
  uri: string;
  contentFit?: VideoPreviewContentFit;
  nativeControls?: boolean;
  skeletonRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  uri,
  contentFit = "contain",
  nativeControls = true,
  skeletonRadius = radius.sm,
  style,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  useEffect(() => {
    setIsLoading(true);
  }, [uri]);

  return (
    <View style={[styles.container, style]}>
      {isLoading && <SkeletonBlock height="100%" radius={skeletonRadius} style={StyleSheet.absoluteFill} />}
      <VideoView
        player={player}
        style={[styles.video, isLoading && styles.hidden]}
        nativeControls={nativeControls}
        contentFit={contentFit}
        fullscreenOptions={{ enable: true }}
        onFirstFrameRender={() => setIsLoading(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
  },
  hidden: {
    opacity: 0,
  },
  video: {
    width: "100%",
    height: "100%",
  },
});
