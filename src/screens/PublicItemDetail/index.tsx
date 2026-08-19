import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
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

type Props = NativeStackScreenProps<RootStackParamList, "PublicItemDetail">;

// Mirrors getFolderPathLabel (src/utils/folderTree.ts), scoped to the lighter
// PublicFolderSummary shape a public link exposes instead of the full Folder model.
const buildFolderPathLabel = (folders: PublicFolderSummary[], folderId: string): string => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }

  return path.length > 0 ? path.join(" > ") : "Home";
};

// Mirrors getItemTypeLabel (src/utils/itemTypes.ts) for the public item's plain `type: string`.
const getPublicItemTypeLabel = (type: string): string => {
  switch (type) {
    case "text":
      return "Note";
    case "list":
      return "List";
    case "link":
      return "Link";
    case "media":
    case "image":
    case "video":
      return "Media";
    default:
      return "Item";
  }
};

export const PublicItemDetailScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, itemId } = route.params;

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

  const item = data?.items.find((candidate) => candidate.id === itemId);

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

  if (error || !data || !item) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.center}>
          <EmptyState title="Item unavailable" message={error ?? "This item is no longer available."} />
        </View>
      </View>
    );
  }

  const displayItems = resolveDisplayItems(item);
  const hasStoredMedia = displayItems.length > 0;
  const shouldShowAttachments = item.attachments.length > 0 && !hasStoredMedia;

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.type}>{getPublicItemTypeLabel(item.type).toUpperCase()}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.path}>{buildFolderPathLabel(data.folders, item.folderId)}</Text>

        {!!item.url && (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Link preview</Text>
            <Text style={styles.url} onPress={() => void Linking.openURL(item.url!)}>
              {item.url}
            </Text>
          </View>
        )}

        {!!item.sourceUrl && item.sourceUrl !== item.url && (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>
              {item.sourcePlatform ? `Original on ${item.sourcePlatform}` : "Original source"}
            </Text>
            <Text style={styles.url} onPress={() => void Linking.openURL(item.sourceUrl!)}>
              {item.sourceUrl}
            </Text>
          </View>
        )}

        {hasStoredMedia && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.mediaRow, displayItems.length === 1 && styles.mediaRowCentered]}
            style={styles.mediaPreview}
          >
            {displayItems.map((mediaItem) =>
              mediaItem.mediaType === "video" ? (
                <VideoLockedTile key={mediaItem.id} style={styles.mediaTile} />
              ) : mediaItem.url ? (
                <MediaImage key={mediaItem.id} source={{ uri: mediaItem.url }} style={styles.mediaTile} />
              ) : null,
            )}
          </ScrollView>
        )}

        {(!!item.description || !!item.sharedText) && (
          <View style={styles.contentCard}>
            {!!item.description && <Text style={styles.description}>{item.description}</Text>}
            {!!item.sharedText && (
              <Text style={[styles.description, !!item.description && styles.descriptionSecondary]}>
                {item.sharedText}
              </Text>
            )}
          </View>
        )}

        {item.type === "list" && item.listItems.length > 0 && (
          <View style={styles.listBlock}>
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
                <Text style={[styles.listText, listItem.checked && styles.listTextDone]}>{listItem.text}</Text>
              </View>
            ))}
          </View>
        )}

        {shouldShowAttachments && (
          <View style={styles.attachmentBlock}>
            {item.attachments.map((attachment) =>
              attachment.mediaType === "image" ? (
                <MediaImage key={attachment.id} source={{ uri: attachment.uri }} style={styles.attachmentImage} />
              ) : (
                <VideoLockedTile key={attachment.id} style={styles.attachmentVideo} />
              ),
            )}
          </View>
        )}

        <Text style={styles.createdAt}>{new Date(item.createdAt).toLocaleString()}</Text>

        {item.tags.length > 0 && (
          <>
            <Text style={styles.tagGroupLabel}>Tags</Text>
            <View style={styles.tagRow}>
              {item.tags.map((tag) => (
                <TagChip key={tag.id} label={tag.name} color={tag.color} />
              ))}
            </View>
          </>
        )}

        <Text style={styles.readOnlyNote}>Shared read-only via Trove</Text>
      </ScrollView>
    </View>
  );
};
