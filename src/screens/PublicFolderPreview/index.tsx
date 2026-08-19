import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { EmptyState } from "../../components/EmptyState";
import { MediaImage } from "../../components/MediaImage";
import {
  fetchPublicFolder,
  PublicFolderData,
  PublicFolderItem,
  PublicFolderMediaItem,
  PublicFolderSummary,
} from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { bulletGlyphForIndent } from "../../utils/itemTypes";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">;

// Mirrors resolveDisplayItems in src/components/MediaCollectionDisplay.tsx, except the URLs
// here are already-signed (from get-public-folder) rather than storage paths that need
// client-side signing -- this screen has no Supabase session to sign anything with.
const resolveDisplayItems = (item: PublicFolderItem): PublicFolderMediaItem[] => {
  if (item.mediaItems.length) return item.mediaItems;
  if (item.mediaUrl) return [{ id: item.id, mediaType: "image", url: item.mediaUrl, thumbnailUrl: item.thumbnailUrl }];
  return [];
};

const VideoLockedTile = ({ styles, style }: { styles: ReturnType<typeof createStyles>; style: object }) => (
  <View style={[styles.videoLockedTile, style]}>
    <Lock color="#FFF" size={22} />
    <Text style={styles.videoLockedText}>Open Trove to{"\n"}watch this video</Text>
  </View>
);

const PublicFolderCard = ({
  folder,
  itemCount,
  styles,
}: {
  folder: PublicFolderSummary;
  itemCount: number;
  styles: ReturnType<typeof createStyles>;
}) => {
  const colors = useThemeColors();
  return (
    <View style={styles.folderCard}>
      <View style={[styles.folderCardIcon, { backgroundColor: folder.color ?? colors.border }]}>
        <Text style={styles.folderCardEmoji}>{folder.icon ?? "📁"}</Text>
      </View>
      <View style={styles.folderCardContent}>
        <Text style={styles.folderCardName} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={styles.folderCardMeta}>{itemCount} saved here</Text>
      </View>
    </View>
  );
};

const ItemCard = ({ item, styles }: { item: PublicFolderItem; styles: ReturnType<typeof createStyles> }) => {
  const displayItems = resolveDisplayItems(item);
  const hasStoredMedia = displayItems.length > 0;
  const shouldShowAttachments = item.attachments.length > 0 && !hasStoredMedia;

  return (
    <View style={styles.itemCard}>
      <Text style={styles.itemTitle} numberOfLines={2}>
        {item.title}
      </Text>

      {!!item.url && (
        <Pressable
          onPress={() => void Linking.openURL(item.url!)}
          style={({ pressed }) => [styles.itemLink, pressed && styles.itemLinkPressed]}
        >
          <Text numberOfLines={2} style={styles.itemLinkText}>
            {item.url}
          </Text>
        </Pressable>
      )}

      {hasStoredMedia && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemMediaRow}
          style={styles.itemMedia}
          testID="itemMediaGallery"
        >
          {displayItems.map((mediaItem) => (
            <View key={mediaItem.id} testID={`mediaTile-${mediaItem.id}`}>
              {mediaItem.mediaType === "video" ? (
                <VideoLockedTile styles={styles} style={styles.itemMediaTile} />
              ) : mediaItem.url ? (
                <MediaImage source={{ uri: mediaItem.url }} style={styles.itemMediaTile} />
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {!!item.description && <Text style={styles.itemDescription}>{item.description}</Text>}
      {!!item.sharedText && !item.description && <Text style={styles.itemDescription}>{item.sharedText}</Text>}

      {item.type === "list" && item.listItems.length > 0 && (
        <View style={styles.itemList}>
          {item.listItems.map((listItem) => (
            <View
              key={listItem.id}
              style={[styles.listRow, { marginLeft: Math.min(listItem.indentLevel ?? 0, 3) * 24 }]}
            >
              {listItem.kind === "check" ? (
                <Text style={styles.listMarker}>{listItem.checked ? "☑" : "☐"}</Text>
              ) : (
                <Text style={[styles.listMarker, styles.listBullet]}>{bulletGlyphForIndent(listItem.indentLevel)}</Text>
              )}
              <Text style={[styles.listRowText, listItem.checked && styles.listRowTextChecked]}>{listItem.text}</Text>
            </View>
          ))}
        </View>
      )}

      {shouldShowAttachments && (
        <View style={styles.itemAttachments} testID="itemAttachments">
          {item.attachments.map((attachment) =>
            attachment.mediaType === "image" ? (
              <MediaImage key={attachment.id} source={{ uri: attachment.uri }} style={styles.itemAttachmentImage} />
            ) : (
              <VideoLockedTile key={attachment.id} styles={styles} style={styles.itemAttachmentVideo} />
            ),
          )}
        </View>
      )}
    </View>
  );
};

export const PublicFolderPreviewScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = route.params.token;

  const [data, setData] = useState<PublicFolderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setError("This link can't be opened right now.");
          setIsLoading(false);
        }
        return;
      }

      const result = await fetchPublicFolder(supabase, token);
      if (cancelled) return;

      if (result.error || !result.data) {
        setError(result.error ?? "This link is no longer available.");
      } else {
        setData(result.data);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const itemsByFolderId = useMemo(() => {
    const map = new Map<string, PublicFolderItem[]>();
    data?.items.forEach((item) => {
      const list = map.get(item.folderId) ?? [];
      list.push(item);
      map.set(item.folderId, list);
    });
    return map;
  }, [data]);

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentDark} />
        </View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.center}>
          <EmptyState title="Link unavailable" message={error ?? "This link is no longer available."} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Shared folder</Text>
        <Text style={styles.title}>
          {data.folder.icon ?? "📁"} {data.folder.name}
        </Text>
        {!!data.folder.purpose && <Text style={styles.purpose}>{data.folder.purpose}</Text>}

        {data.folders.map((folder) => {
          const folderItems = itemsByFolderId.get(folder.id) ?? [];
          if (folder.id !== data.folder.id && folderItems.length === 0) return null;

          return (
            <View key={folder.id}>
              {folder.id !== data.folder.id && (
                <PublicFolderCard folder={folder} itemCount={folderItems.length} styles={styles} />
              )}
              {folderItems.length === 0 ? (
                folder.id === data.folder.id && <EmptyState title="No items yet" message="This folder is empty." />
              ) : (
                folderItems.map((item) => <ItemCard key={item.id} item={item} styles={styles} />)
              )}
            </View>
          );
        })}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Shared read-only via Trove</Text>
        </View>
      </ScrollView>
    </View>
  );
};
