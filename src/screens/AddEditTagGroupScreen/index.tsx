import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";
import { AppButton } from "../../components/AppButton";
import { OptionChoiceRow } from "../../components/OptionChoiceRow";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { TagColorPickerSheet } from "../../components/TagColorPickerSheet";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { TagGroupSelectionMode, TagOption } from "../../types/models";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "AddEditTagGroup">;
type ScreenStyles = ReturnType<typeof createStyles>;

const selectionModeChoices: Record<TagGroupSelectionMode, { label: string; detail: string }> = {
  single: { label: "Single-select", detail: "Only one option can be selected at a time" },
  multi: { label: "Multi-select", detail: "Multiple options can be selected at once" },
};

const inlineCreateChoices: Record<"true" | "false", { label: string; detail: string }> = {
  true: { label: "Allowed", detail: "New options can be typed in while tagging an item" },
  false: { label: "Managed here only", detail: "New options can only be added on this screen" },
};

type TagOptionRowProps = {
  option: TagOption;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChangeName: (name: string) => void;
  onPressColor: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  colors: ReturnType<typeof useThemeColors>;
  styles: ScreenStyles;
};

const TagOptionRow = React.memo(function TagOptionRow({
  option,
  canMoveUp,
  canMoveDown,
  onChangeName,
  onPressColor,
  onMoveUp,
  onMoveDown,
  onRemove,
  colors,
  styles,
}: TagOptionRowProps) {
  return (
    <View style={styles.optionRow}>
      <Pressable
        accessibilityLabel={option.color ? `Change color for ${option.name}` : `Set color for ${option.name}`}
        onPress={onPressColor}
        style={[styles.colorSwatch, option.color ? { backgroundColor: option.color } : styles.colorSwatchEmpty]}
      />
      <TextInput style={styles.optionInput} value={option.name} onChangeText={onChangeName} placeholder="Option name" />
      <View style={styles.reorderColumn}>
        <Pressable
          accessibilityLabel={`Move ${option.name} up`}
          disabled={!canMoveUp}
          onPress={onMoveUp}
          hitSlop={8}
          style={styles.reorderButton}
        >
          <ChevronUp size={16} color={canMoveUp ? colors.accentDark : colors.border} />
        </Pressable>
        <Pressable
          accessibilityLabel={`Move ${option.name} down`}
          disabled={!canMoveDown}
          onPress={onMoveDown}
          hitSlop={8}
          style={styles.reorderButton}
        >
          <ChevronDown size={16} color={canMoveDown ? colors.accentDark : colors.border} />
        </Pressable>
      </View>
      <Pressable accessibilityLabel={`Delete ${option.name}`} onPress={onRemove} hitSlop={8} style={styles.deleteButton}>
        <Trash2 size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
});

export const AddEditTagGroupScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { tagGroups, tagOptions, updateTagGroup, deleteTagGroup, createTagOption, updateTagOption, deleteTagOption } = useTrove();
  const group = tagGroups.find((candidate) => candidate.id === route.params.groupId);

  const [isSelectionModePickerOpen, setIsSelectionModePickerOpen] = useState(false);
  const [isInlineCreatePickerOpen, setIsInlineCreatePickerOpen] = useState(false);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);

  const sortedOptions = useMemo(
    () => tagOptions.filter((option) => option.groupId === route.params.groupId).sort((a, b) => a.sortOrder - b.sortOrder),
    [tagOptions, route.params.groupId],
  );

  const onAddOption = useCallback(() => {
    if (!group) return;
    createTagOption({ groupId: group.id, name: "New option", sortOrder: sortedOptions.length });
  }, [createTagOption, group, sortedOptions.length]);

  const moveOption = useCallback(
    (optionId: string, direction: -1 | 1) => {
      const index = sortedOptions.findIndex((option) => option.id === optionId);
      const swapIndex = index + direction;
      if (index === -1 || swapIndex < 0 || swapIndex >= sortedOptions.length) return;

      const current = sortedOptions[index];
      const swap = sortedOptions[swapIndex];
      updateTagOption(current.id, { sortOrder: swap.sortOrder });
      updateTagOption(swap.id, { sortOrder: current.sortOrder });
    },
    [sortedOptions, updateTagOption],
  );

  const confirmRemoveOption = useCallback(
    (option: TagOption) => {
      Alert.alert("Delete this option?", `“${option.name}” will be removed from every item it's assigned to.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteTagOption(option.id) },
      ]);
    },
    [deleteTagOption],
  );

  const confirmDeleteGroup = useCallback(() => {
    if (!group) return;
    Alert.alert(
      "Delete this group?",
      `“${group.name}” and all of its options will be removed, and unassigned from every item.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteTagGroup(group.id);
            navigation.goBack();
          },
        },
      ],
    );
  }, [deleteTagGroup, group, navigation]);

  if (!group) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <Text style={styles.notFoundText}>Tag group not found</Text>
        </View>
      </View>
    );
  }

  const colorPickerOption = colorPickerOptionId ? sortedOptions.find((option) => option.id === colorPickerOptionId) : undefined;
  const selectedSelectionModeOption = selectionModeChoices[group.selectionMode];
  const selectedInlineCreateOption = inlineCreateChoices[group.allowInlineCreate ? "true" : "false"];

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Edit group</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={group.name}
          onChangeText={(name) => updateTagGroup(group.id, { name })}
          placeholder="Group name"
        />

        <Text style={styles.section}>Selection mode</Text>
        {isSelectionModePickerOpen ? (
          (Object.keys(selectionModeChoices) as TagGroupSelectionMode[]).map((mode) => {
            const option = selectionModeChoices[mode];
            return (
              <OptionChoiceRow
                key={mode}
                label={option.label}
                detail={option.detail}
                isSelected={group.selectionMode === mode}
                onPress={() => {
                  updateTagGroup(group.id, { selectionMode: mode });
                  setIsSelectionModePickerOpen(false);
                }}
              />
            );
          })
        ) : (
          <OptionChoiceRow
            label={selectedSelectionModeOption.label}
            detail={`${selectedSelectionModeOption.detail} · Tap to change`}
            isSelected
            onPress={() => setIsSelectionModePickerOpen(true)}
          />
        )}

        <Text style={styles.section}>Adding new options</Text>
        {isInlineCreatePickerOpen ? (
          (["true", "false"] as const).map((value) => {
            const option = inlineCreateChoices[value];
            return (
              <OptionChoiceRow
                key={value}
                label={option.label}
                detail={option.detail}
                isSelected={group.allowInlineCreate === (value === "true")}
                onPress={() => {
                  updateTagGroup(group.id, { allowInlineCreate: value === "true" });
                  setIsInlineCreatePickerOpen(false);
                }}
              />
            );
          })
        ) : (
          <OptionChoiceRow
            label={selectedInlineCreateOption.label}
            detail={`${selectedInlineCreateOption.detail} · Tap to change`}
            isSelected
            onPress={() => setIsInlineCreatePickerOpen(true)}
          />
        )}

        <Text style={styles.section}>Options</Text>
        {sortedOptions.map((option, index) => (
          <TagOptionRow
            key={option.id}
            option={option}
            canMoveUp={index > 0}
            canMoveDown={index < sortedOptions.length - 1}
            onChangeName={(name) => updateTagOption(option.id, { name })}
            onPressColor={() => setColorPickerOptionId(option.id)}
            onMoveUp={() => moveOption(option.id, -1)}
            onMoveDown={() => moveOption(option.id, 1)}
            onRemove={() => confirmRemoveOption(option)}
            colors={colors}
            styles={styles}
          />
        ))}
        <AppButton label="Add option" variant="secondary" onPress={onAddOption} style={styles.addOptionButton} />

        <AppButton label="Delete group" variant="danger" onPress={confirmDeleteGroup} style={styles.deleteGroupButton} />
      </ScrollView>

      <TagColorPickerSheet
        visible={colorPickerOptionId !== null}
        selectedColor={colorPickerOption?.color}
        onSelect={(color) => {
          if (colorPickerOptionId) updateTagOption(colorPickerOptionId, { color });
        }}
        onClose={() => setColorPickerOptionId(null)}
      />
    </View>
  );
};
