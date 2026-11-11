import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ellipsis, LogIn, LogOut, Search, Settings, Sparkles, UserRound } from "lucide-react-native";

import { SkeletonBlock, SkeletonText } from "../../components";
import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar, NavIconButton } from "../../components/NavBar";
import { ComposeButton, FolderStrip, ListRow, RowGroup, SectionHeader, SectionLink } from "../../components/Rows";
import { useListRowActions } from "../../components/useListRowActions";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { useOnboardingTour, WELCOME_NOTE } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import { displayTextForSyncSnapshot } from "../../sync/syncStatus";
import { useThemeColors } from "../../theme/ThemeContext";
import { folderLabel, getDescendantFolderIds, getVisibleRootFolders } from "../../utils/folderTree";
import { listActivityTimes, sortListsByActivity, UNTITLED_LIST_TITLE } from "../../utils/listEntries";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

// Every list, newest first, with the folders one tap away above them.
export const HomeScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items, listEntries, syncSnapshot, syncToRemote, createItem } = useTrove();
  const { session, signOut } = useAuth();
  const { isPro, isLoading: isEntitlementLoading, presentPaywall } = useEntitlement();
  const { showWelcome, dismissWelcome, maybeStart } = useOnboardingTour();
  const { openListActions, overlays } = useListRowActions();
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      maybeStart();
    }, [maybeStart]),
  );

  const topFolders = useMemo(() => getVisibleRootFolders(folders), [folders]);
  const activity = useMemo(() => listActivityTimes(items, listEntries ?? []), [items, listEntries]);
  const lists = useMemo(() => sortListsByActivity(items, activity), [activity, items]);

  const countForFolder = useCallback(
    (folderId: string): number => {
      const ids = new Set([folderId, ...getDescendantFolderIds(folders, folderId)]);
      return items.reduce((count, item) => count + (ids.has(item.folderId) ? 1 : 0), 0);
    },
    [folders, items],
  );

  const onOpenFolder = useCallback(
    (folderId: string) => {
      navigation.navigate("Folder", { folderId });
    },
    [navigation],
  );

  // One tap starts a list: it opens with the cursor in its title.
  const onNewList = useCallback(() => {
    const list = createItem({ folderId: "", title: UNTITLED_LIST_TITLE, type: "list", tagOptionIds: [] });
    if (list) navigation.navigate("List", { listId: list.id, isNew: true });
  }, [createItem, navigation]);

  const syncNeedsAttention = syncSnapshot.status === "failed" || syncSnapshot.status === "conflicted";
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

  const menuActions: MenuAction[] = [
    ...(session?.user
      ? [
          {
            key: "profile",
            label: "Profile",
            icon: <UserRound size={20} color={colors.accentDark} />,
            onPress: () => navigation.navigate("Profile"),
          },
        ]
      : []),
    {
      key: "settings",
      label: "Settings",
      icon: <Settings size={20} color={colors.accentDark} />,
      onPress: () => navigation.navigate("Settings"),
    },
    session?.user
      ? {
          key: "logout",
          label: "Log out",
          icon: <LogOut size={20} color={colors.danger} />,
          destructive: true,
          separated: true,
          onPress: () => void signOut(),
        }
      : {
          key: "login",
          label: "Log in",
          icon: <LogIn size={20} color={colors.accentDark} />,
          separated: true,
          onPress: () => navigation.navigate("Login"),
        },
  ];

  return (
    <View style={styles.screen}>
      <NavBar
        right={
          <>
            {!isEntitlementLoading && !isPro && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Trove Pro"
                hitSlop={8}
                onPress={() => presentPaywall("general")}
                style={({ pressed }) => [styles.upgradePill, pressed && styles.pressed]}
              >
                <Sparkles size={13} color={colors.onAccent} />
                <Text style={styles.upgradePillText}>Pro</Text>
              </Pressable>
            )}
            <NavIconButton label="Open menu" onPress={() => setMenuOpen(true)}>
              <Ellipsis size={24} color={colors.accentDark} />
            </NavIconButton>
          </>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            Trove
          </Text>
          {isReady && !!session?.user && isPro && (
            <Pressable
              accessibilityRole={syncNeedsAttention ? "button" : "text"}
              disabled={!syncNeedsAttention}
              hitSlop={8}
              onPress={onPressSyncStatus}
              style={({ pressed }) => [styles.sync, pressed && styles.pressed]}
            >
              <View style={[styles.syncDot, syncNeedsAttention && styles.syncDotFailed]} />
              <Text style={[styles.syncText, syncNeedsAttention && styles.syncTextFailed]}>
                {displayTextForSyncSnapshot(syncSnapshot)}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => navigation.navigate("Search")}
          style={({ pressed }) => [styles.search, pressed && styles.pressed]}
        >
          <Search size={17} color={colors.muted} />
          <Text style={styles.searchText}>Search</Text>
        </Pressable>

        {isReady && showWelcome && (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>{WELCOME_NOTE.title}</Text>
            <Text style={styles.welcomeBody}>{WELCOME_NOTE.body}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Got it"
              hitSlop={8}
              onPress={dismissWelcome}
              style={({ pressed }) => [styles.welcomeButton, pressed && styles.pressed]}
            >
              <Text style={styles.welcomeButtonText}>Got it</Text>
            </Pressable>
          </View>
        )}

        {!isReady ? (
          <View style={styles.skeleton}>
            <SkeletonBlock height={46} radius={14} width="58%" />
            <SkeletonBlock height={62} radius={14} style={styles.skeletonRow} />
            <SkeletonText lineCount={3} lineWidths={["82%", "64%", "74%"]} style={styles.skeletonRow} />
          </View>
        ) : (
          <>
            <SectionHeader
              title="Folders"
              action={
                <SectionLink
                  label="New folder"
                  onPress={() => navigation.navigate("AddEditFolder", { parentFolderId: null })}
                />
              }
            />
            {topFolders.length > 0 ? (
              <FolderStrip folders={topFolders} countFor={countForFolder} onOpen={onOpenFolder} />
            ) : (
              <Text style={styles.hint}>No folders yet. Folders keep related lists together.</Text>
            )}

            <SectionHeader title="Lists" />
            {lists.length > 0 ? (
              <RowGroup>
                {lists.map((list) => (
                  <ListRow
                    key={list.id}
                    list={list}
                    activityAt={activity.get(list.id)}
                    folderLabel={folderLabel(folders, list.folderId)}
                    onPress={() => navigation.navigate("List", { listId: list.id })}
                    onLongPress={() => openListActions(list.id)}
                  />
                ))}
              </RowGroup>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No lists yet</Text>
                <Text style={styles.emptyText}>Tap the pencil to start one.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {isReady && <ComposeButton onPress={onNewList} />}

      <MenuSheet visible={menuOpen} actions={menuActions} onClose={() => setMenuOpen(false)} />
      {overlays}
    </View>
  );
};
