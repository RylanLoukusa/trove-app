import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Eye, LogOut, MessageSquare, Pencil, UserMinus } from "lucide-react-native";

import { useAuth } from "../../auth/AuthContext";
import { AppButton } from "../../components/AppButton";
import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar } from "../../components/NavBar";
import { DetailRow, RowGroup, SectionHeader } from "../../components/Rows";
import {
  ListAccess,
  ListShareRole,
  accessName,
  changeListAccess,
  listInviteMessage,
  loadListAccess,
  removeListAccess,
  shareList,
} from "../../collaboration/listSharing";
import { loadSavedCollaborators, SavedCollaborator } from "../../collaboration/folderSharing";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { getSupabase } from "../../lib/supabase";
import type { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { spacing, ThemeColors, withAlpha } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import { listDisplayTitle } from "../../utils/listEntries";
import { requiresProForSharing } from "../../utils/limits";
import { createSetAsideStyles } from "../setAsideStyles";
import { TipBubble } from "../../tips/TipBubble";
import { TIP_TEXT, useTip } from "../../tips/TipsContext";

type Props = NativeStackScreenProps<RootStackParamList, "ShareList">;

const roleLabels: Record<ListShareRole, string> = { editor: "Can edit", viewer: "Can view" };

const accessDetail = (access: ListAccess, isMe: boolean): string => {
  if (access.kind === "owner") return isMe ? "Owner (you)" : "Owner";
  if (access.kind === "invite") return `${roleLabels[access.role as ListShareRole]} · Gets it when they join Trove`;
  return `${roleLabels[access.role as ListShareRole]}${isMe ? " (you)" : ""}`;
};

// Who a list is shared with, on its own. The owner adds people by email and
// changes or takes away their access; someone it's shared with sees who else
// has it and can leave.
export const ShareListScreen = ({ navigation, route }: Props) => {
  const { listId } = route.params;
  const colors = useThemeColors();
  const base = useMemo(() => createSetAsideStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { session } = useAuth();
  const { isPro, presentPaywall } = useEntitlement();
  const { items, syncToRemote, refreshFromRemote, leaveSharedList } = useTrove();
  const list = items.find((item) => item.id === listId);
  const title = list ? listDisplayTitle(list, list.listItems) : "List";
  const userId = session?.user?.id;
  const isOwner = !!list && (!list.ownerId || list.ownerId === userId);
  // First visit on the free plan: viewing is free, editing together is Pro.
  const shareTip = useTip("sharing", !isPro && isOwner);

  const [access, setAccess] = useState<ListAccess[]>([]);
  const [collaborators, setCollaborators] = useState<SavedCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ListShareRole>(isPro ? "editor" : "viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ListAccess | null>(null);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("List", { listId });
  }, [listId, navigation]);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }
    const result = await loadListAccess(supabase, listId);
    // A list that isn't on the server yet has nobody else on it.
    setAccess(result.error ? [] : result.access);
    setLoading(false);
  }, [listId, userId]);

  useEffect(() => {
    void load();
    const supabase = getSupabase();
    if (supabase && isOwner) {
      void loadSavedCollaborators(supabase).then((result) => setCollaborators(result.collaborators));
    }
  }, [isOwner, load]);

  const afterChange = useCallback(async () => {
    await load();
    // Brings the "shared" mark on the list up to date.
    void refreshFromRemote();
  }, [load, refreshFromRemote]);

  const share = useCallback(
    async (target: { email: string } | { userId: string; name: string }) => {
      if (requiresProForSharing(isPro, role)) {
        presentPaywall("sharing");
        return;
      }
      const supabase = getSupabase();
      if (!supabase || !userId) {
        setError("Sign in to share lists.");
        return;
      }
      if ("email" in target && !/^\S+@\S+\.\S+$/.test(target.email.trim())) {
        setError("Enter an email address.");
        return;
      }
      setSaving(true);
      setError(null);
      // The list has to be on the server before anyone else can have it.
      const synced = await syncToRemote();
      if (!synced.ok) {
        setSaving(false);
        setError(synced.error ?? "Could not sync this list. Try again in a moment.");
        return;
      }
      const result = await shareList(
        supabase,
        "email" in target
          ? { listId, role, email: target.email }
          : { listId, role, userId: target.userId },
      );
      setSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEmail("");
      await afterChange();
      if (result.result === "invite" && "email" in target) {
        Alert.alert(
          "Invite waiting",
          `${target.email.trim()} doesn't have Trove yet. They'll get this list when they sign up with that email.`,
          [
            { text: "OK", style: "cancel" },
            { text: "Send them a message", onPress: () => void Share.share({ message: listInviteMessage(title) }) },
          ],
        );
      }
    },
    [afterChange, isPro, listId, presentPaywall, role, syncToRemote, title, userId],
  );

  const leave = useCallback(() => {
    Alert.alert("Leave this list?", "It goes from your Trove. The owner keeps it, and can share it with you again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () =>
          void leaveSharedList(listId).then((result) => {
            if (!result.ok) {
              Alert.alert("Could not leave list", result.error ?? "Try again in a moment.");
              return;
            }
            navigation.navigate("Home");
          }),
      },
    ]);
  }, [leaveSharedList, listId, navigation]);

  const change = useCallback(
    async (target: ListAccess, next: ListShareRole) => {
      if (requiresProForSharing(isPro, next)) {
        presentPaywall("sharing");
        return;
      }
      const supabase = getSupabase();
      if (!supabase) return;
      const result = await changeListAccess(supabase, target, next);
      if (result.error) Alert.alert("Could not change access", result.error);
      await afterChange();
    },
    [afterChange, isPro, presentPaywall],
  );

  const remove = useCallback(
    async (target: ListAccess) => {
      const supabase = getSupabase();
      if (!supabase) return;
      const result = await removeListAccess(supabase, target);
      if (result.error) Alert.alert("Could not remove access", result.error);
      await afterChange();
    },
    [afterChange],
  );

  if (!list) {
    return (
      <View style={base.screen}>
        <NavBar backLabel="Back" onBack={goBack} />
        <Text style={base.empty}>This list isn't here anymore.</Text>
      </View>
    );
  }

  const others = access.filter((person) => person.kind !== "owner" || person.userId !== userId);
  const people = [...access].sort((a, b) => (a.kind === "owner" ? -1 : b.kind === "owner" ? 1 : 0));
  const sharedOnItsOwn = !!list.sharedWithMe;
  const alreadyAdded = new Set(access.map((person) => person.userId).filter(Boolean));
  const quickPicks = collaborators.filter((person) => !alreadyAdded.has(person.id)).slice(0, 6);

  const actions: MenuAction[] = chosen
    ? chosen.kind === "invite"
      ? [
          {
            key: "message",
            label: "Send them a message",
            icon: <MessageSquare size={20} color={colors.accentDark} />,
            onPress: () => void Share.share({ message: listInviteMessage(title) }),
          },
          {
            key: "role",
            label: chosen.role === "editor" ? "Make view only" : "Let them edit",
            icon: chosen.role === "editor" ? <Eye size={20} color={colors.accentDark} /> : <Pencil size={20} color={colors.accentDark} />,
            onPress: () => void change(chosen, chosen.role === "editor" ? "viewer" : "editor"),
          },
          {
            key: "remove",
            label: "Withdraw invite",
            icon: <UserMinus size={20} color={colors.danger} />,
            destructive: true,
            separated: true,
            onPress: () => void remove(chosen),
          },
        ]
      : [
          {
            key: "role",
            label: chosen.role === "editor" ? "Make view only" : "Let them edit",
            icon: chosen.role === "editor" ? <Eye size={20} color={colors.accentDark} /> : <Pencil size={20} color={colors.accentDark} />,
            onPress: () => void change(chosen, chosen.role === "editor" ? "viewer" : "editor"),
          },
          {
            key: "remove",
            label: "Remove from list",
            icon: <UserMinus size={20} color={colors.danger} />,
            destructive: true,
            separated: true,
            onPress: () => void remove(chosen),
          },
        ]
    : [];

  return (
    <View style={base.screen}>
      <NavBar backLabel={title} onBack={goBack} />
      <ScrollView contentContainerStyle={base.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={base.title}>
          Share list
        </Text>
        {shareTip.shown && (
          <TipBubble text={TIP_TEXT.sharing} onClose={shareTip.dismiss} style={{ marginBottom: 12 }} />
        )}
        <Text style={base.note}>
          {isOwner
            ? "People you add see this list on their Home, and everyone sees changes as they happen."
            : sharedOnItsOwn
              ? `${list.sharedWithMe?.by ?? "Someone"} shared this list with you. Changes show for everyone as they happen.`
              : "You have this list through a shared folder."}
        </Text>

        {isOwner && !!userId && (
          <>
            <SectionHeader title="Add someone" />
            <View style={styles.card}>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="name@example.com"
                placeholderTextColor={colors.muted}
                returnKeyType="send"
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  setError(null);
                }}
                onSubmitEditing={() => void share({ email })}
                style={styles.input}
              />
              <View style={styles.roles}>
                {(["editor", "viewer"] as const).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: role === option }}
                    accessibilityLabel={roleLabels[option]}
                    onPress={() => setRole(option)}
                    style={[styles.role, role === option && styles.roleOn]}
                  >
                    <Text style={[styles.roleText, role === option && styles.roleTextOn]}>
                      {roleLabels[option]}
                      {option === "editor" && !isPro ? " · Pro" : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {!!error && <Text style={styles.error}>{error}</Text>}
              <AppButton label={saving ? "Sharing…" : "Share"} disabled={saving} onPress={() => void share({ email })} />
              {quickPicks.length > 0 && (
                <>
                  <Text style={styles.quickLabel}>People you've shared with</Text>
                  <View style={styles.quickRow}>
                    {quickPicks.map((person) => {
                      const name = person.displayName?.trim() || person.email || "Someone";
                      return (
                        <Pressable
                          key={person.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Share with ${name}`}
                          disabled={saving}
                          onPress={() => void share({ userId: person.id, name })}
                          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                        >
                          <Text numberOfLines={1} style={styles.chipText}>
                            {name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          </>
        )}

        {!userId ? (
          <Text style={base.empty}>Sign in to share lists.</Text>
        ) : (
          <>
            <SectionHeader title="People" />
            {loading ? (
              <Text style={styles.loading}>Loading…</Text>
            ) : others.length === 0 && isOwner ? (
              <Text style={styles.loading}>Only you have this list.</Text>
            ) : (
              <RowGroup>
                {people.map((person) => {
                  const isMe = !!person.userId && person.userId === userId;
                  const canChange = isOwner && person.kind !== "owner";
                  return (
                    <DetailRow
                      key={`${person.kind}:${person.id}`}
                      title={person.kind === "invite" ? person.email ?? "Invite" : accessName(person)}
                      detail={accessDetail(person, isMe)}
                      hint={canChange ? "Change or remove their access" : undefined}
                      onPress={() => (canChange ? setChosen(person) : undefined)}
                    />
                  );
                })}
              </RowGroup>
            )}
          </>
        )}

        {sharedOnItsOwn && (
          <Pressable
            accessibilityRole="button"
            onPress={leave}
            style={({ pressed }) => [styles.leave, pressed && styles.chipPressed]}
          >
            <LogOut size={18} color={colors.danger} />
            <Text style={styles.leaveText}>Leave list</Text>
          </Pressable>
        )}
      </ScrollView>
      <MenuSheet
        visible={!!chosen}
        title={chosen ? (chosen.kind === "invite" ? chosen.email : accessName(chosen)) : undefined}
        actions={actions}
        onClose={() => setChosen(null)}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      gap: spacing.sm,
      padding: spacing.md,
    },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.ink,
      fontSize: 17,
      paddingHorizontal: spacing.sm,
      paddingVertical: 11,
    },
    roles: {
      flexDirection: "row",
      gap: spacing.xs,
    },
    role: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    roleOn: {
      backgroundColor: withAlpha(colors.accent, 0.14),
      borderColor: colors.accent,
    },
    roleText: {
      color: colors.muted,
      fontSize: 15,
      fontWeight: "600",
    },
    roleTextOn: {
      color: colors.accentDark,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    quickLabel: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
      marginTop: spacing.xs,
    },
    quickRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    chip: {
      backgroundColor: withAlpha(colors.accent, 0.1),
      borderRadius: 16,
      maxWidth: 200,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipPressed: {
      opacity: 0.6,
    },
    chipText: {
      color: colors.accentDark,
      fontSize: 14,
      fontWeight: "600",
    },
    loading: {
      color: colors.muted,
      fontSize: 15,
      paddingHorizontal: spacing.xs,
    },
    leave: {
      alignItems: "center",
      alignSelf: "center",
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: spacing.xl,
      padding: spacing.sm,
    },
    leaveText: {
      color: colors.danger,
      fontSize: 16,
      fontWeight: "600",
    },
  });
