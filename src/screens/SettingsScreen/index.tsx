import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth, useIsSupabaseConfigured } from "../../auth/AuthContext";
import { getSignedInLabel } from "../../auth/authDisplay";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonText } from "../../components";
import { deleteStoredMediaForItems } from "../../lib/supabaseStorage";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../legal/legalLinks";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { ThemePreference, useThemeColors, useThemePreference } from "../../theme/ThemeContext";
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
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();
  const { folders, isReady, items, resetToSeed, clearLocalData } = useTrove();
  const { session, isAuthReady, signOut, deleteAccount } = useAuth();
  const supabaseConfigured = useIsSupabaseConfigured();

  const [busy, setBusy] = useState(false);

  const confirmReset = useCallback((): void => {
    Alert.alert(
      "Reset sample data?",
      "This replaces local data with the original sample folders and items.",
      [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: resetToSeed }],
    );
  }, [resetToSeed]);


  const onSignOut = useCallback(async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
  }, [signOut]);

  const onDeleteAccount = useCallback(async () => {
    setBusy(true);
    const mediaResult = await deleteStoredMediaForItems(items);
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
  }, [clearLocalData, deleteAccount, items]);

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

  const openLegalLink = useCallback(async (url: string): Promise<void> => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open link", "Please try again.");
    }
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!isReady ? (
          <SettingsSkeleton />
        ) : (
          <>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>
          Trove works offline and stores folders and items locally on this device. Sign in to sync your
          plans and collections to Supabase when configured.
        </Text>
        <Text style={styles.stat}>{folders.length} folders</Text>
        <Text style={styles.stat}>{items.length} saved items</Text>

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

        <Text style={styles.sectionTitle}>Account</Text>
        {!supabaseConfigured ? (
          <Text style={styles.body}>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see README) to enable cloud sync.
          </Text>
        ) : !isAuthReady ? (
          <ActivityIndicator style={styles.button} />
        ) : session?.user ? (
          <>
            <Text style={styles.signedIn}>{getSignedInLabel(session)}</Text>
            <AppButton label="Sign out" variant="secondary" onPress={onSignOut} style={styles.button} />
            <AppButton label="Delete account" variant="danger" onPress={confirmDeleteAccount} disabled={busy} style={styles.button} />
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Sign in to sync Trove with Supabase. You can also create a new account from the login screen.
            </Text>
            <AppButton label="Go to login screen" variant="secondary" onPress={onPressLogin} style={styles.button} />
          </>
        )}

        <Text style={styles.sectionTitle}>Legal</Text>
        <View style={styles.legalLinks}>
          <Pressable onPress={() => void openLegalLink(PRIVACY_POLICY_URL)} style={({ pressed }) => [styles.legalLink, pressed && styles.legalLinkPressed]}>
            <Text style={styles.legalLinkText}>Privacy Policy</Text>
            <Text style={styles.legalLinkArrow}>›</Text>
          </Pressable>
          <Pressable onPress={() => void openLegalLink(TERMS_OF_USE_URL)} style={({ pressed }) => [styles.legalLink, pressed && styles.legalLinkPressed]}>
            <Text style={styles.legalLinkText}>Terms of Use</Text>
            <Text style={styles.legalLinkArrow}>›</Text>
          </Pressable>
        </View>

        <AppButton label="Reset to sample data" variant="danger" onPress={confirmReset} style={styles.button} />
        {busy ? <ActivityIndicator style={styles.button} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};
