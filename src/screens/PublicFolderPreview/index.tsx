import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { EmptyState } from "../../components/EmptyState";
import { MediaImage } from "../../components/MediaImage";
import { TagChip } from "../../components/TagChip";
import { VideoLockedTile } from "../../components/VideoLockedTile";
import {
  fetchPublicFolder,
  PublicFolderData,
  PublicFolderItem,
  PublicFolderSummary,
  resolveDisplayItems,
} from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { bulletGlyphForIndent } from "../../utils/itemTypes";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">;

const PublicFolderCard = ({
  folder,
  itemCount,
  onPress,
  styles,
}: {
  folder: PublicFolderSummary;
  itemCount: number;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.folderCard, pressed && styles.folderCardPressed]}>
      <View style={[styles.folderCardIcon, { backgroundColor: folder.color ?? colors.border }]}>
        <Text style={styles.folderCardEmoji}>{folder.icon ?? "📁"}</Text>
      </View>
      <View style={styles.folderCardContent}>
        <Text style={styles.folderCardName} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={styles.folderCardMeta}>{itemCount} saved here</Text>
      </View>
      <Text style={styles.folderCardChevron}>›</Text>
    </Pressable>
  );
};

const ItemCard = ({
  item,
  onOpen,
  styles,
}: {
  item: PublicFolderItem;
  onOpen: () => void;
  styles: ReturnType<typeof createStyles>;
}) => {
  const colors = useThemeColors();
  const displayItems = resolveDisplayItems(item);
  const hasStoredMedia = displayItems.length > 0;
  const shouldShowAttachments = item.attachments.length > 0 && !hasStoredMedia;

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Pressable
          accessibilityLabel="Open item"
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.openItemButton, pressed && styles.openItemButtonPressed]}
        >
          <ChevronRight color={colors.accentDark} size={20} strokeWidth={2.6} />
        </Pressable>
      </View>

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
                <VideoLockedTile style={styles.itemMediaTile} />
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
              <VideoLockedTile key={attachment.id} style={styles.itemAttachmentVideo} />
            ),
          )}
        </View>
      )}

      {item.tags.length > 0 && (
        <View style={styles.itemTagsRow}>
          {item.tags.map((tag) => (
            <TagChip key={tag.id} label={tag.name} color={tag.color} />
          ))}
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

  const activeFolderId = route.params.folderId ?? data?.folder.id;
  const activeFolder = data?.folders.find((folder) => folder.id === activeFolderId);

  const subfolders = useMemo(
    () => (data ? data.folders.filter((folder) => folder.parentFolderId === activeFolderId) : []),
    [data, activeFolderId],
  );
  const itemCountByFolderId = useMemo(() => {
    const map = new Map<string, number>();
    data?.items.forEach((item) => {
      map.set(item.folderId, (map.get(item.folderId) ?? 0) + 1);
    });
    return map;
  }, [data]);
  const folderItems = useMemo(
    () => (data ? data.items.filter((item) => item.folderId === activeFolderId) : []),
    [data, activeFolderId],
  );

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

  if (error || !data || !activeFolder) {
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
          {activeFolder.icon ?? "📁"} {activeFolder.name}
        </Text>
        {!!activeFolder.purpose && <Text style={styles.purpose}>{activeFolder.purpose}</Text>}

        {subfolders.map((subfolder) => (
          <PublicFolderCard
            key={subfolder.id}
            folder={subfolder}
            itemCount={itemCountByFolderId.get(subfolder.id) ?? 0}
            onPress={() => navigation.push("PublicFolderPreview", { token, folderId: subfolder.id })}
            styles={styles}
          />
        ))}

        {subfolders.length === 0 && folderItems.length === 0 ? (
          <EmptyState title="No items yet" message="This folder is empty." />
        ) : (
          folderItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onOpen={() => navigation.push("PublicItemDetail", { token, itemId: item.id })}
              styles={styles}
            />
          ))
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Shared read-only via Trove</Text>
        </View>
      </ScrollView>
    </View>
  );
};
