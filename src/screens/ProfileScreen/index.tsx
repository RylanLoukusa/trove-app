import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import {
  loadCurrentProfile,
  updateCurrentProfile,
  UserProfile,
} from "../../collaboration/profiles";
import { AppButton } from "../../components/AppButton";
import { MediaImage } from "../../components/MediaImage";
import { ScreenSkeleton, SkeletonBlock, SkeletonText } from "../../components";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

const initialsFromProfile = (displayName?: string | null, email?: string | null): string => {
  const source = displayName?.trim() || email?.trim() || "Trove User";
  const words = source
    .split(/[\s@._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return (words[0]?.[0] ?? "T").concat(words[1]?.[0] ?? "").toUpperCase();
};

const ProfileSkeleton = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
  <ScreenSkeleton>
    <View style={styles.header}>
      <SkeletonBlock height={88} radius={44} width={88} />
      <SkeletonText lineCount={2} lineWidths={["64%", "46%"]} style={styles.headerCopy} />
    </View>
    <SkeletonBlock height={22} radius={11} width="36%" style={styles.skeletonSection} />
    <SkeletonBlock height={54} radius={16} />
    <SkeletonBlock height={22} radius={11} width="24%" style={styles.skeletonSection} />
    <SkeletonBlock height={54} radius={16} />
    <SkeletonBlock height={52} radius={26} style={styles.button} />
  </ScreenSkeleton>
  );
};

export const ProfileScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { session } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const user = session?.user;
  const email = profile?.email ?? user?.email ?? null;
  const initials = useMemo(
    () => initialsFromProfile(displayName || profile?.displayName, email),
    [displayName, email, profile?.displayName],
  );

  const loadProfile = useCallback(async (): Promise<void> => {
    const supabase = getSupabase();
    if (!supabase || !user) {
      setError("Sign in with sync enabled to edit your profile.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await loadCurrentProfile(supabase, user.id);
    if (result.error) {
      setError(result.error);
      setProfile(null);
      setDisplayName("");
    } else {
      const nextProfile =
        result.profile ?? {
          avatarUrl: null,
          displayName: null,
          email: user.email ?? null,
          id: user.id,
          updatedAt: null,
        };
      setProfile(nextProfile);
      setDisplayName(nextProfile.displayName ?? "");
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onSave = useCallback(async (): Promise<void> => {
    const supabase = getSupabase();
    if (!supabase || !user) {
      setError("Sign in with sync enabled to edit your profile.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSavedMessage(null);

    const result = await updateCurrentProfile(supabase, {
      displayName,
      email: user.email ?? profile?.email ?? null,
      userId: user.id,
    });

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.profile) {
      setProfile(result.profile);
      setDisplayName(result.profile.displayName ?? "");
    }
    setSavedMessage("Profile saved.");
  }, [displayName, profile?.email, user]);

  const onPressSave = useCallback(() => {
    void onSave();
  }, [onSave]);

  const onRetry = useCallback(() => {
    void loadProfile();
  }, [loadProfile]);

  if (!user) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <Text style={styles.error}>Sign in to view your profile.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isLoading ? (
          <ProfileSkeleton />
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.avatar}>
                {profile?.avatarUrl ? (
                  <MediaImage
                    source={{ uri: profile.avatarUrl }}
                    skeletonRadius={44}
                    style={styles.avatarImage}
                    accessibilityLabel="Your profile photo"
                  />
                ) : (
                  <Text style={styles.avatarText}>{initials}</Text>
                )}
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Profile</Text>
                <Text style={styles.subtitle}>Choose how collaborators see you in shared folders.</Text>
              </View>
            </View>

            <Text style={styles.label}>Display name</Text>
            <TextInput
              accessibilityLabel="Display name"
              autoCapitalize="words"
              onChangeText={(value) => {
                setDisplayName(value);
                setSavedMessage(null);
              }}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={displayName}
            />

            <Text style={styles.label}>Email</Text>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyText}>{email ?? "No email available"}</Text>
            </View>

            {!!profile?.avatarUrl && (
              <>
                <Text style={styles.label}>Avatar</Text>
                <View style={styles.readOnlyRow}>
                  <Text numberOfLines={1} style={styles.readOnlyText}>{profile.avatarUrl}</Text>
                </View>
              </>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!savedMessage && <Text style={styles.success}>{savedMessage}</Text>}

            {error ? (
              <AppButton label="Try again" variant="secondary" onPress={onRetry} style={styles.button} />
            ) : null}
            <AppButton
              disabled={isSaving}
              label={isSaving ? "Saving..." : "Save Profile"}
              onPress={onPressSave}
              style={styles.button}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
};
