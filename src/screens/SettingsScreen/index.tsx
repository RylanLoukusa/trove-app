import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Share, Switch, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth, useIsSupabaseConfigured } from "../../auth/AuthContext";
import { getSignedInLabel } from "../../auth/authDisplay";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonText } from "../../components";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { deleteStoredMediaForItems } from "../../lib/supabaseStorage";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../legal/legalLinks";
import { rateTrove } from "../../support/feedback";
import { useTips } from "../../tips/TipsContext";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { ThemePreference, useThemeColors, useThemePreference } from "../../theme/ThemeContext";
import { buildBackup, exportFileName, troveToText } from "../../utils/exportData";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

const themeOptions: Array<{ label: string; value: ThemePreference }> = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

const SettingsSkeleton = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
  <ScreenSkeleton>
    <SkeletonBlock height={38} radius={16} width="46%" />
    <SkeletonText lineCount={3} lineWidths={["94%", "86%", "64%"]} style={styles.skeletonBody} />
    <SkeletonBlock height={50} radius={16} />
    <SkeletonBlock height={50} radius={16} />
    <SkeletonBlock height={22} radius={11} width="34%" style={styles.skeletonSection} />
    <SkeletonBlock height={52} radius={16} />
    <SkeletonBlock height={22} radius={11} width="28%" style={styles.skeletonSection} />
    <SkeletonBlock height={104} radius={16} />
  </ScreenSkeleton>
  );
};

export const SettingsScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tips = useTips();
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();
  const { folders, isReady, items, resetToSeed, clearLocalData, getExportData } = useTrove();
  const { session, isAuthReady, signOut, deleteAccount } = useAuth();
  const { isPro, presentPaywall, restorePurchases } = useEntitlement();
  const supabaseConfigured = useIsSupabaseConfigured();

  const [busy, setBusy] = useState(false);

  const onRestorePurchases = useCallback(async (): Promise<void> => {
    const result = await restorePurchases();
    if (!result.ok) {
      Alert.alert("Restore purchases", result.error ?? "Unable to restore purchases.");
    }
  }, [restorePurchases]);

  const confirmReset = useCallback((): void => {
    Alert.alert(
      "Reset sample data?",
      "This replaces local data with the original sample folders and items.",
      [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: resetToSeed }],
    );
  }, [resetToSeed]);


  // Hands a copy of everything to the share sheet, as a file where the
  // device can share files and as plain text otherwise.
  const exportData = useCallback(
    async (kind: "text" | "backup"): Promise<void> => {
      const data = getExportData();
      const content = kind === "text" ? troveToText(data) : JSON.stringify(buildBackup(data), null, 2);
      try {
        if (Platform.OS === "ios") {
          const file = new File(Paths.cache, exportFileName(kind === "text" ? "md" : "json"));
          if (file.exists) file.delete();
          file.create();
          file.write(content);
          await Share.share({ url: file.uri });
        } else {
          await Share.share({ message: content });
        }
      } catch {
        Alert.alert("Could not export", "Please try again.");
      }
    },
    [getExportData],
  );

  const onSignOut = useCallback(async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
  }, [signOut]);

  const onDeleteAccount = useCallback(async () => {
    setBusy(true);
    const mediaResult = await deleteStoredMediaForItems(getExportData().items);
    if (!mediaResult.ok) {
      setBusy(false);
      Alert.alert("Could not delete account", mediaResult.error ?? "Unable to delete uploaded media.");
      return;
    }

    const result = await deleteAccount();
    if (!result.error) {
      clearLocalData();
      setBusy(false);
      Alert.alert("Account deleted", "Your account and synced Trove data have been deleted.");
      return;
    }

    setBusy(false);
    Alert.alert("Could not delete account", result.error);
  }, [clearLocalData, deleteAccount, getExportData]);

  const confirmDeleteAccount = useCallback((): void => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, synced folders, items, and uploaded media. Local data on this device will also be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: onDeleteAccount,
        },
      ],
    );
  }, [onDeleteAccount]);

  const onPressLogin = useCallback(() => {
    navigation.navigate("Login");
  }, [navigation]);

  const onPressManageTags = useCallback(() => {
    navigation.navigate("ManageTags");
  }, [navigation]);

  const onPressOnboarding = useCallback(() => {
    navigation.navigate("Onboarding");
  }, [navigation]);

  const openLegalLink = useCallback(async (url: string): Promise<void> => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open link", "Please try again.");
    }
  }, []);

  const row = (label: string, onPress: () => void, options: { first?: boolean; detail?: string } = {}) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.legalLink, !options.first && styles.rowDivider, pressed && styles.legalLinkPressed]}
    >
      <Text style={styles.legalLinkText}>{label}</Text>
      <View style={styles.rowEnd}>
        {options.detail ? <Text style={styles.rowDetail}>{options.detail}</Text> : null}
        <Text style={styles.legalLinkArrow}>›</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!isReady ? (
          <SettingsSkeleton />
        ) : (
          <>
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionTitle}>Account</Text>
        {!supabaseConfigured ? (
          <Text style={styles.body}>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see README) to enable cloud sync.
          </Text>
        ) : !isAuthReady ? (
          <ActivityIndicator style={styles.button} />
        ) : session?.user ? (
          <View style={styles.card}>
            <Text style={styles.signedIn}>{getSignedInLabel(session)}</Text>
            <Text style={styles.cardBody}>Sync is on, so your lists are backed up and on all your devices.</Text>
            <AppButton label="Sign out" variant="secondary" onPress={onSignOut} style={styles.button} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardBody}>
              Your lists are only on this device. Sign in to back them up and use them on all your devices.
            </Text>
            <AppButton label="Go to login screen" variant="secondary" onPress={onPressLogin} style={styles.button} />
          </View>
        )}

        <Text style={styles.sectionTitle}>Trove Pro</Text>
        <View style={styles.legalLinks}>
          {isPro
            ? row("Trove Pro", () => presentPaywall("general"), { first: true, detail: "Active" })
            : row("See what Pro adds", () => presentPaywall("general"), { first: true })}
          {row("Restore purchases", () => void onRestorePurchases())}
        </View>

        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.themeRow}>
          {themeOptions.map((option) => {
            const selected = themePreference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setThemePreference(option.value)}
                style={[styles.themePill, selected && styles.themePillSelected]}
              >
                <Text style={[styles.themePillText, selected && styles.themePillTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Lists</Text>
        <View style={styles.legalLinks}>
          {row("Manage tags", onPressManageTags, { first: true })}
          {row("Siri and Shortcuts", showShortcutsHelp)}
        </View>

        <Text style={styles.sectionTitle}>Help</Text>
        <View style={styles.legalLinks}>
          {row("How Trove works", onPressOnboarding, { first: true })}
          <View style={[styles.legalLink, styles.rowDivider]}>
            <Text style={styles.legalLinkText}>Show tips</Text>
            <Switch
              accessibilityLabel="Show tips"
              value={tips.enabled}
              onValueChange={tips.setEnabled}
              trackColor={{ true: colors.accentDark }}
            />
          </View>
          {row("See all tips again", () => {
            tips.showAgain();
            Alert.alert("Tips are back", "You'll see each tip again as you use Trove.");
          })}
        </View>

        <Text style={styles.sectionTitle}>Feedback</Text>
        <View style={styles.legalLinks}>
          {row("Send feedback", () => navigation.navigate("Feedback"), { first: true })}
          {row(Platform.OS === "ios" ? "Rate Trove on the App Store" : "Rate Trove", () => void rateTrove())}
        </View>

        <Text style={styles.sectionTitle}>Your data</Text>
        <Text style={styles.sectionNote}>
          {folders.length} {folders.length === 1 ? "folder" : "folders"} and {items.length} {items.length === 1 ? "list" : "lists"}
        </Text>
        <View style={styles.legalLinks}>
          {row("Export everything as text", () => void exportData("text"), { first: true })}
          {row("Export a backup file", () => void exportData("backup"))}
        </View>

        <Text style={styles.sectionTitle}>Legal</Text>
        <View style={styles.legalLinks}>
          {row("Privacy Policy", () => void openLegalLink(PRIVACY_POLICY_URL), { first: true })}
          {row("Terms of Use", () => void openLegalLink(TERMS_OF_USE_URL))}
        </View>

        {supabaseConfigured && isAuthReady && session?.user ? (
          <AppButton label="Delete account" variant="danger" onPress={confirmDeleteAccount} disabled={busy} style={styles.dangerButton} />
        ) : null}
        {__DEV__ ? (
          <AppButton label="Reset to sample data" variant="danger" onPress={confirmReset} style={styles.button} />
        ) : null}
        {busy ? <ActivityIndicator style={styles.button} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};

// How to add to and open lists by voice or from the Shortcuts app.
const showShortcutsHelp = () =>
  Alert.alert(
    "Siri and Shortcuts",
    Platform.OS === "ios"
      ? 'Say "Hey Siri, add to Groceries in Trove" (or any list\'s name), or "Hey Siri, add to Trove" and Siri asks which list. "Open Groceries in Trove" opens one.\n\nIn the Shortcuts app, Trove\'s "Add to Trove" and "Open a Trove list" actions do the same. Lines show up the next time Trove opens.\n\nA link works too: trove://add?list=Groceries&text=Milk'
      : "Shortcuts and automation apps can add to a list with a link such as trove://add?list=Groceries&text=Milk, or open one with trove://open?list=Groceries.",
  );
