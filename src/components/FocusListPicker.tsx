import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarDays, Plus } from "lucide-react-native";

import { spacing, ThemeColors, withAlpha } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { ListEntry } from "../types/models";
import { describeDueDate } from "../utils/listView";
import { CheckMark } from "./ListMarks";

export type FocusPickerList = { id: string; title: string; entries: ListEntry[] };

type Props = {
  visible: boolean;
  focusListTitle: string;
  lists: FocusPickerList[];
  // Ids of the lines already in the focus list.
  selectedEntryIds: Set<string>;
  onToggle: (entry: ListEntry) => void;
  onClose: () => void;
};

// Picks lines from other lists to put in a focus list. Each tap adds or
// removes one line right away; the lines themselves stay in their lists.
export const FocusListPicker = ({ visible, focusListTitle, lists, selectedEntryIds, onToggle, onClose }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return lists
      .map((list) => {
        const titleMatches = !!needle && list.title.toLowerCase().includes(needle);
        const entries = list.entries.filter((entry) => {
          // Done lines are only listed when they're already in the focus list.
          if (entry.checked && !selectedEntryIds.has(entry.id)) return false;
          if (!entry.text.trim()) return false;
          return !needle || titleMatches || entry.text.toLowerCase().includes(needle);
        });
        return { ...list, entries };
      })
      .filter((list) => list.entries.length > 0);
  }, [lists, query, selectedEntryIds]);

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            Add to {focusListTitle}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Search your lists"
          value={query}
          onChangeText={setQuery}
          placeholder="Search your lists"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={styles.search}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {sections.map((list) => (
            <View key={list.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{list.title}</Text>
              <View style={styles.group}>
                {list.entries.map((entry, index) => {
                  const selected = selectedEntryIds.has(entry.id);
                  const due = entry.dueDate ? describeDueDate(entry.dueDate) : null;
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${entry.text}, from ${list.title}`}
                      onPress={() => onToggle(entry)}
                      style={({ pressed }) => [styles.row, index > 0 && styles.rowDivided, pressed && styles.rowPressed]}
                    >
                      <View style={styles.marker}>
                        {selected ? <CheckMark checked colors={colors} /> : <Plus size={20} color={colors.muted} />}
                      </View>
                      <View style={styles.rowText}>
                        <Text style={[styles.text, entry.bold && styles.textBold, entry.checked && styles.textDone]}>
                          {entry.text}
                        </Text>
                        {!!due && (
                          <View style={styles.meta}>
                            <CalendarDays size={12} color={colors.muted} />
                            <Text style={styles.metaText}>{due.label}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {sections.length === 0 && (
            <Text style={styles.empty}>
              {query.trim() ? "No lines match that search." : "Your other lists have nothing left to do."}
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
      fontWeight: "700",
    },
    search: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 15,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
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
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
      marginBottom: spacing.xs,
      textTransform: "uppercase",
    },
    group: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    rowDivided: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowPressed: {
      backgroundColor: withAlpha(colors.border, 0.5),
    },
    marker: {
      alignItems: "center",
      width: 28,
    },
    rowText: {
      flex: 1,
    },
    text: {
      color: colors.ink,
      fontSize: 16,
    },
    textBold: {
      fontWeight: "700",
    },
    textDone: {
      color: colors.muted,
    },
    meta: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      marginTop: 2,
    },
    metaText: {
      color: colors.muted,
      fontSize: 12,
    },
    empty: {
      color: colors.muted,
      fontSize: 15,
      marginTop: spacing.lg,
      textAlign: "center",
    },
  });
