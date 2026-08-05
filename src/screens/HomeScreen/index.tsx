import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Sparkles } from "lucide-react-native";
import { AppButton } from "../../components/AppButton";
import { EmptyState } from "../../components/EmptyState";
import { FolderCard } from "../../components/FolderCard";
import { FolderTreeBrowserModal } from "../../components/FolderTreeBrowserModal";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { SpotlightMessageCard, SpotlightOverlay, useSpotlightAnchor } from "../../components/SpotlightTour";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useTrove } from "../../storage/storage";
import { spacing } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import { displayTextForSyncSnapshot } from "../../sync/syncStatus";
import { useAuth } from "../../auth/AuthContext";
import { Folder } from "../../types/models";
import { getDescendantFolderIds, getVisibleRootFolders } from "../../utils/folderTree";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

type ScreenStyles = ReturnType<typeof createStyles>;

const HomeSkeleton = ({ styles }: { styles: ScreenStyles }) => (
  <ScreenSkeleton>
    <SkeletonText lineCount={1} lineWidths={["72%"]} />
    <SkeletonBlock height={44} radius={14} width="46%" />
    <SkeletonBlock height={48} radius={24} />
    <View style={styles.actions}>
      <SkeletonBlock height={52} radius={16} style={styles.action} />
      <SkeletonBlock height={52} radius={16} style={styles.action} />
    </View>
    <SkeletonBlock height={24} radius={12} width="42%" style={styles.skeletonSection} />
    <SkeletonList
      count={5}
      renderItem={() => (
        <View style={styles.skeletonCard}>
          <SkeletonBlock height={24} radius={12} width={56} />
          <SkeletonText lineCount={2} lineWidths={["72%", "38%"]} style={styles.skeletonCardText} />
        </View>
      )}
    />
  </ScreenSkeleton>
);

type FolderListItemProps = {
  folder: Folder;
  count: number;
  onOpenFolder: (folderId: string) => void;
  anchorRef?: React.Ref<View>;
};

const FolderListItem = React.memo(function FolderListItem({ folder, count, onOpenFolder, anchorRef }: FolderListItemProps) {
  const onPress = useCallback(() => {
    onOpenFolder(folder.id);
  }, [folder.id, onOpenFolder]);

  if (anchorRef) {
    return (
      <View ref={anchorRef}>
        <FolderCard folder={folder} count={count} onPress={onPress} />
      </View>
    );
  }

  return <FolderCard folder={folder} count={count} onPress={onPress} />;
});

export const HomeScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items, syncSnapshot, syncToRemote } = useTrove();
  const { session, signOut } = useAuth();
  const { isPro, isLoading: isEntitlementLoading, presentPaywall } = useEntitlement();
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false);

  const { currentStep, stepNumber, totalSteps, next, skip, maybeStart } = useOnboardingTour();
  const isHomeStepHere = currentStep?.screen === "Home";
  const isSpotlightStepHere = isHomeStepHere && currentStep?.mode !== "message";
  const isMessageStepHere = isHomeStepHere && currentStep?.mode === "message";
  const { scrollRef, onScroll, registerAnchor, rect } = useSpotlightAnchor(
    isSpotlightStepHere ? currentStep?.anchorKey : undefined,
  );

  useFocusEffect(
    useCallback(() => {
      maybeStart();
    }, [maybeStart]),
  );

  const onOpenFolderBrowser = useCallback(() => {
    setIsFolderBrowserOpen(true);
  }, []);

  const onCloseFolderBrowser = useCallback(() => {
    setIsFolderBrowserOpen(false);
  }, []);

  const onSelectFolderFromBrowser = useCallback(
    (folderId: string) => {
      setIsFolderBrowserOpen(false);
      navigation.navigate("Folder", { folderId });
    },
    [navigation],
  );

  const onPressUpgrade = useCallback(() => {
    presentPaywall("general");
  }, [presentPaywall]);

  const onPressSearch = useCallback(() => {
    navigation.navigate("Search");
  }, [navigation]);

  const onPressAddItem = useCallback(() => {
    navigation.navigate("AddEditItem");
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

  const onPressSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  const onPressManageTags = useCallback(() => {
    navigation.navigate("ManageTags");
  }, [navigation]);

  const onPressProfile = useCallback(() => {
    navigation.navigate("Profile");
  }, [navigation]);

  const onPressLogin = useCallback(() => {
    navigation.navigate("Login");
  }, [navigation]);

  const onSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const onOpenMenu = useCallback(() => {
    const buttons = [
      ...(session?.user ? [{ text: "Profile", onPress: onPressProfile }] : []),
      { text: "Settings", onPress: onPressSettings },
      session?.user
        ? { text: "Logout", style: "destructive" as const, onPress: onSignOut }
        : { text: "Login", onPress: onPressLogin },
      { text: "Cancel", style: "cancel" as const },
    ];

    Alert.alert("Menu", "Choose an action", buttons);
  }, [onPressProfile, onPressSettings, onPressLogin, onSignOut, session?.user]);

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

  const countForFolder = (folderId: string) => {
    const ids = [folderId, ...getDescendantFolderIds(folders, folderId)];
    return items.filter((item) => ids.includes(item.folderId)).length;
  };

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        navigation={navigation}
        showBack={false}
        onMenuPress={onOpenMenu}
        rightActions={
          !isEntitlementLoading && !isPro ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Trove Pro"
              onPress={onPressUpgrade}
              style={({ pressed }) => [styles.upgradePill, pressed && styles.upgradePillPressed]}
            >
              <Sparkles size={13} color={colors.onAccent} />
              <Text style={styles.upgradePillText}>Pro</Text>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {!isReady ? (
          <HomeSkeleton styles={styles} />
        ) : (
          <>
        <Text style={styles.kicker}>Save plans, ideas, and links in one place.</Text>
        <Text style={styles.title}>Trove</Text>

        {session?.user && isPro ? (
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
        </View>

        <View ref={registerAnchor("folders", spacing.lg)}>
        <View style={styles.rowHeader}>
          <Text style={styles.section}>Folders</Text>
          <View style={styles.rowHeaderActions}>
            {folders.length > 0 && (
              <Pressable onPress={onOpenFolderBrowser}>
                <Text style={styles.link}>Browse all</Text>
              </Pressable>
            )}
            <Pressable onPress={onPressNewFolder}>
              <Text style={styles.link}>New folder</Text>
            </Pressable>
          </View>
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
              anchorRef={
                folder.name === "Places" && !folder.parentFolderId
                  ? registerAnchor("places-folder", spacing.xs, spacing.xs)
                  : undefined
              }
            />
          ))
        )}
        </View>

        <Text style={styles.section}>Tags</Text>
        <View style={styles.legalLinks}>
          <Pressable onPress={onPressManageTags} style={({ pressed }) => [styles.legalLink, pressed && styles.legalLinkPressed]}>
            <Text style={styles.legalLinkText}>Manage Tags</Text>
            <Text style={styles.legalLinkArrow}>›</Text>
          </Pressable>
        </View>
          </>
        )}
      </ScrollView>
      <FolderTreeBrowserModal
        visible={isFolderBrowserOpen}
        folders={folders}
        onClose={onCloseFolderBrowser}
        onSelectFolder={onSelectFolderFromBrowser}
      />
      {isSpotlightStepHere && currentStep && rect ? (
        <SpotlightOverlay
          rect={rect}
          title={currentStep.title}
          body={currentStep.body}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          mode={currentStep.mode === "info" ? "info" : "action"}
          placement={currentStep.preferredPlacement}
          onNext={next}
          onSkip={skip}
        />
      ) : null}
      {isMessageStepHere && currentStep ? (
        <SpotlightMessageCard title={currentStep.title} body={currentStep.body} primaryLabel="Next" onPrimary={next} onSkip={skip} />
      ) : null}
    </View>
  );
};
