import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppButton } from "./AppButton";
import { ItemAttachment } from "../types/models";
import { createId } from "../utils/id";
import { MediaImage } from "./MediaImage";
import { VideoPreview } from "./VideoPreview";

interface MediaPickerProps {
  onMediaSelected: (uri: string, type: "image" | "video") => void;
  initialUri?: string;
  initialMediaType?: "image" | "video";
  attachments?: ItemAttachment[];
  onAttachmentsChange?: (attachments: ItemAttachment[]) => void;
  style?: any;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({ onMediaSelected, initialUri, initialMediaType, attachments, onAttachmentsChange, style }) => {
  const [selectedUri, setSelectedUri] = useState<string | undefined>(initialUri);
  const [isLoading, setIsLoading] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "video" | undefined>(initialMediaType);
  const isMulti = !!onAttachmentsChange;

  const addAttachment = useCallback(
    (uri: string, type: "image" | "video") => {
      onAttachmentsChange?.([...(attachments ?? []), { id: createId("attachment"), uri, mediaType: type }]);
    },
    [attachments, onAttachmentsChange],
  );

  const pickImage = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (isMulti) {
          addAttachment(uri, "image");
        } else {
          setSelectedUri(uri);
          setMediaType("image");
        }
        onMediaSelected(uri, "image");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    } finally {
      setIsLoading(false);
    }
  }, [addAttachment, isMulti, onMediaSelected]);

  const pickVideo = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (isMulti) {
          addAttachment(uri, "video");
        } else {
          setSelectedUri(uri);
          setMediaType("video");
        }
        onMediaSelected(uri, "video");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick video");
    } finally {
      setIsLoading(false);
    }
  }, [addAttachment, isMulti, onMediaSelected]);

  const clearMedia = useCallback(() => {
    setSelectedUri(undefined);
    setMediaType(undefined);
  }, []);

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      onAttachmentsChange?.((attachments ?? []).filter((attachment) => attachment.id !== attachmentId));
    },
    [attachments, onAttachmentsChange],
  );

  return (
    <View style={style}>
      {isMulti && !!attachments?.length && (
        <View style={{ gap: 8, marginBottom: 12 }}>
          {attachments.map((attachment) => (
            <View key={attachment.id}>
              {attachment.mediaType === "image" ? (
                <MediaImage source={{ uri: attachment.uri }} style={{ width: "100%", height: 160, borderRadius: 8 }} />
              ) : (
                <VideoPreview uri={attachment.uri} style={{ width: "100%", height: 160 }} />
              )}
              <AppButton label="Remove" onPress={() => removeAttachment(attachment.id)} variant="secondary" style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      )}

      {!isMulti && selectedUri && mediaType === "image" && (
        <MediaImage source={{ uri: selectedUri }} style={{ width: "100%", height: 200, borderRadius: 8, marginBottom: 12 }} />
      )}

      {!isMulti && selectedUri && mediaType === "video" && (
        <VideoPreview uri={selectedUri} style={{ width: "100%", height: 200, marginBottom: 12 }} />
      )}

      {isLoading && <ActivityIndicator size="large" style={{ marginBottom: 12 }} />}

      {(!selectedUri || isMulti) && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <AppButton label="Pick Image" onPress={pickImage} variant="secondary" style={{ flex: 1 }} />
          <AppButton label="Pick Video" onPress={pickVideo} variant="secondary" style={{ flex: 1 }} />
        </View>
      )}

      {!isMulti && selectedUri && (
        <AppButton label="Clear & Pick Again" onPress={clearMedia} variant="secondary" style={{ marginBottom: 12 }} />
      )}
    </View>
  );
};
