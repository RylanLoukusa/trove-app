import React, { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Lock, X } from "lucide-react-native";
import { AppButton } from "./AppButton";
import { useEntitlement } from "../entitlements/EntitlementContext";
import { ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { DisplayItem, useResolvedMediaUrl } from "./MediaCollectionDisplay";
import { SkeletonBlock } from "./Skeleton";
import { VideoPreview } from "./VideoPreview";

const AnimatedImage = Animated.Image;

type ZoomableImageProps = {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (isZoomed: boolean) => void;
};

const ZoomableImage = ({ uri, width, height, onZoomChange }: ZoomableImageProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(1, savedScale.value * event.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const isZoomed = scale.value > 1.05;
      runOnJS(onZoomChange)(isZoomed);
      if (!isZoomed) {
        runOnJS(reset)();
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const isZoomed = savedScale.value <= 1;
      savedScale.value = isZoomed ? 2 : 1;
      scale.value = withTiming(savedScale.value);
      if (!isZoomed) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
      runOnJS(onZoomChange)(isZoomed);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[{ width, height }, styles.zoomableContainer]}>
        <AnimatedImage source={{ uri }} style={[{ width, height }, animatedStyle]} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
};

type MediaPageProps = {
  item: DisplayItem;
  width: number;
  height: number;
  videoLocked: boolean;
  onZoomChange: (isZoomed: boolean) => void;
};

const MediaPage = ({ item, width, height, videoLocked, onZoomChange }: MediaPageProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { presentPaywall } = useEntitlement();
  const { url, isLoading } = useResolvedMediaUrl(item);

  if (item.mediaType === "video" && videoLocked) {
    return (
      <View style={[styles.lockedPage, { width, height }]}>
        <Lock color="#FFF" size={32} />
        <Text style={styles.lockedTitle}>Video requires Pro</Text>
        <AppButton label="Upgrade to Pro" onPress={() => presentPaywall("video_playback")} style={styles.lockedButton} />
      </View>
    );
  }

  if (!url) {
    return isLoading ? <SkeletonBlock height={height} radius={0} width={width} /> : <View style={{ width, height }} />;
  }

  if (item.mediaType === "video") {
    return <VideoPreview uri={url} contentFit="contain" nativeControls style={{ width, height }} />;
  }

  return <ZoomableImage uri={url} width={width} height={height} onZoomChange={onZoomChange} />;
};

type Props = {
  visible: boolean;
  items: DisplayItem[];
  initialIndex: number;
  onClose: () => void;
  /** When true, video pages show a locked upgrade prompt instead of playing (non-Pro viewer of shared video). */
  videoLocked?: boolean;
};

export const MediaFullscreenViewer = ({ visible, items, initialIndex, onClose, videoLocked = false }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const [isZoomed, setIsZoomed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const onShow = useCallback(() => {
    setIsZoomed(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * width, animated: false });
    });
  }, [initialIndex, width]);

  if (!items.length) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} onShow={onShow} transparent={false}>
      <View style={styles.backdrop}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
        >
          {items.map((item) => (
            <MediaPage
              key={item.id}
              item={item}
              width={width}
              height={height}
              videoLocked={videoLocked}
              onZoomChange={setIsZoomed}
            />
          ))}
        </ScrollView>

        <Pressable accessibilityLabel="Close" hitSlop={12} onPress={onClose} style={styles.closeButton}>
          <X color={colors.surface} size={26} strokeWidth={2.4} />
        </Pressable>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: "#000",
      flex: 1,
    },
    zoomableContainer: {
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    lockedPage: {
      alignItems: "center",
      backgroundColor: "#000",
      gap: 12,
      justifyContent: "center",
    },
    lockedTitle: {
      color: "#FFF",
      fontSize: 17,
      fontWeight: "800",
    },
    lockedButton: {
      minWidth: 180,
    },
    closeButton: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      borderRadius: 999,
      height: 44,
      justifyContent: "center",
      position: "absolute",
      right: 16,
      top: 56,
      width: 44,
    },
  });
