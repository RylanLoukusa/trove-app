import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";

import { spacing, ThemeColors, withAlpha } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { RowGroup } from "./Rows";

export type ListTarget = { id: string; title: string; folderLabel: string };

// "add": the line also shows on the other list and stays on this one.
// "move": the line leaves this list.
export type SendMode = "add" | "move";

const RECENT_KEY = "trove:recentMoveTargets";
const RECENT_LIMIT = 3;

// Lists you sent lines to lately, newest first, kept on this device.
export const useRecentListTargets = (): [string[], (listId: string) => void] => {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(RECENT_KEY)
      .then((stored) => {
        const parsed = stored ? (JSON.parse(stored) as unknown) : [];
        if (active && Array.isArray(parsed)) setRecent(parsed.filter((id): id is string => typeof id === "string"));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const remember = useCallback((listId: string) => {
    setRecent((current) => {
      const next = [listId, ...current.filter((id) => id !== listId)].slice(0, RECENT_LIMIT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return [recent, remember];
};

type Props = {
  visible: boolean;
  mode: SendMode;
  // Both modes are offered unless one has no lists to go to.
  addTargets: ListTarget[];
  moveTargets: ListTarget[];
  onChangeMode: (mode: SendMode) => void;
  // What is being sent, e.g. "Milk" or "3 lines".
  subject: string;
  // Lists that already show the line (one line, "add" mode): tapping one takes it out.
  memberListIds?: string[];
  recentIds: string[];
  onPick: (listId: string, mode: SendMode) => void;
  onClose: () => void;
};

const modeCopy: Record<SendMode, { tab: string; note: string }> = {
  add: { tab: "Add to list", note: "Shows on both lists. Checking it off on one checks it off on the other." },
  move: { tab: "Move", note: "Takes it off this list and puts it on the one you pick." },
};

// One tap sends the line(s) to the chosen list.
export const SendToListSheet = ({
  visible,
  mode,
  addTargets,
  moveTargets,
  onChangeMode,
  subject,
  memberListIds = [],
  recentIds,
  onPick,
  onClose,
}: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const modes = useMemo<SendMode[]>(
    () => [...(addTargets.length ? (["add"] as const) : []), ...(moveTargets.length ? (["move"] as const) : [])],
    [addTargets.length, moveTargets.length],
  );
  const activeMode: SendMode = modes.includes(mode) ? mode : modes[0] ?? mode;
  const targets = activeMode === "add" ? addTargets : moveTargets;
  const members = activeMode === "add" ? memberListIds : [];

  const needle = query.trim().toLowerCase();
  const recent = useMemo(
    () =>
      needle
        ? []
        : recentIds
            .map((id) => targets.find((target) => target.id === id))
            .filter((target): target is ListTarget => !!target),
    [needle, recentIds, targets],
  );

  const groups = useMemo(() => {
    const matching = targets.filter(
      (target) =>
        !needle || target.title.toLowerCase().includes(needle) || target.folderLabel.toLowerCase().includes(needle),
    );
    const byFolder = new Map<string, ListTarget[]>();
    matching.forEach((target) => {
      byFolder.set(target.folderLabel, [...(byFolder.get(target.folderLabel) ?? []), target]);
    });
    return [...byFolder.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folderLabel, lists]) => ({ folderLabel, lists: lists.sort((a, b) => a.title.localeCompare(b.title)) }));
  }, [needle, targets]);

  const row = (target: ListTarget, section: "recent" | "all") => {
    const isMember = members.includes(target.id);
    const verb = activeMode === "move" ? "Move to" : isMember ? "Take off" : "Add to";
    return (
      <Pressable
        key={`${section}-${target.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${verb} ${target.title}`}
        onPress={() => onPick(target.id, activeMode)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {target.title}
          </Text>
          {(section === "recent" || isMember) && (
            <Text numberOfLines={1} style={styles.rowDetail}>
              {isMember ? "Already there. Tap to take it off" : target.folderLabel}
            </Text>
          )}
        </View>
        {isMember && <Check size={18} color={colors.accentDark} strokeWidth={2.6} />}
      </Pressable>
    );
  };

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {activeMode === "move" ? "Move" : "Add"} {subject}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Cancel</Text>
          </Pressable>
        </View>
        {modes.length > 1 && (
          <View style={styles.tabs}>
            {modes.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: option === activeMode }}
                onPress={() => onChangeMode(option)}
                style={[styles.tab, option === activeMode && styles.tabSelected]}
              >
                <Text style={[styles.tabText, option === activeMode && styles.tabTextSelected]}>
                  {modeCopy[option].tab}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.note}>{modeCopy[activeMode].note}</Text>
        <TextInput
          accessibilityLabel="Search lists"
          value={query}
          onChangeText={setQuery}
          placeholder="Search lists"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={styles.search}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {recent.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent</Text>
              <RowGroup>{recent.map((target) => row(target, "recent"))}</RowGroup>
            </View>
          )}
          {groups.map((group) => (
            <View key={group.folderLabel} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.folderLabel}</Text>
              <RowGroup>{group.lists.map((target) => row(target, "all"))}</RowGroup>
            </View>
          ))}
          {groups.length === 0 && (
            <Text style={styles.empty}>
              {needle ? "No lists match that search." : "Make another list first, then you can send lines to it."}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
      paddingTop: spacing.lg,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
    },
    title: {
      color: colors.ink,
      flex: 1,
      fontSize: 22,
      fontWeight: "800",
    },
    done: {
      color: colors.accentDark,
      fontSize: 17,
    },
    tabs: {
      backgroundColor: withAlpha(colors.border, 0.7),
      borderRadius: 10,
      flexDirection: "row",
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: 2,
    },
    tab: {
      alignItems: "center",
      borderRadius: 8,
      flex: 1,
      justifyContent: "center",
      minHeight: 34,
    },
    tabSelected: {
      backgroundColor: colors.surface,
    },
    tabText: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "600",
    },
    tabTextSelected: {
      color: colors.ink,
    },
    note: {
      color: colors.muted,
      fontSize: 13,
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
    },
    search: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      color: colors.ink,
      fontSize: 16,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      minHeight: 42,
      paddingHorizontal: spacing.md,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
      textTransform: "uppercase",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    rowPressed: {
      backgroundColor: withAlpha(colors.border, 0.5),
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      color: colors.ink,
      fontSize: 17,
    },
    rowDetail: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 1,
    },
    empty: {
      color: colors.muted,
      paddingVertical: spacing.md,
    },
  });
