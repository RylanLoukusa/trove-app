import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/EmptyState";
import { FolderCard } from "../../components/FolderCard";
import { ItemCard } from "../../components/ItemCard";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { RootStackParamList } from "../../navigation/types";
import { useWaitingList } from "../../storage/storage";
import { Folder, SavedItem } from "../../types/models";
import { getFolderPathLabel } from "../../utils/folderTree";
import { searchFoldersAndItems } from "../../utils/itemFilters";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

const SearchSkeleton = () => (
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

type SearchFolderRowProps = {
  folder: Folder;
  onOpenFolder: (folderId: string) => void;
};

const SearchFolderRow = React.memo(function SearchFolderRow({ folder, onOpenFolder }: SearchFolderRowProps) {
  const onPress = useCallback(() => {
    onOpenFolder(folder.id);
  }, [folder.id, onOpenFolder]);

  return <FolderCard folder={folder} onPress={onPress} />;
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

export const SearchScreen = ({ navigation }: Props) => {
  const { folders, isReady, items } = useWaitingList();
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchFoldersAndItems(query, folders, items), [query, folders, items]);

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

        <Text style={styles.section}>Folders</Text>
        {results.folders.length === 0 ? (
          <EmptyState title="No folders found." message="Try another search term." />
        ) : (
          results.folders.map((folder) => <SearchFolderRow key={folder.id} folder={folder} onOpenFolder={onOpenFolder} />)
        )}

        <Text style={styles.section}>Items</Text>
        {results.items.length === 0 ? (
          <EmptyState
            title="No items found."
            message="Search looks across titles, descriptions, tags, and URLs."
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
      </ScrollView>
    </View>
  );
};
