import React, { useEffect, useState } from "react";
import { Linking, Text, TouchableOpacity, View } from "react-native";
import { MediaMetadata } from "../types/models";
import { getSignedMediaUrl } from "../lib/supabaseStorage";
import { SkeletonBlock } from "./Skeleton";
import { MediaImage } from "./MediaImage";
import { VideoPreview } from "./VideoPreview";

interface MediaDisplayProps {
  media?: MediaMetadata;
  imageHeight?: number;
  style?: any;
  videoHeight?: number;
}

export const MediaDisplay: React.FC<MediaDisplayProps> = ({ media, imageHeight = 300, style, videoHeight = 260 }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!media?.storagePath) return;

    setIsLoading(true);
    getSignedMediaUrl(media.storagePath)
      .then((url) => {
        setSignedUrl(url);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [media?.storagePath]);

  if (!media) return null;

  // External TikTok URL
  if (media.tiktokUrl) {
    return (
      <TouchableOpacity onPress={() => Linking.openURL(media.tiktokUrl!)} style={[{ marginVertical: 12 }, style]}>
        <View style={{ backgroundColor: "#000", borderRadius: 8, padding: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>🎵 Watch on TikTok</Text>
          <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>{media.tiktokUrl}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Stored media (image/video)
  if (media.storagePath && signedUrl) {
    if (media.mediaType === "image") {
      return <MediaImage source={{ uri: signedUrl }} style={[{ width: "100%", height: imageHeight, borderRadius: 8 }, style]} />;
    }

    if (media.mediaType === "video") {
      return <VideoPreview uri={signedUrl} style={[{ width: "100%", height: videoHeight, marginVertical: 12 }, style]} />;
    }
  }

  if (isLoading) {
    return <SkeletonBlock height={media.mediaType === "video" ? videoHeight : imageHeight} radius={8} style={[{ marginVertical: 12 }, style]} />;
  }

  return null;
};
