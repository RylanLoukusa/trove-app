import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { SkeletonAvatar, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import {
  FolderAccess,
  FolderShareInvite,
  FolderShareRole,
  FolderShareScope,
  SavedCollaborator,
  buildFolderInviteLink,
  loadFolderSharing,
  loadSavedCollaborators,
  removeFolderShare,
  revokeFolderInvite,
  shareFolderByEmail,
  shareFolderWithCollaborator,
  updateFolderShare,
} from "../../collaboration/folderSharing";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { colors } from "../../theme/theme";
import { getFolderById, getFolderPathLabel } from "../../utils/folderTree";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ShareFolder">;

const AccessListSkeleton = () => (
  <SkeletonList
    count={5}
    renderItem={() => (
      <View style={styles.accessCard}>
        <View style={styles.accessHeader}>
          <SkeletonAvatar size={36} />
          <SkeletonText
            lineCount={2}
            lineWidths={["68%", "48%"]}
            style={styles.accessCopy}
          />
        </View>
        <View style={styles.inlineActions}>
          <SkeletonBlock height={38} radius={19} width={112} />
          <SkeletonBlock height={38} radius={19} width={148} />
        </View>
      </View>
    )}
  />
);

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

const accessRoleLabel = (role: FolderAccess["role"]): string => {
  if (role === "owner") return "Owner";
  return roleLabel(role);
};

const emailLooksValid = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const initialsFromLabel = (label: string, fallback = "U"): string => {
  const words = label
    .split(/[\s@._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return (words[0]?.[0] ?? fallback).concat(words[1]?.[0] ?? "").toUpperCase();
};

const accessUserLabel = (access: FolderAccess): string =>
  access.displayName ?? access.email ?? `User ${access.userId.slice(0, 8)}`;

const accessUserInitials = (access: FolderAccess): string =>
  initialsFromLabel(accessUserLabel(access), access.kind === "owner" ? "O" : "U");

const accessMetaLabel = (access: FolderAccess): string => {
  if (access.kind === "owner") {
    return "Owner";
  }

  const role = accessRoleLabel(access.role);
  if (access.kind === "inherited") {
    return `${role} · Inherited from ${access.sourceFolderName ?? "parent folder"}`;
  }

  return `${role} · ${scopeLabel(access.scope as FolderShareScope)}`;
};

const collaboratorLabel = (collaborator: SavedCollaborator): string =>
  collaborator.displayName ?? collaborator.email ?? `User ${collaborator.id.slice(0, 8)}`;

const collaboratorInitials = (collaborator: SavedCollaborator): string =>
  initialsFromLabel(collaboratorLabel(collaborator));

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
  const { folders, refreshFromRemote, syncFolderForSharing } = useTrove();
  const folder = getFolderById(folders, route.params.folderId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FolderShareRole>("viewer");
  const [scope, setScope] = useState<FolderShareScope>("folder_only");
  const [accessRows, setAccessRows] = useState<FolderAccess[]>([]);
  const [collaborators, setCollaborators] = useState<SavedCollaborator[]>([]);
  const [invites, setInvites] = useState<FolderShareInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const folderPath = useMemo(
    () => (folder ? getFolderPathLabel(folders, folder.id) : ""),
    [folder, folders],
  );
  const canManageAccess = !folder?.accessRole || folder.accessRole === "owner";
  const visibleAccessRows = useMemo(
    () =>
      accessRows.filter(
        (access) =>
          access.kind === "owner" ||
          !session?.user ||
          access.userId !== session.user.id,
      ),
    [accessRows, session?.user],
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

      const [sharingResult, collaboratorsResult] = await Promise.all([
        loadFolderSharing(supabase, folder.id),
        canManageAccess
          ? loadSavedCollaborators(supabase)
          : Promise.resolve({ collaborators: [], error: undefined }),
      ]);

      if (sharingResult.error) {
        setError(sharingResult.error);
      } else {
        setError(collaboratorsResult.error ?? null);
        setAccessRows(sharingResult.access);
        setInvites(sharingResult.invites);
        setCollaborators(collaboratorsResult.collaborators);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [canManageAccess, folder, session?.user],
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

  const onShareCollaborator = useCallback(
    async (collaborator: SavedCollaborator): Promise<void> => {
      if (!folder) return;

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

      const result = await shareFolderWithCollaborator(supabase, {
        collaborator,
        folderId: folder.id,
        role,
        scope,
      });

      setIsSaving(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      await refreshAfterMutation();

      Alert.alert(
        result.emailSent ? "Access email sent" : "Access added",
        result.emailSent
          ? `${collaboratorLabel(collaborator)} now has access to the folder, and an email was sent.`
          : `${collaboratorLabel(collaborator)} now has access to the folder.${
              result.emailError ? `\n\n${result.emailError}` : ""
            }`,
      );
    },
    [folder, refreshAfterMutation, role, scope, session?.user, syncFolderForSharing],
  );

  const onUpdateAccess = useCallback(
    async (access: FolderAccess, updates: { role?: FolderShareRole; scope?: FolderShareScope }): Promise<void> => {
      if (!access.shareId || access.kind !== "direct") return;

      const supabase = getSupabase();
      if (!supabase) return;

      const result = await updateFolderShare(supabase, access.shareId, updates);
      if (result.error) {
        Alert.alert("Could not update access", result.error);
        return;
      }

      await refreshAfterMutation();
    },
    [refreshAfterMutation],
  );

  const onRemoveAccess = useCallback(
    (access: FolderAccess): void => {
      if (!access.shareId || access.kind !== "direct") return;
      const shareId = access.shareId;

      Alert.alert("Remove access?", `${accessUserLabel(access)} will lose access to this folder.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const supabase = getSupabase();
              if (!supabase) return;

              const result = await removeFolderShare(supabase, shareId);
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
        message: `You're invited to a shared folder in Trove: ${link}`,
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

        {canManageAccess && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Share folder</Text>
            {collaborators.length > 0 && (
              <>
                <Text style={styles.label}>Saved collaborators</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collaboratorRow}
                >
                  {collaborators.map((collaborator) => (
                    <Pressable
                      key={collaborator.id}
                      disabled={isSaving}
                      onPress={() => {
                        void onShareCollaborator(collaborator);
                      }}
                      style={({ pressed }) => [
                        styles.collaboratorChip,
                        pressed && styles.collaboratorChipPressed,
                        isSaving && styles.disabledChip,
                      ]}
                    >
                      <View style={styles.collaboratorAvatar}>
                        <Text style={styles.avatarText}>{collaboratorInitials(collaborator)}</Text>
                      </View>
                      <View style={styles.collaboratorCopy}>
                        <Text numberOfLines={1} style={styles.collaboratorName}>
                          {collaboratorLabel(collaborator)}
                        </Text>
                        {!!collaborator.email && (
                          <Text numberOfLines={1} style={styles.collaboratorEmail}>
                            {collaborator.email}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>Invite by email</Text>
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
        )}
        {!canManageAccess && !!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.section}>People with access</Text>
        {isLoading ? (
          <AccessListSkeleton />
        ) : visibleAccessRows.length === 0 ? (
          <EmptyState title="No shared access yet." message="Shared users will appear here." />
        ) : (
          visibleAccessRows.map((access) => {
            const canEditDirectAccess =
              canManageAccess &&
              access.kind === "direct" &&
              !!access.shareId &&
              access.role !== "owner";

            return (
            <View key={access.id} style={styles.accessCard}>
              <View style={styles.accessHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{accessUserInitials(access)}</Text>
                </View>
                <View style={styles.accessCopy}>
                  <Text style={styles.accessTitle}>{accessUserLabel(access)}</Text>
                  <Text style={styles.accessMeta}>{accessMetaLabel(access)}</Text>
                </View>
              </View>

              {canEditDirectAccess ? (
                <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => {
                    void onUpdateAccess(access, { role: access.role === "editor" ? "viewer" : "editor" });
                  }}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.smallButtonText}>
                    {access.role === "editor" ? "Make viewer" : "Make editor"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void onUpdateAccess(access, {
                      scope:
                        access.scope === "folder_and_subfolders"
                          ? "folder_only"
                          : "folder_and_subfolders",
                    });
                  }}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.smallButtonText}>
                    {access.scope === "folder_and_subfolders" ? "Folder only" : "Include subfolders"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onRemoveAccess(access)}
                  style={({ pressed }) => [styles.smallButton, styles.dangerButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={[styles.smallButtonText, styles.dangerButtonText]}>Remove</Text>
                </Pressable>
                </View>
              ) : (
                <View style={styles.inlineActions}>
                  <View style={styles.lockedPill}>
                    <Text style={styles.lockedPillText}>
                      {access.kind === "inherited" ? "Managed on parent folder" : "Locked"}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            );
          })
        )}

        {canManageAccess && (
          <>
            <Text style={styles.section}>Invites</Text>
            {isLoading ? (
              <AccessListSkeleton />
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
          </>
        )}
      </ScrollView>
    </View>
  );
};
