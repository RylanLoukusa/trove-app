import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { ListEntry, TagOption } from "../types/models";
import { describeDueDate, entryPriority, parseDateKey, quickDueDates, withPriority } from "../utils/listView";

type Props = {
  entry: ListEntry | null;
  priorityOptions: TagOption[];
  canEdit: boolean;
  // Set when this line is shown here but belongs to another list.
  sourceListTitle?: string;
  // The line is here because it matches this list's rule.
  fromRule?: boolean;
  // Other lists this line also shows on; tapping one takes it off that list.
  alsoOnLists?: Array<{ id: string; title: string }>;
  onRemoveFromList?: (listId: string) => void;
  onSave: (updates: Partial<Pick<ListEntry, "text" | "dueDate" | "notes" | "tagOptionIds">>) => void;
  onDelete: () => void;
  onClose: () => void;
};

// Details for one list line: due date, priority and notes.
export const ListEntrySheet = ({
  entry,
  priorityOptions,
  canEdit,
  sourceListTitle,
  fromRule = false,
  alsoOnLists,
  onRemoveFromList,
  onSave,
  onDelete,
  onClose,
}: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [dueDraft, setDueDraft] = useState("");
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!entry) return;
    setText(entry.text);
    setDueDate(entry.dueDate);
    setDueDraft(entry.dueDate ?? "");
    setPriorityId(entryPriority(entry, priorityOptions)?.id ?? null);
    setNotes(entry.notes ?? "");
    // Only reset when a different entry opens, not on every background sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const quickDates = useMemo(() => quickDueDates(), [entry?.id]);
  const dueDraftInvalid = dueDraft.trim() !== "" && !parseDateKey(dueDraft);
  const dueDescription = dueDate ? describeDueDate(dueDate) : null;

  const close = () => {
    if (entry && canEdit) {
      const updates: Partial<Pick<ListEntry, "text" | "dueDate" | "notes" | "tagOptionIds">> = {};
      const trimmed = text.trim();
      if (trimmed && trimmed !== entry.text) updates.text = trimmed;
      if (dueDate !== entry.dueDate) updates.dueDate = dueDate;
      const nextNotes = notes.trim() || undefined;
      if (nextNotes !== entry.notes) updates.notes = nextNotes;
      const nextTags = withPriority(entry.tagOptionIds, priorityOptions, priorityId);
      if (JSON.stringify(nextTags) !== JSON.stringify(entry.tagOptionIds)) updates.tagOptionIds = nextTags;
      if (Object.keys(updates).length > 0) onSave(updates);
    }
    onClose();
  };

  const setDue = (value: string | undefined) => {
    setDueDate(value);
    setDueDraft(value ?? "");
  };

  return (
    <Modal animationType="slide" visible={!!entry} presentationStyle="pageSheet" onRequestClose={close}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{canEdit ? "Line details" : "Line"}</Text>
          <Pressable accessibilityRole="button" onPress={close} hitSlop={8}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        {!!sourceListTitle && (
          <Text style={styles.sourceNote}>
            From {sourceListTitle}. Changes here show up there too.
            {fromRule ? " It's here because it matches this list's rule." : ""}
          </Text>
        )}

        <TextInput
          accessibilityLabel="Line text"
          editable={canEdit}
          value={text}
          onChangeText={setText}
          multiline
          style={styles.textInput}
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Due date</Text>
        <View style={styles.chipRow}>
          {quickDates.map((quick) => (
            <Chip
              key={quick.key}
              label={quick.label}
              selected={dueDate === quick.value}
              disabled={!canEdit}
              onPress={() => setDue(dueDate === quick.value ? undefined : quick.value)}
              styles={styles}
            />
          ))}
          {!!dueDate && <Chip label="Clear" selected={false} disabled={!canEdit} onPress={() => setDue(undefined)} styles={styles} />}
        </View>
        <TextInput
          accessibilityLabel="Due date, as year-month-day"
          editable={canEdit}
          value={dueDraft}
          onChangeText={(value) => {
            setDueDraft(value);
            if (!value.trim()) setDueDate(undefined);
            else if (parseDateKey(value)) setDueDate(value.trim());
          }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, dueDraftInvalid && styles.inputInvalid]}
        />
        <Text style={[styles.hint, dueDraftInvalid && styles.hintError]}>
          {dueDraftInvalid ? "Use a date like 2026-12-01." : dueDescription ? `Due ${dueDescription.label.toLowerCase()}` : "No due date"}
        </Text>

        {priorityOptions.length > 0 && (
          <>
            <Text style={styles.label}>Priority</Text>
            <View style={styles.chipRow}>
              {[...priorityOptions].reverse().map((option) => (
                <Chip
                  key={option.id}
                  label={option.name}
                  tone={option.color}
                  selected={priorityId === option.id}
                  disabled={!canEdit}
                  onPress={() => setPriorityId(priorityId === option.id ? null : option.id)}
                  styles={styles}
                />
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Notes</Text>
        <TextInput
          accessibilityLabel="Notes"
          editable={canEdit}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Add details"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.notes]}
        />

        {!!alsoOnLists?.length && (
          <>
            <Text style={styles.label}>Also on</Text>
            <View style={styles.chipRow}>
              {alsoOnLists.map((list) => (
                <Chip
                  key={list.id}
                  label={list.title}
                  selected
                  disabled={!canEdit}
                  onPress={() => onRemoveFromList?.(list.id)}
                  styles={styles}
                />
              ))}
            </View>
            <Text style={styles.hint}>Tap a list to take this line off it.</Text>
          </>
        )}

        {canEdit && !fromRule && (
          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
          >
            <Text style={styles.deleteText}>{sourceListTitle ? "Remove from this list" : "Delete line"}</Text>
          </Pressable>
        )}
      </ScrollView>
    </Modal>
  );
};

const Chip = ({
  label,
  selected,
  disabled,
  tone,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  tone?: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.chipPressed]}
  >
    {!!tone && <View style={[styles.chipDot, { backgroundColor: tone }]} />}
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </Pressable>
);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "900",
    },
    done: {
      color: colors.accentDark,
      fontSize: 16,
      fontWeight: "800",
    },
    sourceNote: {
      color: colors.muted,
      fontSize: 13,
      marginBottom: spacing.sm,
    },
    textInput: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 17,
      minHeight: 52,
      padding: spacing.sm,
    },
    label: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
      marginBottom: spacing.xs,
      marginTop: spacing.lg,
      textTransform: "uppercase",
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    chip: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
    },
    chipSelected: {
      backgroundColor: colors.buttonPrimaryBg,
      borderColor: colors.buttonPrimaryBg,
    },
    chipPressed: {
      opacity: 0.7,
    },
    chipDot: {
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    chipText: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "700",
    },
    chipTextSelected: {
      color: colors.onAccent,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 15,
      marginTop: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
    },
    inputInvalid: {
      borderColor: colors.danger,
    },
    hint: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 4,
    },
    hintError: {
      color: colors.danger,
    },
    notes: {
      minHeight: 96,
      paddingTop: spacing.sm,
      textAlignVertical: "top",
    },
    deleteButton: {
      alignItems: "center",
      borderColor: colors.danger,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: spacing.xl,
      minHeight: 48,
      justifyContent: "center",
    },
    deletePressed: {
      opacity: 0.7,
    },
    deleteText: {
      color: colors.danger,
      fontSize: 15,
      fontWeight: "800",
    },
  });
