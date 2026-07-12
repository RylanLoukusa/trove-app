import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { MediaCollectionItem, MediaMetadata } from "../types/models";
import { getSignedMediaUrl } from "../lib/supabaseStorage";
import { SkeletonBlock } from "./Skeleton";
import { MediaImage } from "./MediaImage";
import { VideoPreview } from "./VideoPreview";

type Props = {
  centerContent?: boolean;
  media?: MediaMetadata;
  mediaItems?: MediaCollectionItem[];
  itemHeight: number;
  itemWidth: number;
  nativeVideoControls?: boolean;
  onPressItem?: (index: number) => void;
  style?: any;
};

export type DisplayItem = MediaCollectionItem | (MediaMetadata & { id: string });

export const resolveDisplayItems = (media?: MediaMetadata, mediaItems?: MediaCollectionItem[]): DisplayItem[] => {
  if (mediaItems?.length) return mediaItems;
  if (media?.storagePath) return [{ ...media, id: media.storagePath }];
  return [];
};

export const useResolvedMediaUrl = (item: DisplayItem): { url: string | null; isLoading: boolean } => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const localUri = "localUri" in item ? item.localUri : undefined;

  useEffect(() => {
    if (!item.storagePath) return;

    setIsLoading(true);
    getSignedMediaUrl(item.storagePath)
      .then(setSignedUrl)
      .finally(() => setIsLoading(false));
  }, [item.storagePath]);

  return { url: localUri ?? signedUrl, isLoading };
};

type StoredMediaTileProps = {
  item: DisplayItem;
  height: number;
  nativeVideoControls: boolean;
  width: number;
};

const StoredMediaTile = ({ item, height, nativeVideoControls, width }: StoredMediaTileProps) => {
  const { url: displayUrl, isLoading } = useResolvedMediaUrl(item);

  if (displayUrl) {
    if (item.mediaType === "video") {
      return (
        <VideoPreview
          contentFit={nativeVideoControls ? "contain" : "cover"}
          nativeControls={nativeVideoControls}
          uri={displayUrl!}
          style={{ height, width }}
        />
      );
    }

    return <MediaImage source={{ uri: displayUrl }} style={[styles.image, { height, width }]} />;
  }

  if (isLoading) {
    return <SkeletonBlock height={height} radius={8} width={width} />;
  }

  return null;
};

export const MediaCollectionDisplay = ({ centerContent = true, media, mediaItems, itemHeight, itemWidth, nativeVideoControls = true, onPressItem, style }: Props) => {
  const displayItems = useMemo<DisplayItem[]>(() => resolveDisplayItems(media, mediaItems), [media, mediaItems]);

  if (!displayItems.length) return null;

  return (
    <ScrollView
      contentContainerStyle={[styles.row, centerContent ? styles.rowCentered : styles.rowLeading]}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
    >
      {displayItems.map((item, index) => {
        const tile = (
          <StoredMediaTile item={item} height={itemHeight} nativeVideoControls={nativeVideoControls} width={itemWidth} />
        );

        return onPressItem ? (
          <Pressable key={item.id} onPress={() => onPressItem(index)}>
            {tile}
          </Pressable>
        ) : (
          <React.Fragment key={item.id}>{tile}</React.Fragment>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  image: {
    borderRadius: 8,
  },
  row: {
    gap: 10,
    paddingRight: 18,
  },
  rowCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  rowLeading: {
    justifyContent: "flex-start",
  },
});
