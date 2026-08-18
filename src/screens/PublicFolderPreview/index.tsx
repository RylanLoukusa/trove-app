import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { EmptyState } from "../../components/EmptyState";
import { fetchPublicFolder, PublicFolderData, PublicFolderItem } from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">;

const ItemCard = ({ item, styles }: { item: PublicFolderItem; styles: ReturnType<typeof createStyles> }) => (
  <View style={styles.itemCard}>
    {!!item.mediaUrl && <Image source={{ uri: item.mediaUrl }} style={styles.itemImage} resizeMode="cover" />}
    <Text style={styles.itemTitle}>{item.title}</Text>
    {!!item.description && <Text style={styles.itemDescription}>{item.description}</Text>}
    {!!item.sharedText && !item.description && <Text style={styles.itemDescription}>{item.sharedText}</Text>}
    {!!item.url && (
      <Text numberOfLines={1} style={styles.itemUrl}>
        {item.url}
      </Text>
    )}
    {item.listItems.map((listItem) => (
      <View key={listItem.id} style={styles.listRow}>
        <Text style={styles.listRowText}>{listItem.kind === "check" ? (listItem.checked ? "☑" : "☐") : "•"}</Text>
        <Text style={[styles.listRowText, listItem.checked && styles.listRowTextChecked]}>{listItem.text}</Text>
      </View>
    ))}
  </View>
);

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
                <View style={styles.folderChip}>
                  <Text style={styles.folderChipText}>
                    {folder.icon ?? "📁"} {folder.name}
                  </Text>
                </View>
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
