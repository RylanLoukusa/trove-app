import React, { useCallback } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { EmptyState } from "../../components/EmptyState";
import { FolderCard } from "../../components/FolderCard";
import { ItemCard } from "../../components/ItemCard";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { RootStackParamList } from "../../navigation/types";
import { useWaitingList } from "../../storage/storage";
import { displayTextForSyncSnapshot } from "../../sync/syncStatus";
import { useAuth } from "../../auth/AuthContext";
import { Folder, SavedItem } from "../../types/models";
import { getDescendantFolderIds, getFolderPathLabel, getVisibleRootFolders } from "../../utils/folderTree";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

type FolderListItemProps = {
  folder: Folder;
  count: number;
  onOpenFolder: (folderId: string) => void;
};

const FolderListItem = React.memo(function FolderListItem({ folder, count, onOpenFolder }: FolderListItemProps) {
  const onPress = useCallback(() => {
    onOpenFolder(folder.id);
  }, [folder.id, onOpenFolder]);

  return <FolderCard folder={folder} count={count} onPress={onPress} />;
});

type RecentItemRowProps = {
  item: SavedItem;
  folderPath: string;
  onOpenItemDetail: (itemId: string) => void;
};

const RecentItemRow = React.memo(function RecentItemRow({ item, folderPath, onOpenItemDetail }: RecentItemRowProps) {
  const onPress = useCallback(() => {
    onOpenItemDetail(item.id);
  }, [item.id, onOpenItemDetail]);

  return <ItemCard item={item} folderPath={folderPath} onPress={onPress} />;
});

export const HomeScreen = ({ navigation }: Props) => {
  const { folders, items, syncSnapshot, syncToRemote } = useWaitingList();
  const { session, signOut } = useAuth();

  const onPressSearch = useCallback(() => {
    navigation.navigate("Search");
  }, [navigation]);

  const onPressAddItem = useCallback(() => {
    navigation.navigate("AddEditItem");
  }, [navigation]);

  const onPressPickSomething = useCallback(() => {
    navigation.navigate("PickSomething");
  }, [navigation]);

  const onPressNewFolder = useCallback(() => {
    navigation.navigate("AddEditFolder", { parentFolderId: null });
  }, [navigation]);

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

  const onPressSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  const onPressLogin = useCallback(() => {
    navigation.navigate("Login");
  }, [navigation]);

  const onSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const onOpenMenu = useCallback(() => {
    const buttons = [
      { text: "Settings", onPress: onPressSettings },
      session?.user
        ? { text: "Logout", style: "destructive" as const, onPress: onSignOut }
        : { text: "Login", onPress: onPressLogin },
      { text: "Cancel", style: "cancel" as const },
    ];

    Alert.alert("Menu", "Choose an action", buttons);
  }, [onPressSettings, onPressLogin, onSignOut, session?.user]);

  const onPressSyncStatus = useCallback(async () => {
    if (syncSnapshot.status === "conflicted") {
      navigation.navigate("SyncConflict");
      return;
    }

    const result = await syncToRemote();
    if (!result.ok) {
      Alert.alert("Sync failed", result.error ?? "Unable to sync Trove.");
    }
  }, [navigation, syncSnapshot.status, syncToRemote]);

  const topFolders = getVisibleRootFolders(folders);
  const recentItems = [...items]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const countForFolder = (folderId: string) => {
    const ids = [folderId, ...getDescendantFolderIds(folders, folderId)];
    return items.filter((item) => ids.includes(item.folderId)).length;
  };

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} showBack={false} onMenuPress={onOpenMenu} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Save ideas now. Pick the perfect one later.</Text>
        <Text style={styles.title}>Trove</Text>

        {session?.user ? (
          <Pressable
            accessibilityRole={
              syncSnapshot.status === "failed" || syncSnapshot.status === "conflicted"
                ? "button"
                : "text"
            }
            disabled={syncSnapshot.status !== "failed" && syncSnapshot.status !== "conflicted"}
            onPress={onPressSyncStatus}
            style={[
              styles.syncPill,
              (syncSnapshot.status === "failed" || syncSnapshot.status === "conflicted") &&
                styles.syncPillFailed,
            ]}
          >
            <Text
              style={[
                styles.syncPillText,
                (syncSnapshot.status === "failed" || syncSnapshot.status === "conflicted") &&
                  styles.syncPillTextFailed,
              ]}
            >
              {displayTextForSyncSnapshot(syncSnapshot)}
            </Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.search} onPress={onPressSearch}>
          <Text style={styles.searchText}>Search folders, ideas, tags, URLs...</Text>
        </Pressable>

        <View style={styles.actions}>
          <AppButton label="Add Item" onPress={onPressAddItem} style={styles.action} />
          <AppButton
            label="Pick Something"
            variant="secondary"
            onPress={onPressPickSomething}
            style={styles.action}
          />
        </View>

        <View style={styles.rowHeader}>
          <Text style={styles.section}>Folders</Text>
          <Pressable onPress={onPressNewFolder}>
            <Text style={styles.link}>New folder</Text>
          </Pressable>
        </View>

        {topFolders.length === 0 ? (
          <EmptyState
            title="No folders yet."
            message="Create folders to organize everything waiting for later."
          />
        ) : (
          topFolders.map((folder) => (
            <FolderListItem
              key={folder.id}
              folder={folder}
              count={countForFolder(folder.id)}
              onOpenFolder={onOpenFolder}
            />
          ))
        )}

        <Text style={styles.section}>Recently added</Text>
        {recentItems.length === 0 ? (
          <EmptyState
            title="No items here yet."
            message="Add a note, list, link, or media item to Trove."
          />
        ) : (
          recentItems.map((item) => (
            <RecentItemRow
              key={item.id}
              item={item}
              folderPath={getFolderPathLabel(folders, item.folderId)}
              onOpenItemDetail={onOpenItemDetail}
            />
          ))
        )}

        <AppButton
          label="Settings"
          variant="secondary"
          onPress={onPressSettings}
          style={styles.settings}
        />
      </ScrollView>
    </View>
  );
};
