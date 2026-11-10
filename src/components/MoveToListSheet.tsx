import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { History, ListChecks } from "lucide-react-native";

import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";

export type MoveTarget = { id: string; title: string; folderLabel: string };

const RECENT_KEY = "trove:recentMoveTargets";
const RECENT_LIMIT = 3;

// Lists you moved lines to lately, newest first, kept on this device.
export const useRecentMoveTargets = (): [string[], (listId: string) => void] => {
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
  // What is being moved, e.g. "Milk" or "3 items".
  subject: string;
  targets: MoveTarget[];
  recentIds: string[];
  onMove: (listId: string) => void;
  onClose: () => void;
};

// One tap moves the line(s) to the chosen list.
export const MoveToListSheet = ({ visible, subject, targets, recentIds, onMove, onClose }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const needle = query.trim().toLowerCase();
  const recent = useMemo(
    () =>
      needle
        ? []
        : recentIds
            .map((id) => targets.find((target) => target.id === id))
            .filter((target): target is MoveTarget => !!target),
    [needle, recentIds, targets],
  );

  const groups = useMemo(() => {
    const matching = targets.filter(
      (target) =>
        !needle || target.title.toLowerCase().includes(needle) || target.folderLabel.toLowerCase().includes(needle),
    );
    const byFolder = new Map<string, MoveTarget[]>();
    matching.forEach((target) => {
      byFolder.set(target.folderLabel, [...(byFolder.get(target.folderLabel) ?? []), target]);
    });
    return [...byFolder.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folderLabel, lists]) => ({ folderLabel, lists: lists.sort((a, b) => a.title.localeCompare(b.title)) }));
  }, [needle, targets]);

  const row = (target: MoveTarget, showFolder: boolean, icon: React.ReactNode) => (
    <Pressable
      key={`${showFolder ? "recent" : "all"}-${target.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Move to ${target.title}`}
      onPress={() => onMove(target.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {icon}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{target.title}</Text>
        {showFolder && <Text style={styles.rowDetail}>{target.folderLabel}</Text>}
      </View>
    </Pressable>
  );

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            Move {subject}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Cancel</Text>
          </Pressable>
        </View>
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
              {recent.map((target) => row(target, true, <History size={18} color={colors.accentDark} />))}
            </View>
          )}
          {groups.map((group) => (
            <View key={group.folderLabel} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.folderLabel}</Text>
              {group.lists.map((target) => row(target, false, <ListChecks size={18} color={colors.accentDark} />))}
            </View>
          ))}
          {groups.length === 0 && (
            <Text style={styles.empty}>
              {needle ? "No lists match that search." : "Make another list first, then you can move lines to it."}
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
      fontWeight: "900",
    },
    done: {
      color: colors.accentDark,
      fontSize: 16,
      fontWeight: "800",
    },
    search: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 16,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      minHeight: 44,
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
      fontWeight: "800",
      marginBottom: spacing.xs,
      textTransform: "uppercase",
    },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: 6,
      minHeight: 52,
      paddingHorizontal: spacing.md,
    },
    rowPressed: {
      opacity: 0.7,
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "700",
    },
    rowDetail: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 2,
    },
    empty: {
      color: colors.muted,
      paddingVertical: spacing.md,
    },
  });
