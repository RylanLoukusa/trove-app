import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { useEntitlement } from "../entitlements/EntitlementContext";
import { askForReminderPermission, reminderPermission } from "../reminders/notifications";
import { TIP_TEXT, useTips } from "../tips/TipsContext";
import type { ListEntry, RepeatRule, TagOption } from "../types/models";
import { describeDueDate, entryPriority, parseDateKey, quickDueDates, TagSection, toDateKey, withPriority } from "../utils/listView";
import { formatTime, parseTimeInput, quickTimes, REPEAT_RULES, repeatLabels } from "../utils/schedule";
import { ListPerson, personLabel } from "../collaboration/listPeople";
import { formatPrice, formatQuantity, MAX_RATING, normalizeLink, parsePrice, parseQuantity } from "../utils/fields";

type Details = Pick<
  ListEntry,
  | "text"
  | "dueDate"
  | "dueTime"
  | "repeat"
  | "quantity"
  | "price"
  | "rating"
  | "link"
  | "notes"
  | "tagOptionIds"
  | "assigneeId"
  | "assigneeName"
>;

type Props = {
  entry: ListEntry | null;
  priorityOptions: TagOption[];
  // Every tag group with its tags; Priority is shown on its own above.
  tagSections?: TagSection[];
  canEdit: boolean;
  // Set when this line is shown here but belongs to another list.
  sourceListTitle?: string;
  // The line is here because it matches this list's rule.
  fromRule?: boolean;
  // Other lists this line also shows on; tapping one takes it off that list.
  alsoOnLists?: Array<{ id: string; title: string }>;
  onRemoveFromList?: (listId: string) => void;
  // People a line can be given to, on a shared list.
  people?: ListPerson[];
  onSave: (updates: Partial<Details>) => void;
  onDelete: () => void;
  onClose: () => void;
};

// Details for one list line. The due date and notes are always there; the
// rest (repeat, priority, tags, quantity, price, rating, link, who it's for)
// shows once the line has it or it's added with its "+" button.
export const ListEntrySheet = ({
  entry,
  priorityOptions,
  tagSections = [],
  canEdit,
  sourceListTitle,
  fromRule = false,
  alsoOnLists,
  onRemoveFromList,
  people = [],
  onSave,
  onDelete,
  onClose,
}: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPro, presentPaywall } = useEntitlement();
  const tips = useTips();
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [dueDraft, setDueDraft] = useState("");
  const [dueTime, setDueTime] = useState<string | undefined>(undefined);
  const [timeDraft, setTimeDraft] = useState("");
  const [repeat, setRepeat] = useState<RepeatRule | undefined>(undefined);
  const [permissionNote, setPermissionNote] = useState("");
  const [priorityId, setPriorityId] = useState<string | null>(null);
  // The line's tags outside Priority.
  const otherSections = useMemo(() => {
    const priorityIds = new Set(priorityOptions.map((option) => option.id));
    return tagSections.filter((section) => !section.options.some((option) => priorityIds.has(option.id)));
  }, [priorityOptions, tagSections]);
  const otherTagIds = useMemo(
    () => new Set(otherSections.flatMap((section) => section.options.map((option) => option.id))),
    [otherSections],
  );
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [quantityDraft, setQuantityDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [linkDraft, setLinkDraft] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
  // Beyond the due date and notes, a field shows once the line has it or
  // it's added with its "+" button, so a plain line opens short.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [pickingDate, setPickingDate] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setText(entry.text);
    setDueDate(entry.dueDate);
    setDueDraft(entry.dueDate ?? "");
    setDueTime(entry.dueTime);
    setTimeDraft(entry.dueTime ? formatTime(entry.dueTime) : "");
    setRepeat(entry.repeat);
    setPermissionNote("");
    setPriorityId(entryPriority(entry, priorityOptions)?.id ?? null);
    setTagIds(entry.tagOptionIds.filter((id) => otherTagIds.has(id)));
    setNotes(entry.notes ?? "");
    setQuantityDraft(entry.quantity ? formatQuantity(entry.quantity) : "");
    setPriceDraft(entry.price !== undefined ? formatPrice(entry.price) : "");
    setRating(entry.rating);
    setLinkDraft(entry.link ?? "");
    setAssigneeId(entry.assigneeId);
    const filled = new Set<string>();
    if (entry.repeat) filled.add("repeat");
    if (entryPriority(entry, priorityOptions)) filled.add("priority");
    if (entry.assigneeId) filled.add("assignee");
    otherSections.forEach((section) => {
      if (section.options.some((option) => entry.tagOptionIds.includes(option.id))) filled.add(`tag:${section.group.id}`);
    });
    if (entry.quantity) filled.add("quantity");
    if (entry.price !== undefined) filled.add("price");
    if (entry.rating) filled.add("rating");
    if (entry.link) filled.add("link");
    setOpened(filled);
    setPickingDate(false);
    // Only reset when a different entry opens, not on every background sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const quickDates = useMemo(() => quickDueDates(), [entry?.id]);
  const extras: Array<{ key: string; label: string; a11y?: string }> = [
    ...(isCheckEntry(entry) ? [{ key: "repeat", label: "Repeat" }] : []),
    ...(priorityOptions.length > 0 ? [{ key: "priority", label: "Priority" }] : []),
    ...(people.length > 0 || entry?.assigneeId ? [{ key: "assignee", label: "Assign", a11y: "Assign to someone" }] : []),
    ...otherSections.map((section) => ({ key: `tag:${section.group.id}`, label: section.group.name })),
    { key: "quantity", label: "Quantity" },
    { key: "price", label: "Price" },
    { key: "rating", label: "Rating" },
    { key: "link", label: "Link" },
  ];
  const shows = (key: string) => opened.has(key);
  const open = (key: string) => setOpened((current) => new Set(current).add(key));
  const unopened = extras.filter((extra) => !opened.has(extra.key));
  // The typed date shows for a date that isn't one of the quick ones.
  const showDateInput = pickingDate || (!!dueDate && !quickDates.some((quick) => quick.value === dueDate));
  const dueDraftInvalid = dueDraft.trim() !== "" && !parseDateKey(dueDraft);
  const dueDescription = dueDate ? describeDueDate(dueDate) : null;
  const timeDraftInvalid = timeDraft.trim() !== "" && !parseTimeInput(timeDraft) && timeDraft !== formatTime(dueTime ?? "");
  const isCheck = entry?.kind === "check";
  const quantityInvalid = quantityDraft.trim() !== "" && parseQuantity(quantityDraft) === null;
  const priceInvalid = priceDraft.trim() !== "" && parsePrice(priceDraft) === null;
  const linkInvalid = linkDraft.trim() !== "" && normalizeLink(linkDraft) === null;

  // The paywall opens once this sheet has slid away.
  const seePro = () => {
    close();
    setTimeout(() => presentPaywall("reminders"), 400);
  };

  const close = () => {
    if (entry && canEdit) {
      const updates: Partial<Details> = {};
      const trimmed = text.trim();
      if (trimmed && trimmed !== entry.text) updates.text = trimmed;
      if (dueDate !== entry.dueDate) updates.dueDate = dueDate;
      // A time only means something on a day.
      const nextTime = dueDate ? dueTime : undefined;
      if (nextTime !== entry.dueTime) updates.dueTime = nextTime;
      const nextRepeat = isCheck ? repeat : undefined;
      if (nextRepeat !== entry.repeat) updates.repeat = nextRepeat;
      // A field left blank is cleared; one that can't be read keeps its value.
      const nextQuantity = quantityDraft.trim() ? parseQuantity(quantityDraft) ?? entry.quantity : undefined;
      if (nextQuantity !== entry.quantity) updates.quantity = nextQuantity;
      const nextPrice = priceDraft.trim() ? parsePrice(priceDraft) ?? entry.price : undefined;
      if (nextPrice !== entry.price) updates.price = nextPrice;
      if (rating !== entry.rating) updates.rating = rating;
      const nextLink = linkDraft.trim() ? normalizeLink(linkDraft) ?? entry.link : undefined;
      if (nextLink !== entry.link) updates.link = nextLink;
      if (assigneeId !== entry.assigneeId) {
        updates.assigneeId = assigneeId;
        updates.assigneeName = people.find((person) => person.id === assigneeId)?.name;
      }
      const nextNotes = notes.trim() || undefined;
      if (nextNotes !== entry.notes) updates.notes = nextNotes;
      const nextTags = [
        ...withPriority(entry.tagOptionIds, priorityOptions, priorityId).filter((id) => !otherTagIds.has(id)),
        ...tagIds,
      ];
      const sameTags = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      if (!sameTags(nextTags, entry.tagOptionIds)) updates.tagOptionIds = nextTags;
      if (Object.keys(updates).length > 0) onSave(updates);
    }
    onClose();
  };

  // A group that takes one tag swaps it; one that takes several adds it.
  const toggleTag = ({ group, options }: TagSection, optionId: string) =>
    setTagIds((current) => {
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      if (group.selectionMode !== "single") return [...current, optionId];
      const inGroup = new Set(options.map((option) => option.id));
      return [...current.filter((id) => !inGroup.has(id)), optionId];
    });

  const setDue = (value: string | undefined) => {
    setDueDate(value);
    setDueDraft(value ?? "");
  };

  // The first time a line gets a time, the phone asks whether Trove may
  // send reminders.
  const setTime = (value: string | undefined) => {
    setDueTime(value);
    setTimeDraft(value ? formatTime(value) : "");
    // Reminders are part of Pro: on the free plan a time is kept and shown,
    // but nothing is scheduled, so there's nothing to ask permission for.
    if (!value || !isPro) return;
    const ask = () =>
      void askForReminderPermission().then((permission) => {
        setPermissionNote(
          permission === "denied" ? "Reminders are off for Trove. Turn on notifications in your phone's Settings." : "",
        );
      });
    // Before the phone's own question, a sentence on why Trove asks.
    void reminderPermission().then((permission) => {
      if (permission !== "undetermined" || tips.hasSeen("reminders")) {
        ask();
        return;
      }
      tips.dismiss("reminders");
      Alert.alert("Get reminded on time", `${TIP_TEXT.reminders} Allow notifications on the next screen to get them.`, [
        { text: "Not now", style: "cancel" },
        { text: "Continue", onPress: ask },
      ]);
    });
  };

  // A repeating line needs a day to repeat from.
  const setRepeatRule = (value: RepeatRule | undefined) => {
    setRepeat(value);
    if (value && !dueDate) setDue(toDateKey(new Date()));
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
          {!showDateInput && canEdit && (
            <Chip label="Pick a date…" selected={false} disabled={!canEdit} onPress={() => setPickingDate(true)} styles={styles} />
          )}
          {!!dueDate && <Chip label="Clear" selected={false} disabled={!canEdit} onPress={() => setDue(undefined)} styles={styles} />}
        </View>
        {showDateInput && (
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
        )}
        <Text style={[styles.hint, dueDraftInvalid && styles.hintError]}>
          {dueDraftInvalid ? "Use a date like 2026-12-01." : dueDescription ? `Due ${dueDescription.label.toLowerCase()}` : "No due date"}
        </Text>

        {!!dueDate && (
          <>
            <Text style={styles.label}>Time</Text>
            <View style={styles.chipRow}>
              {quickTimes.map((time) => (
                <Chip
                  key={time}
                  label={formatTime(time)}
                  selected={dueTime === time}
                  disabled={!canEdit}
                  onPress={() => setTime(dueTime === time ? undefined : time)}
                  styles={styles}
                />
              ))}
              {!!dueTime && (
                <Chip label="No time" selected={false} disabled={!canEdit} onPress={() => setTime(undefined)} styles={styles} />
              )}
            </View>
            <TextInput
              accessibilityLabel="Time"
              editable={canEdit}
              value={timeDraft}
              onChangeText={(value) => {
                setTimeDraft(value);
                if (!value.trim()) setDueTime(undefined);
                else {
                  const parsed = parseTimeInput(value);
                  if (parsed) setDueTime(parsed);
                }
              }}
              onEndEditing={() => {
                const parsed = parseTimeInput(timeDraft);
                if (parsed) setTime(parsed);
              }}
              placeholder="e.g. 7:30 pm"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, timeDraftInvalid && styles.inputInvalid]}
            />
            {isPro || timeDraftInvalid ? (
              <Text style={[styles.hint, (timeDraftInvalid || !!permissionNote) && styles.hintError]}>
                {timeDraftInvalid
                  ? "Use a time like 9:30 or 7 pm."
                  : permissionNote || (dueTime ? `Reminds you at ${formatTime(dueTime)}` : "Add a time to get a reminder")}
              </Text>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Reminders come with Trove Pro" onPress={seePro} hitSlop={6}>
                <Text style={styles.hint}>
                  {dueTime ? `Get a reminder at ${formatTime(dueTime)} with Trove Pro. ` : "Reminders at a time come with Trove Pro. "}
                  <Text style={styles.proLink}>See Pro</Text>
                </Text>
              </Pressable>
            )}
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

        {isCheck && shows("repeat") && (
          <>
            <Text style={styles.label}>Repeat</Text>
            <View style={styles.chipRow}>
              {REPEAT_RULES.map((rule) => (
                <Chip
                  key={rule}
                  label={repeatLabels[rule]}
                  accessibilityLabel={`Repeat: ${repeatLabels[rule]}`}
                  selected={repeat === rule}
                  disabled={!canEdit}
                  onPress={() => setRepeatRule(repeat === rule ? undefined : rule)}
                  styles={styles}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              {repeat ? "Checking it off moves it to the next date." : "Doesn't repeat"}
            </Text>
          </>
        )}

        {priorityOptions.length > 0 && shows("priority") && (
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

        {(people.length > 0 || !!entry?.assigneeId) && shows("assignee") && (
          <>
            <Text style={styles.label}>Assigned to</Text>
            <View style={styles.chipRow}>
              {people.map((person) => (
                <Chip
                  key={person.id}
                  label={personLabel(person)}
                  accessibilityLabel={`Assign to ${personLabel(person)}`}
                  selected={assigneeId === person.id}
                  disabled={!canEdit}
                  onPress={() => setAssigneeId(assigneeId === person.id ? undefined : person.id)}
                  styles={styles}
                />
              ))}
              {/* Someone who no longer has the list keeps the line until it is given to someone else. */}
              {!!entry?.assigneeId && !people.some((person) => person.id === entry.assigneeId) && assigneeId === entry.assigneeId && (
                <Chip
                  label={entry.assigneeName ?? "Someone"}
                  selected
                  disabled={!canEdit}
                  onPress={() => setAssigneeId(undefined)}
                  styles={styles}
                />
              )}
            </View>
          </>
        )}

        {otherSections.filter((section) => shows(`tag:${section.group.id}`)).map((section) => (
          <React.Fragment key={section.group.id}>
            <Text style={styles.label}>{section.group.name}</Text>
            <View style={styles.chipRow}>
              {section.options.map((option) => (
                <Chip
                  key={option.id}
                  label={option.name}
                  accessibilityLabel={`${section.group.name}: ${option.name}`}
                  tone={option.color}
                  selected={tagIds.includes(option.id)}
                  disabled={!canEdit}
                  onPress={() => toggleTag(section, option.id)}
                  styles={styles}
                />
              ))}
            </View>
          </React.Fragment>
        ))}

        {shows("quantity") && (
          <>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              accessibilityLabel="Quantity"
              editable={canEdit}
              value={quantityDraft}
              onChangeText={setQuantityDraft}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={colors.muted}
              style={[styles.input, quantityInvalid && styles.inputInvalid]}
            />
            {quantityInvalid && <Text style={[styles.hint, styles.hintError]}>Use a number like 2 or 1.5.</Text>}
          </>
        )}
        {shows("price") && (
          <>
            <Text style={styles.label}>Price</Text>
            <TextInput
              accessibilityLabel="Price"
              editable={canEdit}
              value={priceDraft}
              onChangeText={setPriceDraft}
              onBlur={() => {
                const parsed = parsePrice(priceDraft);
                if (parsed !== null) setPriceDraft(formatPrice(parsed));
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              style={[styles.input, priceInvalid && styles.inputInvalid]}
            />
            {priceInvalid && <Text style={[styles.hint, styles.hintError]}>Use a price like 4.99.</Text>}
          </>
        )}
        {shows("rating") && (
          <>
            <Text style={styles.label}>Rating</Text>
            <View style={styles.stars}>
              {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}
                  accessibilityState={{ selected: (rating ?? 0) >= value, disabled: !canEdit }}
                  disabled={!canEdit}
                  hitSlop={4}
                  // Tapping the rating it already has clears it.
                  onPress={() => setRating(rating === value ? undefined : value)}
                >
                  <Text style={[styles.star, (rating ?? 0) >= value && styles.starOn]}>{(rating ?? 0) >= value ? "★" : "☆"}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {shows("link") && (
          <>
            <Text style={styles.label}>Link</Text>
            <TextInput
              accessibilityLabel="Link"
              editable={canEdit}
              value={linkDraft}
              onChangeText={setLinkDraft}
              placeholder="example.com/item"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, linkInvalid && styles.inputInvalid]}
            />
            {linkInvalid && <Text style={[styles.hint, styles.hintError]}>Use a web address like example.com.</Text>}
          </>
        )}

        {canEdit && unopened.length > 0 && (
          <>
            <Text style={styles.label}>Add more</Text>
            <View style={styles.chipRow}>
              {unopened.map((extra) => (
                <Pressable
                  key={extra.key}
                  accessibilityRole="button"
                  accessibilityLabel={extra.a11y ?? `Add ${extra.label}`}
                  onPress={() => open(extra.key)}
                  style={({ pressed }) => [styles.addChip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.addChipText}>+ {extra.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}


        {!!alsoOnLists?.length && (
          <>
            <Text style={styles.label}>Also on</Text>
            <View style={styles.chipRow}>
              {alsoOnLists.map((list) => (
                <Chip
                  key={list.id}
                  label={list.title}
                  // A list can share its name with a chip above, such as Today.
                  accessibilityLabel={`Take off ${list.title}`}
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

const isCheckEntry = (entry: ListEntry | null) => entry?.kind === "check";

const Chip = ({
  label,
  accessibilityLabel,
  selected,
  disabled,
  tone,
  onPress,
  styles,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  disabled: boolean;
  tone?: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
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
    addChip: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 999,
      borderStyle: "dashed",
      borderWidth: 1.5,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: 14,
    },
    addChipText: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "700",
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
    proLink: {
      color: colors.accentDark,
      fontWeight: "600",
    },
    hintError: {
      color: colors.danger,
    },
    fieldRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    field: {
      flex: 1,
    },
    fieldLabel: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: spacing.sm,
    },
    fieldInput: {
      marginTop: 4,
    },
    stars: {
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: 4,
    },
    star: {
      color: colors.muted,
      fontSize: 28,
    },
    starOn: {
      color: colors.accent,
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
