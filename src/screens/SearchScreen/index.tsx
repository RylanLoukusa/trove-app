import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/EmptyState";
import { FolderCard } from "../../components/FolderCard";
import { ItemCard } from "../../components/ItemCard";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { Folder, SavedItem } from "../../types/models";
import { getFolderPathLabel } from "../../utils/folderTree";
import { searchFoldersAndItems } from "../../utils/itemFilters";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

type SearchFilter = "all" | "folders" | "items" | "recent";
type SearchSort = "updated" | "alphabetical" | "newest" | "oldest";
type SearchResults = { folders: Folder[]; items: SavedItem[] };

const RECENT_FOLDER_LIMIT = 5;
const RECENT_ITEM_LIMIT = 8;

const filterOptions: Array<{ label: string; value: SearchFilter }> = [
  { label: "All", value: "all" },
  { label: "Folders", value: "folders" },
  { label: "Items", value: "items" },
  { label: "Recent", value: "recent" },
];

const sortOptions: Array<{ label: string; value: SearchSort }> = [
  { label: "Recently Updated", value: "updated" },
  { label: "Alphabetical", value: "alphabetical" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
];

const sortFolders = (folders: Folder[], sort: SearchSort): Folder[] =>
  [...folders].sort((a, b) => {
    switch (sort) {
      case "alphabetical":
        return a.name.localeCompare(b.name);
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "updated":
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });

const sortItems = (items: SavedItem[], sort: SearchSort): SavedItem[] =>
  [...items].sort((a, b) => {
    switch (sort) {
      case "alphabetical":
        return a.title.localeCompare(b.title);
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "updated":
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });

const getRecentResults = (results: SearchResults): SearchResults => ({
  folders: sortFolders(results.folders, "updated").slice(0, RECENT_FOLDER_LIMIT),
  items: sortItems(results.items, "updated").slice(0, RECENT_ITEM_LIMIT),
});

const SearchSkeleton = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
  <ScreenSkeleton>
    <SkeletonBlock height={38} radius={16} width="42%" />
    <SkeletonBlock height={50} radius={25} />
    <SkeletonBlock height={24} radius={12} width="36%" style={styles.skeletonSection} />
    <SkeletonList
      count={4}
      renderItem={() => (
        <View style={styles.skeletonCard}>
          <SkeletonBlock height={24} radius={12} width={56} />
          <SkeletonText lineCount={2} lineWidths={["72%", "44%"]} style={styles.skeletonCardText} />
        </View>
      )}
    />
    <SkeletonBlock height={24} radius={12} width="28%" style={styles.skeletonSection} />
    <SkeletonList
      count={5}
      renderItem={() => (
        <View style={styles.skeletonCard}>
          <SkeletonText lineCount={3} lineWidths={["82%", "58%", "36%"]} />
        </View>
      )}
    />
  </ScreenSkeleton>
  );
};

type SearchFolderRowProps = {
  count: number;
  folder: Folder;
  onOpenFolder: (folderId: string) => void;
};

const SearchFolderRow = React.memo(function SearchFolderRow({ count, folder, onOpenFolder }: SearchFolderRowProps) {
  const onPress = useCallback(() => {
    onOpenFolder(folder.id);
  }, [folder.id, onOpenFolder]);

  return <FolderCard count={count} folder={folder} onPress={onPress} />;
});

type SearchItemRowProps = {
  item: SavedItem;
  folderPath: string;
  onOpenItemDetail: (itemId: string) => void;
};

const SearchItemRow = React.memo(function SearchItemRow({ item, folderPath, onOpenItemDetail }: SearchItemRowProps) {
  const onPress = useCallback(() => {
    onOpenItemDetail(item.id);
  }, [item.id, onOpenItemDetail]);

  return <ItemCard item={item} folderPath={folderPath} onPress={onPress} />;
});

export const SearchScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items } = useTrove();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [sort, setSort] = useState<SearchSort>("updated");

  const hasQuery = query.trim().length > 0;

  const matchedResults = useMemo<SearchResults>(
    () => (hasQuery ? searchFoldersAndItems(query, folders, items) : { folders, items }),
    [folders, hasQuery, items, query],
  );

  const sortedResults = useMemo<SearchResults>(
    () => ({
      folders: sortFolders(matchedResults.folders, sort),
      items: sortItems(matchedResults.items, sort),
    }),
    [matchedResults.folders, matchedResults.items, sort],
  );

  const recentResults = useMemo<SearchResults>(() => getRecentResults(matchedResults), [matchedResults]);
  const sortedRecentResults = useMemo<SearchResults>(
    () => ({
      folders: sortFolders(recentResults.folders, sort),
      items: sortItems(recentResults.items, sort),
    }),
    [recentResults.folders, recentResults.items, sort],
  );

  const results = useMemo<SearchResults>(() => {
    const source = !hasQuery || filter === "recent" ? sortedRecentResults : sortedResults;

    switch (filter) {
      case "folders":
        return { folders: source.folders, items: [] };
      case "items":
        return { folders: [], items: source.items };
      case "recent":
      case "all":
      default:
        return source;
    }
  }, [filter, hasQuery, sortedRecentResults, sortedResults]);

  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1));
    return counts;
  }, [items]);

  const showFolders = filter !== "items";
  const showItems = filter !== "folders";
  const visibleFolderCount = results.folders.length;
  const visibleItemCount = results.items.length;
  const visibleResultCount = visibleFolderCount + visibleItemCount;
  const hasAnyResult = visibleResultCount > 0;
  const countSource = hasQuery ? sortedResults : recentResults;
  const filterCounts: Record<SearchFilter, number> = {
    all: (hasQuery ? countSource.folders.length : recentResults.folders.length) + (hasQuery ? countSource.items.length : recentResults.items.length),
    folders: hasQuery ? countSource.folders.length : recentResults.folders.length,
    items: hasQuery ? countSource.items.length : recentResults.items.length,
    recent: recentResults.folders.length + recentResults.items.length,
  };
  const canResetSearchView = hasQuery || filter !== "all" || sort !== "updated";
  const emptyTitle =
    filter === "folders"
      ? hasQuery
        ? "No matching folders."
        : "No recent folders yet."
      : filter === "items"
        ? hasQuery
          ? "No matching items."
          : "No recent items yet."
        : filter === "recent"
          ? hasQuery
            ? "No recent matches."
            : "No recent activity yet."
          : hasQuery
            ? "No matches found."
            : "Nothing to show yet.";
  const emptyMessage =
    filter === "recent"
      ? hasQuery
        ? "Try All to include older matches."
        : "Recent folders and items will appear here once you add or update them."
      : hasQuery
        ? "Try a different term or reset the search view."
        : "Recent folders and items will appear here once you add or update them.";

  const onOpenFolder = useCallback(
    (folderId: string) => {
      navigation.navigate("Folder", { folderId });
    },
    [navigation],
  );

  const onOpenItemDetail = useCallback(
    (itemId: string) => {
      navigation.navigate("ItemDetail", { itemId });
    },
    [navigation],
  );

  const clearQuery = useCallback(() => {
    setQuery("");
  }, []);

  const resetSearchView = useCallback(() => {
    setFilter("all");
    setSort("updated");
    setQuery("");
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!isReady ? (
          <SearchSkeleton />
        ) : (
          <>
            <Text style={styles.title}>Search</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Folders, titles, tags, URLs..."
              autoFocus
            />
            {hasQuery && (
              <Pressable onPress={clearQuery} style={({ pressed }) => [styles.clearQuery, pressed && styles.controlPressed]}>
                <Text style={styles.clearQueryText}>Clear search</Text>
              </Pressable>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.controlScroller}
              contentContainerStyle={styles.controlRow}
            >
              {filterOptions.map((option) => {
                const selected = filter === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setFilter(option.value)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      selected && styles.filterChipSelected,
                      pressed && styles.controlPressed,
                    ]}
                  >
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                      {option.label} {filterCounts[option.value]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sortBlock}>
              <Text style={styles.sortLabel}>Sort by</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
                {sortOptions.map((option) => {
                  const selected = sort === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setSort(option.value)}
                      style={({ pressed }) => [
                        styles.sortChip,
                        selected && styles.sortChipSelected,
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text style={[styles.sortChipText, selected && styles.sortChipTextSelected]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {canResetSearchView && (
              <View style={styles.resetRow}>
                <Pressable onPress={resetSearchView} style={({ pressed }) => pressed && styles.controlPressed}>
                  <Text style={styles.resetText}>Reset</Text>
                </Pressable>
              </View>
            )}

            {!hasAnyResult && (
              <EmptyState
                title={emptyTitle}
                message={emptyMessage}
              />
            )}

            {showFolders && hasAnyResult && (
              <>
                <Text style={styles.section}>Folders</Text>
                {results.folders.length === 0 ? (
                  <EmptyState
                    title={hasQuery ? "No folders found." : "No recent folders yet."}
                    message={hasQuery ? "Try another search term or filter." : "Created or updated folders will show here."}
                  />
                ) : (
                  results.folders.map((folder) => (
                    <SearchFolderRow
                      key={folder.id}
                      count={folderItemCounts.get(folder.id) ?? 0}
                      folder={folder}
                      onOpenFolder={onOpenFolder}
                    />
                  ))
                )}
              </>
            )}

            {showItems && hasAnyResult && (
              <>
                <Text style={styles.section}>Items</Text>
                {results.items.length === 0 ? (
                  <EmptyState
                    title={hasQuery ? "No items found." : "No recent items yet."}
                    message={
                      hasQuery
                        ? "Search looks across titles, descriptions, tags, and URLs."
                        : "Created or updated items will show here."
                    }
                  />
                ) : (
                  results.items.map((item) => (
                    <SearchItemRow
                      key={item.id}
                      item={item}
                      folderPath={getFolderPathLabel(folders, item.folderId)}
                      onOpenItemDetail={onOpenItemDetail}
                    />
                  ))
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};
