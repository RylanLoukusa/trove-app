import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppButton } from "./AppButton";
import { MediaImage } from "./MediaImage";
import { SkeletonBlock } from "./Skeleton";
import { VideoPreview } from "./VideoPreview";
import { getSignedMediaUrl } from "../lib/supabaseStorage";
import { MediaCollectionItem } from "../types/models";
import { colors, spacing } from "../theme/theme";
import { createId } from "../utils/id";

type Props = {
  items: MediaCollectionItem[];
  onChange: (items: MediaCollectionItem[]) => void;
  style?: any;
};

type MediaThumbnailProps = {
  item: MediaCollectionItem;
  onRemove: (itemId: string) => void;
};

const MediaThumbnail = ({ item, onRemove }: MediaThumbnailProps) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const uri = item.localUri ?? signedUrl;

  useEffect(() => {
    if (!item.storagePath || item.localUri) return;

    setIsLoading(true);
    getSignedMediaUrl(item.storagePath)
      .then(setSignedUrl)
      .finally(() => setIsLoading(false));
  }, [item.localUri, item.storagePath]);

  return (
    <View style={styles.thumbnailFrame}>
      {isLoading || !uri ? (
        <SkeletonBlock height="100%" radius={14} width="100%" />
      ) : item.mediaType === "video" ? (
        <View>
          <VideoPreview contentFit="cover" nativeControls={false} skeletonRadius={14} uri={uri} style={styles.thumbnailMedia} />
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>Video</Text>
          </View>
        </View>
      ) : (
        <MediaImage source={{ uri }} skeletonRadius={14} style={styles.thumbnailImage} />
      )}
      <Pressable
        accessibilityLabel="Remove media"
        accessibilityRole="button"
        onPress={() => onRemove(item.id)}
        style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}
      >
        <Text style={styles.removeButtonText}>x</Text>
      </Pressable>
    </View>
  );
};

export const MediaCollectionPicker = ({ items, onChange, style }: Props) => {
  const [isLoading, setIsLoading] = useState(false);

  const appendAssets = useCallback(
    (assets: ImagePicker.ImagePickerAsset[], mediaType: "image" | "video"): void => {
      const additions = assets.map((asset) => ({
        id: createId("media"),
        localUri: asset.uri,
        mediaType,
      }));
      onChange([...items, ...additions]);
    },
    [items, onChange],
  );

  const pickImages = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        quality: 1,
        selectionLimit: 0,
      });

      if (!result.canceled) appendAssets(result.assets, "image");
    } catch {
      Alert.alert("Error", "Failed to pick images");
    } finally {
      setIsLoading(false);
    }
  }, [appendAssets]);

  const pickVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["videos"],
        quality: 0.8,
        selectionLimit: 0,
      });

      if (!result.canceled) appendAssets(result.assets, "video");
    } catch {
      Alert.alert("Error", "Failed to pick videos");
    } finally {
      setIsLoading(false);
    }
  }, [appendAssets]);

  const removeItem = useCallback(
    (itemId: string): void => {
      onChange(items.filter((item) => item.id !== itemId));
    },
    [items, onChange],
  );

  return (
    <View style={style}>
      {!!items.length && (
        <ScrollView
          contentContainerStyle={styles.thumbnailRow}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbnailScroller}
        >
          {items.map((item) => (
            <MediaThumbnail key={item.id} item={item} onRemove={removeItem} />
          ))}
        </ScrollView>
      )}

      {isLoading && <ActivityIndicator size="large" style={styles.loading} />}

      <View style={styles.buttonRow}>
        <AppButton label="Pick Image" onPress={pickImages} variant="secondary" style={styles.button} />
        <AppButton label="Pick Video" onPress={pickVideos} variant="secondary" style={styles.button} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  loading: {
    marginTop: spacing.sm,
  },
  removeButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 24,
  },
  removeButtonPressed: {
    opacity: 0.72,
  },
  removeButtonText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 21,
  },
  thumbnailFrame: {
    borderRadius: 14,
    height: 92,
    overflow: "hidden",
    width: 92,
  },
  thumbnailImage: {
    height: "100%",
    width: "100%",
  },
  thumbnailMedia: {
    borderRadius: 14,
    height: 92,
    width: 92,
  },
  thumbnailRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  thumbnailScroller: {
    marginBottom: spacing.xs,
  },
  videoBadge: {
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 999,
    bottom: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: "absolute",
  },
  videoBadgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: "900",
  },
});
