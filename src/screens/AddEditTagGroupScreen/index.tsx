import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";
import { AppButton } from "../../components/AppButton";
import { OptionChoiceRow } from "../../components/OptionChoiceRow";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { TagColorPickerSheet } from "../../components/TagColorPickerSheet";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { TagGroupSelectionMode } from "../../types/models";
import { createId } from "../../utils/id";
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

type LocalOption = {
  id: string;
  name: string;
  color?: string;
};

const optionsSignature = (list: LocalOption[]): string =>
  JSON.stringify(list.map((option) => ({ name: option.name.trim(), color: option.color ?? null })));

type TagOptionRowProps = {
  option: LocalOption;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChangeName: (name: string) => void;
  onPressColor: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  registerInputRef: (el: TextInput | null) => void;
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
  registerInputRef,
  colors,
  styles,
}: TagOptionRowProps) {
  const displayName = option.name || "Untitled option";

  return (
    <View style={styles.optionRow}>
      <Pressable
        accessibilityLabel={option.color ? `Change color for ${displayName}` : `Set color for ${displayName}`}
        onPress={onPressColor}
        style={[styles.colorSwatch, option.color ? { backgroundColor: option.color } : styles.colorSwatchEmpty]}
      />
      <TextInput
        ref={registerInputRef}
        style={styles.optionInput}
        value={option.name}
        onChangeText={onChangeName}
        placeholder="Option name"
      />
      <View style={styles.reorderColumn}>
        <Pressable
          accessibilityLabel={`Move ${displayName} up`}
          disabled={!canMoveUp}
          onPress={onMoveUp}
          hitSlop={8}
          style={styles.reorderButton}
        >
          <ChevronUp size={16} color={canMoveUp ? colors.accentDark : colors.border} />
        </Pressable>
        <Pressable
          accessibilityLabel={`Move ${displayName} down`}
          disabled={!canMoveDown}
          onPress={onMoveDown}
          hitSlop={8}
          style={styles.reorderButton}
        >
          <ChevronDown size={16} color={canMoveDown ? colors.accentDark : colors.border} />
        </Pressable>
      </View>
      <Pressable accessibilityLabel={`Delete ${displayName}`} onPress={onRemove} hitSlop={8} style={styles.deleteButton}>
        <Trash2 size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
});

export const AddEditTagGroupScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    tagGroups,
    tagOptions,
    createTagGroup,
    updateTagGroup,
    deleteTagGroup,
    createTagOption,
    updateTagOption,
    deleteTagOption,
  } = useTrove();
  const groupId = route.params?.groupId;
  const isCreating = !groupId;
  const existingGroup = groupId ? tagGroups.find((candidate) => candidate.id === groupId) : undefined;
  const notFound = !isCreating && !existingGroup;

  const [initialSnapshot] = useState(() => ({
    name: existingGroup?.name ?? "",
    selectionMode: existingGroup?.selectionMode ?? ("multi" as TagGroupSelectionMode),
    allowInlineCreate: existingGroup?.allowInlineCreate ?? true,
  }));
  const [initialOptions] = useState<LocalOption[]>(() =>
    tagOptions
      .filter((option) => option.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({ id: option.id, name: option.name, color: option.color })),
  );

  const [name, setName] = useState(initialSnapshot.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<TagGroupSelectionMode>(initialSnapshot.selectionMode);
  const [allowInlineCreate, setAllowInlineCreate] = useState(initialSnapshot.allowInlineCreate);
  const [options, setOptions] = useState<LocalOption[]>(initialOptions);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const optionInputRefs = useRef<Map<string, TextInput>>(new Map());
  const scrollViewRef = useRef<ScrollView>(null);

  const hasUnsavedChanges =
    name.trim() !== initialSnapshot.name ||
    selectionMode !== initialSnapshot.selectionMode ||
    allowInlineCreate !== initialSnapshot.allowInlineCreate ||
    optionsSignature(options) !== optionsSignature(initialOptions);

  const onAddOption = useCallback(() => {
    const newId = createId("tag-option");
    setOptions((current) => [...current, { id: newId, name: "" }]);
    requestAnimationFrame(() => optionInputRefs.current.get(newId)?.focus());
  }, []);

  const updateOptionName = useCallback((optionId: string, value: string) => {
    setOptions((current) => current.map((option) => (option.id === optionId ? { ...option, name: value } : option)));
  }, []);

  const updateOptionColor = useCallback((optionId: string, color: string | undefined) => {
    setOptions((current) => current.map((option) => (option.id === optionId ? { ...option, color } : option)));
  }, []);

  const removeOption = useCallback((optionId: string) => {
    setOptions((current) => current.filter((option) => option.id !== optionId));
  }, []);

  const moveOption = useCallback((index: number, direction: -1 | 1) => {
    setOptions((current) => {
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  }, []);

  const handleSave = useCallback((): boolean => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Name is required.");
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return false;
    }
    setNameError(null);

    const groupIdToUse = existingGroup
      ? existingGroup.id
      : createTagGroup({ name: trimmedName, selectionMode, allowInlineCreate, sortOrder: tagGroups.length }).id;

    if (existingGroup) {
      const groupChanged =
        trimmedName !== existingGroup.name ||
        selectionMode !== existingGroup.selectionMode ||
        allowInlineCreate !== existingGroup.allowInlineCreate;
      if (groupChanged) {
        updateTagGroup(existingGroup.id, { name: trimmedName, selectionMode, allowInlineCreate });
      }
    }

    const initialOptionsById = new Map(initialOptions.map((option, index) => [option.id, { ...option, sortOrder: index }]));

    options.forEach((option, index) => {
      const trimmedOptionName = option.name.trim();
      const original = initialOptionsById.get(option.id);

      if (!original) {
        if (!trimmedOptionName) return;
        createTagOption({ groupId: groupIdToUse, name: trimmedOptionName, color: option.color, sortOrder: index });
        return;
      }

      const optionChanged =
        trimmedOptionName !== original.name || (option.color ?? null) !== (original.color ?? null) || index !== original.sortOrder;
      if (optionChanged) {
        updateTagOption(option.id, { name: trimmedOptionName, color: option.color, sortOrder: index });
      }
    });

    const currentIds = new Set(options.map((option) => option.id));
    initialOptions.forEach((option) => {
      if (!currentIds.has(option.id)) {
        deleteTagOption(option.id);
      }
    });

    return true;
  }, [
    allowInlineCreate,
    createTagGroup,
    createTagOption,
    deleteTagOption,
    existingGroup,
    initialOptions,
    name,
    options,
    selectionMode,
    tagGroups.length,
    updateTagGroup,
    updateTagOption,
  ]);

  const onPressSave = useCallback(() => {
    if (handleSave()) {
      navigation.goBack();
    }
  }, [handleSave, navigation]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      Alert.alert(
        isCreating ? "Save this group?" : "Save changes?",
        isCreating ? "This group hasn't been created yet." : "You have unsaved changes to this tag group.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
          {
            text: isCreating ? "Create" : "Save",
            onPress: () => {
              if (handleSave()) navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
  }, [handleSave, hasUnsavedChanges, isCreating, navigation]);

  const confirmDeleteGroup = useCallback(() => {
    if (!existingGroup) return;
    const displayName = existingGroup.name || "Untitled group";
    Alert.alert(
      "Delete this group?",
      `“${displayName}” and all of its options will be removed, and unassigned from every item.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteTagGroup(existingGroup.id);
            navigation.goBack();
          },
        },
      ],
    );
  }, [deleteTagGroup, existingGroup, navigation]);

  if (notFound) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <Text style={styles.notFoundText}>Tag group not found</Text>
        </View>
      </View>
    );
  }

  const colorPickerOption = colorPickerOptionId ? options.find((option) => option.id === colorPickerOptionId) : undefined;

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.title}>{isCreating ? "Create Group" : "Edit group"}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, nameError && styles.inputError]}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (nameError && value.trim()) setNameError(null);
            }}
            placeholder="Group name"
          />
          {nameError && <Text style={styles.errorText}>{nameError}</Text>}

          <Text style={styles.section}>Selection mode</Text>
          {(Object.keys(selectionModeChoices) as TagGroupSelectionMode[]).map((mode) => {
            const option = selectionModeChoices[mode];
            return (
              <OptionChoiceRow
                key={mode}
                label={option.label}
                detail={option.detail}
                isSelected={selectionMode === mode}
                onPress={() => setSelectionMode(mode)}
              />
            );
          })}

          <Text style={styles.section}>Adding new options</Text>
          {(["true", "false"] as const).map((value) => {
            const option = inlineCreateChoices[value];
            return (
              <OptionChoiceRow
                key={value}
                label={option.label}
                detail={option.detail}
                isSelected={allowInlineCreate === (value === "true")}
                onPress={() => setAllowInlineCreate(value === "true")}
              />
            );
          })}

          <Text style={styles.section}>Options</Text>
          {options.map((option, index) => (
            <TagOptionRow
              key={option.id}
              option={option}
              canMoveUp={index > 0}
              canMoveDown={index < options.length - 1}
              onChangeName={(value) => updateOptionName(option.id, value)}
              onPressColor={() => setColorPickerOptionId(option.id)}
              onMoveUp={() => moveOption(index, -1)}
              onMoveDown={() => moveOption(index, 1)}
              onRemove={() => removeOption(option.id)}
              registerInputRef={(el) => {
                if (el) optionInputRefs.current.set(option.id, el);
                else optionInputRefs.current.delete(option.id);
              }}
              colors={colors}
              styles={styles}
            />
          ))}
          <AppButton label="Add option" variant="secondary" onPress={onAddOption} style={styles.addOptionButton} />

          <AppButton label={isCreating ? "Create Group" : "Save"} onPress={onPressSave} style={styles.saveButton} />

          {!isCreating && (
            <AppButton label="Delete group" variant="danger" onPress={confirmDeleteGroup} style={styles.deleteGroupButton} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <TagColorPickerSheet
        visible={colorPickerOptionId !== null}
        selectedColor={colorPickerOption?.color}
        onSelect={(color) => {
          if (colorPickerOptionId) updateOptionColor(colorPickerOptionId, color);
        }}
        onClose={() => setColorPickerOptionId(null)}
      />
    </View>
  );
};
