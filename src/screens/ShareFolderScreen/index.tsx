import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link2, Lock, Share2, UserPlus } from "lucide-react-native";
import { useAuth } from "../../auth/AuthContext";
import { AppButton } from "../../components/AppButton";
import { EmptyState } from "../../components/EmptyState";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { SkeletonAvatar, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { requiresProForSharing } from "../../utils/limits";
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
import {
  FolderPublicLink,
  PublicLinkScope,
  buildPublicFolderLink,
  createPublicLink,
  loadPublicLinkStatus,
  revokePublicLink,
} from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { getFolderById, getFolderPathLabel } from "../../utils/folderTree";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ShareFolder">;

type ShareOutcome = { error?: string; message?: string; title?: string };

// iOS's share sheet treats `message` and `url` as separate items, so some targets
// (e.g. the "Copy" action) concatenate both -- if the link were embedded in message
// too, it'd appear twice. Android's Share module ignores `url` entirely, so the
// link has to live in `message` there or it never gets shared at all.
const shareTextWithLink = (text: string, url: string): Promise<{ action: string; activityType?: string | null }> =>
  Share.share(
    Platform.OS === "android" ? { message: `${text}: ${url}` } : { message: text, url },
  );

const AccessListSkeleton = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
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
};

type PillOption<T extends string> = {
  detail?: string;
  label: string;
  value: T;
};

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
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
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
};

const SavedCollaboratorRow = ({
  collaborators,
  disabled,
  onPress,
}: {
  collaborators: SavedCollaborator[];
  disabled: boolean;
  onPress: (collaborator: SavedCollaborator) => void;
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
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
            disabled={disabled}
            onPress={() => onPress(collaborator)}
            style={({ pressed }) => [
              styles.collaboratorChip,
              pressed && styles.collaboratorChipPressed,
              disabled && styles.disabledChip,
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
  );
};

export const ShareFolderScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { session } = useAuth();
  const { isPro, presentPaywall } = useEntitlement();
  const { folders, refreshFromRemote, syncFolderForSharing } = useTrove();
  const folder = getFolderById(folders, route.params.folderId);

  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [collaboratorScope, setCollaboratorScope] = useState<FolderShareScope>("folder_only");
  const [collaboratorError, setCollaboratorError] = useState<string | null>(null);
  const [isCollaboratorSaving, setIsCollaboratorSaving] = useState(false);

  const [shareEmail, setShareEmail] = useState("");
  const [shareScope, setShareScope] = useState<FolderShareScope>("folder_only");
  const [shareError, setShareError] = useState<string | null>(null);
  const [isShareSaving, setIsShareSaving] = useState(false);

  const [accessRows, setAccessRows] = useState<FolderAccess[]>([]);
  const [collaborators, setCollaborators] = useState<SavedCollaborator[]>([]);
  const [invites, setInvites] = useState<FolderShareInvite[]>([]);
  const [publicLink, setPublicLink] = useState<FolderPublicLink | undefined>(undefined);
  const [publicLinkScope, setPublicLinkScope] = useState<PublicLinkScope>("folder_only");
  const [publicLinkShowOwnerName, setPublicLinkShowOwnerName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublicLinkSaving, setIsPublicLinkSaving] = useState(false);
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

      const [sharingResult, collaboratorsResult, publicLinkResult] = await Promise.all([
        loadFolderSharing(supabase, folder.id),
        canManageAccess
          ? loadSavedCollaborators(supabase)
          : Promise.resolve({ collaborators: [], error: undefined }),
        canManageAccess
          ? loadPublicLinkStatus(supabase, folder.id)
          : Promise.resolve({ link: undefined, error: undefined }),
      ]);

      if (sharingResult.error) {
        setError(sharingResult.error);
      } else {
        setError(collaboratorsResult.error ?? publicLinkResult.error ?? null);
        setAccessRows(sharingResult.access);
        setInvites(sharingResult.invites);
        setCollaborators(collaboratorsResult.collaborators);
        setPublicLink(publicLinkResult.link);
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

  const performShareByEmail = useCallback(
    async (role: FolderShareRole, rawEmail: string, scope: FolderShareScope): Promise<ShareOutcome> => {
      if (!folder) return { error: "Folder not found." };

      const trimmedEmail = rawEmail.trim().toLowerCase();
      if (!emailLooksValid(trimmedEmail)) {
        return { error: "Enter a valid email address." };
      }

      const supabase = getSupabase();
      if (!supabase || !session?.user) {
        return { error: "Sign in with sync enabled to share folders." };
      }

      const syncResult = await syncFolderForSharing(folder.id);
      if (!syncResult.ok) {
        return { error: syncResult.error ?? "Sync this folder before sharing it." };
      }

      const result = await shareFolderByEmail(supabase, { email: trimmedEmail, folderId: folder.id, role, scope });
      if (result.error) {
        return { error: result.error };
      }

      const didShareExistingUser = result.result === "share";
      return {
        title: result.emailSent
          ? didShareExistingUser
            ? "Access email sent"
            : "Invite sent"
          : didShareExistingUser
            ? "Access added"
            : "Invite saved",
        message: result.emailSent
          ? didShareExistingUser
            ? "This person now has access to the folder, and an email was sent."
            : "The invite was saved and emailed."
          : `${didShareExistingUser ? "This person now has access to the folder" : "The invite was saved"}, but the email could not be sent.${
              result.emailError ? `\n\n${result.emailError}` : ""
            }`,
      };
    },
    [folder, session?.user, syncFolderForSharing],
  );

  const performShareWithCollaborator = useCallback(
    async (role: FolderShareRole, collaborator: SavedCollaborator, scope: FolderShareScope): Promise<ShareOutcome> => {
      if (!folder) return { error: "Folder not found." };

      const supabase = getSupabase();
      if (!supabase || !session?.user) {
        return { error: "Sign in with sync enabled to share folders." };
      }

      const syncResult = await syncFolderForSharing(folder.id);
      if (!syncResult.ok) {
        return { error: syncResult.error ?? "Sync this folder before sharing it." };
      }

      const result = await shareFolderWithCollaborator(supabase, { collaborator, folderId: folder.id, role, scope });
      if (result.error) {
        return { error: result.error };
      }

      return {
        title: result.emailSent ? "Access email sent" : "Access added",
        message: result.emailSent
          ? `${collaboratorLabel(collaborator)} now has access to the folder, and an email was sent.`
          : `${collaboratorLabel(collaborator)} now has access to the folder.${
              result.emailError ? `\n\n${result.emailError}` : ""
            }`,
      };
    },
    [folder, session?.user, syncFolderForSharing],
  );

  const onInviteCollaborator = useCallback(async (): Promise<void> => {
    if (requiresProForSharing(isPro, "editor")) {
      presentPaywall("sharing");
      return;
    }

    setIsCollaboratorSaving(true);
    setCollaboratorError(null);

    const outcome = await performShareByEmail("editor", collaboratorEmail, collaboratorScope);
    setIsCollaboratorSaving(false);

    if (outcome.error) {
      setCollaboratorError(outcome.error);
      return;
    }

    setCollaboratorEmail("");
    await refreshAfterMutation();
    Alert.alert(outcome.title ?? "Invite sent", outcome.message ?? "");
  }, [collaboratorEmail, collaboratorScope, isPro, performShareByEmail, presentPaywall, refreshAfterMutation]);

  const onQuickInviteCollaborator = useCallback(
    async (collaborator: SavedCollaborator): Promise<void> => {
      if (requiresProForSharing(isPro, "editor")) {
        presentPaywall("sharing");
        return;
      }

      setIsCollaboratorSaving(true);
      setCollaboratorError(null);

      const outcome = await performShareWithCollaborator("editor", collaborator, collaboratorScope);
      setIsCollaboratorSaving(false);

      if (outcome.error) {
        setCollaboratorError(outcome.error);
        return;
      }

      await refreshAfterMutation();
      Alert.alert(outcome.title ?? "Access added", outcome.message ?? "");
    },
    [collaboratorScope, isPro, performShareWithCollaborator, presentPaywall, refreshAfterMutation],
  );

  const onAddViewerByEmail = useCallback(async (): Promise<void> => {
    setIsShareSaving(true);
    setShareError(null);

    const outcome = await performShareByEmail("viewer", shareEmail, shareScope);
    setIsShareSaving(false);

    if (outcome.error) {
      setShareError(outcome.error);
      return;
    }

    setShareEmail("");
    await refreshAfterMutation();
    Alert.alert(outcome.title ?? "Invite sent", outcome.message ?? "");
  }, [performShareByEmail, refreshAfterMutation, shareEmail, shareScope]);

  const onQuickAddViewer = useCallback(
    async (collaborator: SavedCollaborator): Promise<void> => {
      setIsShareSaving(true);
      setShareError(null);

      const outcome = await performShareWithCollaborator("viewer", collaborator, shareScope);
      setIsShareSaving(false);

      if (outcome.error) {
        setShareError(outcome.error);
        return;
      }

      await refreshAfterMutation();
      Alert.alert(outcome.title ?? "Access added", outcome.message ?? "");
    },
    [performShareWithCollaborator, refreshAfterMutation, shareScope],
  );

  const onUpdateAccess = useCallback(
    async (access: FolderAccess, updates: { role?: FolderShareRole; scope?: FolderShareScope }): Promise<void> => {
      if (!access.shareId || access.kind !== "direct") return;

      if (updates.role && requiresProForSharing(isPro, updates.role)) {
        presentPaywall("sharing");
        return;
      }

      const supabase = getSupabase();
      if (!supabase) return;

      const result = await updateFolderShare(supabase, access.shareId, updates);
      if (result.error) {
        Alert.alert("Could not update access", result.error);
        return;
      }

      await refreshAfterMutation();
    },
    [isPro, presentPaywall, refreshAfterMutation],
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
      await shareTextWithLink("You're invited to a shared folder in Trove", link);
    },
    [],
  );

  const onGetAndShareLink = useCallback(async (): Promise<void> => {
    if (!folder) return;

    const supabase = getSupabase();
    if (!supabase || !session?.user) {
      setShareError("Sign in with sync enabled to create a shareable link.");
      return;
    }

    setIsPublicLinkSaving(true);
    setShareError(null);

    let link = publicLink;

    if (!link) {
      const syncResult = await syncFolderForSharing(folder.id);
      if (!syncResult.ok) {
        setIsPublicLinkSaving(false);
        setShareError(syncResult.error ?? "Sync this folder before creating a link.");
        return;
      }

      const result = await createPublicLink(supabase, folder.id, publicLinkScope, publicLinkShowOwnerName);
      if (result.error) {
        setIsPublicLinkSaving(false);
        setShareError(result.error);
        return;
      }

      link = result.link;
      setPublicLink(link);
    }

    setIsPublicLinkSaving(false);

    if (link) {
      const url = buildPublicFolderLink(link.token);
      await shareTextWithLink(`View "${folder.name}" in Trove`, url);
    }
  }, [folder, publicLink, publicLinkScope, publicLinkShowOwnerName, session?.user, syncFolderForSharing]);

  const onRevokePublicLink = useCallback((): void => {
    if (!publicLink) return;
    const linkId = publicLink.id;

    Alert.alert(
      "Revoke this link?",
      "Anyone with the current link will no longer be able to view this folder.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const supabase = getSupabase();
              if (!supabase) return;

              setIsPublicLinkSaving(true);
              const result = await revokePublicLink(supabase, linkId);
              setIsPublicLinkSaving(false);

              if (result.error) {
                Alert.alert("Could not revoke link", result.error);
                return;
              }

              setPublicLink(undefined);
            })();
          },
        },
      ],
    );
  }, [publicLink]);

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
            {!isPro && (
              <View style={styles.proCornerBadge}>
                <Lock size={11} color={colors.surface} />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleRow}>
                <UserPlus size={18} color={colors.accentDark} />
                <Text style={styles.panelTitle}>Invite Collaborators</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Invited collaborators can edit this folder together with you.
            </Text>

            {isPro ? (
              <>
                {collaborators.length > 0 && (
                  <SavedCollaboratorRow
                    collaborators={collaborators}
                    disabled={isCollaboratorSaving}
                    onPress={(collaborator) => {
                      void onQuickInviteCollaborator(collaborator);
                    }}
                  />
                )}

                <Text style={styles.label}>Invite by email</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setCollaboratorEmail}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  testID="collaboratorEmailInput"
                  value={collaboratorEmail}
                />

                <Text style={styles.label}>Scope</Text>
                <ChoicePills options={scopeOptions} selected={collaboratorScope} onSelect={setCollaboratorScope} />

                {!!collaboratorError && <Text style={styles.error}>{collaboratorError}</Text>}
                <AppButton
                  disabled={isCollaboratorSaving}
                  label={isCollaboratorSaving ? "Inviting..." : "Invite"}
                  onPress={() => {
                    void onInviteCollaborator();
                  }}
                  style={styles.submitButton}
                />
              </>
            ) : (
              <AppButton
                label="Upgrade to Invite Collaborators"
                onPress={() => presentPaywall("sharing")}
                style={styles.submitButton}
              />
            )}
          </View>
        )}

        {canManageAccess && (
          <View style={styles.panel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleRow}>
                <Share2 size={18} color={colors.accentDark} />
                <Text style={styles.panelTitle}>Invite Viewers</Text>
              </View>
            </View>

            <Text style={styles.subsectionLabel}>Add a person</Text>
            <Text style={styles.cardDescription}>
              Add someone by email to let them view this folder for free. They'll need a Trove account to accept.
            </Text>
            {collaborators.length > 0 && (
              <SavedCollaboratorRow
                collaborators={collaborators}
                disabled={isShareSaving}
                onPress={(collaborator) => {
                  void onQuickAddViewer(collaborator);
                }}
              />
            )}
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setShareEmail}
              placeholder="name@example.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="shareEmailInput"
              value={shareEmail}
            />

            <Text style={styles.label}>Scope</Text>
            <ChoicePills options={scopeOptions} selected={shareScope} onSelect={setShareScope} />

            {!!shareError && <Text style={styles.error}>{shareError}</Text>}
            <AppButton
              disabled={isShareSaving}
              variant="secondary"
              label={isShareSaving ? "Adding..." : "Add"}
              onPress={() => {
                void onAddViewerByEmail();
              }}
              style={styles.submitButton}
            />

            <View style={styles.cardDivider} />

            <Text style={styles.subsectionLabel}>Get a link</Text>
            <Text style={styles.cardDescription}>
              Anyone with this link can see this folder and its items, even without the Trove app.
            </Text>
            {publicLink ? (
              <>
                <Text style={styles.label}>Scope</Text>
                <Text style={styles.accessMeta}>{scopeLabel(publicLink.scope)}</Text>
                <Text style={styles.label}>Your name</Text>
                <Text style={styles.accessMeta}>
                  {publicLink.showOwnerName ? "Shown on this link" : "Hidden on this link"}
                </Text>
                <View style={styles.inlineActions}>
                  <AppButton
                    disabled={isPublicLinkSaving}
                    variant="secondary"
                    label={isPublicLinkSaving ? "Sharing..." : "Share Link"}
                    onPress={() => {
                      void onGetAndShareLink();
                    }}
                    style={styles.publicLinkButton}
                  />
                  <Pressable
                    disabled={isPublicLinkSaving}
                    onPress={onRevokePublicLink}
                    style={({ pressed }) => [styles.smallButton, styles.dangerButton, pressed && styles.smallButtonPressed]}
                  >
                    <Text style={[styles.smallButtonText, styles.dangerButtonText]}>Revoke</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Scope</Text>
                <ChoicePills options={scopeOptions} selected={publicLinkScope} onSelect={setPublicLinkScope} />
                <Pressable
                  onPress={() => setPublicLinkShowOwnerName((value) => !value)}
                  style={styles.checkboxRow}
                  testID="publicLinkShowOwnerNameCheckbox"
                >
                  <Text style={styles.checkboxGlyph}>{publicLinkShowOwnerName ? "☑" : "☐"}</Text>
                  <Text style={styles.checkboxLabel}>Show my name on this link</Text>
                </Pressable>
                <AppButton
                  disabled={isPublicLinkSaving}
                  variant="secondary"
                  label={isPublicLinkSaving ? "Getting link..." : "Get Link"}
                  onPress={() => {
                    void onGetAndShareLink();
                  }}
                  style={styles.submitButton}
                />
              </>
            )}
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
