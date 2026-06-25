import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { AppButton } from "../../components/AppButton";
import { EmptyState } from "../../components/EmptyState";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import {
  FolderShare,
  FolderShareInvite,
  FolderShareRole,
  FolderShareScope,
  buildFolderInviteLink,
  loadFolderSharing,
  removeFolderShare,
  revokeFolderInvite,
  shareFolderByEmail,
  updateFolderShare,
} from "../../collaboration/folderSharing";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useWaitingList } from "../../storage/storage";
import { colors } from "../../theme/theme";
import { getFolderById, getFolderPathLabel } from "../../utils/folderTree";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ShareFolder">;

type PillOption<T extends string> = {
  detail?: string;
  label: string;
  value: T;
};

const roleOptions: Array<PillOption<FolderShareRole>> = [
  { label: "Can view", detail: "Read only", value: "viewer" },
  { label: "Can edit", detail: "Add and update", value: "editor" },
];

const scopeOptions: Array<PillOption<FolderShareScope>> = [
  { label: "This folder", detail: "No children", value: "folder_only" },
  { label: "Include subfolders", detail: "Full branch", value: "folder_and_subfolders" },
];

const scopeLabel = (scope: FolderShareScope): string =>
  scope === "folder_and_subfolders" ? "Folder and subfolders" : "Folder only";

const roleLabel = (role: FolderShareRole): string =>
  role === "editor" ? "Can edit" : "Can view";

const emailLooksValid = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const shareUserLabel = (share: FolderShare): string =>
  share.sharedWithProfile?.displayName ??
  share.sharedWithProfile?.email ??
  `User ${share.sharedWithUserId.slice(0, 8)}`;

const shareUserInitials = (share: FolderShare): string => {
  const label = shareUserLabel(share);
  const words = label
    .split(/[\s@._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return (words[0]?.[0] ?? "U").concat(words[1]?.[0] ?? "").toUpperCase();
};

const ChoicePills = <T extends string,>({
  options,
  selected,
  onSelect,
}: {
  onSelect: (value: T) => void;
  options: Array<PillOption<T>>;
  selected: T;
}) => (
  <View style={styles.choiceRow}>
    {options.map((option) => {
      const isSelected = selected === option.value;
      return (
        <Pressable
          key={option.value}
          onPress={() => onSelect(option.value)}
          style={({ pressed }) => [
            styles.choicePill,
            isSelected && styles.choicePillSelected,
            pressed && styles.choicePillPressed,
          ]}
        >
          <Text style={[styles.choiceLabel, isSelected && styles.choiceLabelSelected]}>
            {option.label}
          </Text>
          {!!option.detail && (
            <Text style={[styles.choiceDetail, isSelected && styles.choiceDetailSelected]}>
              {option.detail}
            </Text>
          )}
        </Pressable>
      );
    })}
  </View>
);

export const ShareFolderScreen = ({ navigation, route }: Props) => {
  const { session } = useAuth();
  const { folders, refreshFromRemote, syncFolderForSharing } = useWaitingList();
  const folder = getFolderById(folders, route.params.folderId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FolderShareRole>("viewer");
  const [scope, setScope] = useState<FolderShareScope>("folder_only");
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [invites, setInvites] = useState<FolderShareInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const folderPath = useMemo(
    () => (folder ? getFolderPathLabel(folders, folder.id) : ""),
    [folder, folders],
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial"): Promise<void> => {
      if (!folder) {
        setIsLoading(false);
        return;
      }

      const supabase = getSupabase();
      if (!supabase || !session?.user) {
        setError("Sign in with sync enabled to share folders.");
        setIsLoading(false);
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const result = await loadFolderSharing(supabase, folder.id);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setInvites(result.invites);
        setShares(result.shares);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [folder, session?.user],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAfterMutation = useCallback(async (): Promise<void> => {
    await load("refresh");
    const refreshResult = await refreshFromRemote();
    if (!refreshResult.ok) {
      setError(refreshResult.error ?? "Access was updated, but the latest data could not refresh.");
    }
  }, [load, refreshFromRemote]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!folder) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!emailLooksValid(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase || !session?.user) {
      setError("Sign in with sync enabled to share folders.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const syncResult = await syncFolderForSharing(folder.id);
    if (!syncResult.ok) {
      setIsSaving(false);
      setError(syncResult.error ?? "Sync this folder before sharing it.");
      return;
    }

    const result = await shareFolderByEmail(supabase, {
      email: trimmedEmail,
      folderId: folder.id,
      role,
      scope,
    });

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setEmail("");
    await refreshAfterMutation();

    const didShareExistingUser = result.result === "share";
    const successTitle = result.emailSent
      ? didShareExistingUser
        ? "Access email sent"
        : "Invite sent"
      : didShareExistingUser
        ? "Access added"
        : "Invite saved";
    const successMessage = result.emailSent
      ? didShareExistingUser
        ? "This person now has access to the folder, and an email was sent."
        : "The invite was saved and emailed."
      : `${didShareExistingUser ? "This person now has access to the folder" : "The invite was saved"}, but the email could not be sent.${
          result.emailError ? `\n\n${result.emailError}` : ""
        }`;

    Alert.alert(
      successTitle,
      successMessage,
    );
  }, [email, folder, refreshAfterMutation, role, scope, session?.user, syncFolderForSharing]);

  const onUpdateShare = useCallback(
    async (share: FolderShare, updates: { role?: FolderShareRole; scope?: FolderShareScope }): Promise<void> => {
      const supabase = getSupabase();
      if (!supabase) return;

      const result = await updateFolderShare(supabase, share.id, updates);
      if (result.error) {
        Alert.alert("Could not update access", result.error);
        return;
      }

      await refreshAfterMutation();
    },
    [refreshAfterMutation],
  );

  const onRemoveShare = useCallback(
    (share: FolderShare): void => {
      Alert.alert("Remove access?", `${shareUserLabel(share)} will lose access to this folder.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const supabase = getSupabase();
              if (!supabase) return;

              const result = await removeFolderShare(supabase, share.id);
              if (result.error) {
                Alert.alert("Could not remove access", result.error);
                return;
              }

              await refreshAfterMutation();
            })();
          },
        },
      ]);
    },
    [refreshAfterMutation],
  );

  const onRevokeInvite = useCallback(
    (invite: FolderShareInvite): void => {
      Alert.alert("Revoke invite?", `${invite.email} will no longer be able to accept this invite.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const supabase = getSupabase();
              if (!supabase) return;

              const result = await revokeFolderInvite(supabase, invite.id);
              if (result.error) {
                Alert.alert("Could not revoke invite", result.error);
                return;
              }

              await refreshAfterMutation();
            })();
          },
        },
      ]);
    },
    [refreshAfterMutation],
  );

  const onShareInviteLink = useCallback(
    async (invite: FolderShareInvite): Promise<void> => {
      const link = buildFolderInviteLink(invite.token);
      await Share.share({
        message: `You're invited to a shared folder in The Waiting List: ${link}`,
        url: link,
      });
    },
    [],
  );

  if (!folder) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <EmptyState title="Folder not found" message="This folder may have been deleted." />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void load("refresh");
            }}
            tintColor={colors.accentDark}
          />
        }
      >
        <Text style={styles.eyebrow}>Folder access</Text>
        <Text style={styles.title}>{folder.icon ?? "📁"} {folder.name}</Text>
        <Text style={styles.path}>{folderPath}</Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Invite by email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Permission</Text>
          <ChoicePills options={roleOptions} selected={role} onSelect={setRole} />

          <Text style={styles.label}>Scope</Text>
          <ChoicePills options={scopeOptions} selected={scope} onSelect={setScope} />

          {!!error && <Text style={styles.error}>{error}</Text>}
          <AppButton
            disabled={isSaving}
            label={isSaving ? "Saving..." : "Share Folder"}
            onPress={() => {
              void onSubmit();
            }}
            style={styles.submitButton}
          />
        </View>

        <Text style={styles.section}>People with access</Text>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accentDark} />
          </View>
        ) : shares.length === 0 ? (
          <EmptyState title="No shared access yet." message="Shared users will appear here." />
        ) : (
          shares.map((share) => (
            <View key={share.id} style={styles.accessCard}>
              <View style={styles.accessHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{shareUserInitials(share)}</Text>
                </View>
                <View style={styles.accessCopy}>
                  <Text style={styles.accessTitle}>{shareUserLabel(share)}</Text>
                  <Text style={styles.accessMeta}>
                    {roleLabel(share.role)} · {scopeLabel(share.scope)}
                  </Text>
                </View>
              </View>

              <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => {
                    void onUpdateShare(share, { role: share.role === "editor" ? "viewer" : "editor" });
                  }}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.smallButtonText}>
                    {share.role === "editor" ? "Make viewer" : "Make editor"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void onUpdateShare(share, {
                      scope:
                        share.scope === "folder_and_subfolders"
                          ? "folder_only"
                          : "folder_and_subfolders",
                    });
                  }}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.smallButtonText}>
                    {share.scope === "folder_and_subfolders" ? "Folder only" : "Include subfolders"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onRemoveShare(share)}
                  style={({ pressed }) => [styles.smallButton, styles.dangerButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={[styles.smallButtonText, styles.dangerButtonText]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Text style={styles.section}>Invites</Text>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accentDark} />
          </View>
        ) : invites.length === 0 ? (
          <EmptyState title="No invites yet." message="Pending invites will appear here." />
        ) : (
          invites.map((invite) => (
            <View key={invite.id} style={styles.accessCard}>
              <View style={styles.accessHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>@</Text>
                </View>
                <View style={styles.accessCopy}>
                  <Text style={styles.accessTitle}>{invite.email}</Text>
                  <Text style={styles.accessMeta}>
                    {invite.status} · {roleLabel(invite.role)} · {scopeLabel(invite.scope)}
                  </Text>
                </View>
              </View>
              {invite.status === "pending" && (
                <View style={styles.inlineActions}>
                  <Pressable
                    onPress={() => {
                      void onShareInviteLink(invite);
                    }}
                    style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                  >
                    <Text style={styles.smallButtonText}>Send link</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onRevokeInvite(invite)}
                    style={({ pressed }) => [styles.smallButton, styles.dangerButton, pressed && styles.smallButtonPressed]}
                  >
                    <Text style={[styles.smallButtonText, styles.dangerButtonText]}>Revoke</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};
