import React, { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { AppButton } from "../../components/AppButton";
import { EmptyState } from "../../components/EmptyState";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { TagGroup, TagOption } from "../../types/models";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ManageTags">;
type ScreenStyles = ReturnType<typeof createStyles>;

type TagGroupRowProps = {
  group: TagGroup;
  optionCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPress: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  colors: ReturnType<typeof useThemeColors>;
  styles: ScreenStyles;
};

const TagGroupRow = React.memo(function TagGroupRow({
  group,
  optionCount,
  canMoveUp,
  canMoveDown,
  onPress,
  onMoveUp,
  onMoveDown,
  colors,
  styles,
}: TagGroupRowProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{group.name}</Text>
          {group.isSystem && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Default</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowSubtitle}>
          {group.selectionMode === "single" ? "Single-select" : "Multi-select"} · {optionCount} option{optionCount === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={styles.reorderColumn}>
        <Pressable
          accessibilityLabel={`Move ${group.name} up`}
          disabled={!canMoveUp}
          onPress={onMoveUp}
          hitSlop={8}
          style={styles.reorderButton}
        >
          <ChevronUp size={18} color={canMoveUp ? colors.accentDark : colors.border} />
        </Pressable>
        <Pressable
          accessibilityLabel={`Move ${group.name} down`}
          disabled={!canMoveDown}
          onPress={onMoveDown}
          hitSlop={8}
          style={styles.reorderButton}
        >
          <ChevronDown size={18} color={canMoveDown ? colors.accentDark : colors.border} />
        </Pressable>
      </View>
    </Pressable>
  );
});

export const ManageTagsScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { tagGroups, tagOptions, createTagGroup, updateTagGroup } = useTrove();

  const sortedGroups = useMemo(() => [...tagGroups].sort((a, b) => a.sortOrder - b.sortOrder), [tagGroups]);
  const optionCountByGroupId = useMemo(() => {
    const counts = new Map<string, number>();
    tagOptions.forEach((option: TagOption) => {
      counts.set(option.groupId, (counts.get(option.groupId) ?? 0) + 1);
    });
    return counts;
  }, [tagOptions]);

  const onOpenGroup = useCallback(
    (groupId: string) => {
      navigation.navigate("AddEditTagGroup", { groupId });
    },
    [navigation],
  );

  const onAddGroup = useCallback(() => {
    const group = createTagGroup({ name: "New group", selectionMode: "multi", sortOrder: sortedGroups.length });
    navigation.navigate("AddEditTagGroup", { groupId: group.id });
  }, [createTagGroup, navigation, sortedGroups.length]);

  const moveGroup = useCallback(
    (groupId: string, direction: -1 | 1) => {
      const index = sortedGroups.findIndex((group) => group.id === groupId);
      const swapIndex = index + direction;
      if (index === -1 || swapIndex < 0 || swapIndex >= sortedGroups.length) return;

      const current = sortedGroups[index];
      const swap = sortedGroups[swapIndex];
      updateTagGroup(current.id, { sortOrder: swap.sortOrder });
      updateTagGroup(swap.id, { sortOrder: current.sortOrder });
    },
    [sortedGroups, updateTagGroup],
  );

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Manage Tags</Text>
        <Text style={styles.subtitle}>
          Groups like Status and Priority, and any others you create, live here. Options within a group are what you
          actually assign to items.
        </Text>

        {sortedGroups.length === 0 ? (
          <EmptyState title="No tag groups yet." message="Add a group to start organizing items with custom tags." />
        ) : (
          sortedGroups.map((group, index) => (
            <TagGroupRow
              key={group.id}
              group={group}
              optionCount={optionCountByGroupId.get(group.id) ?? 0}
              canMoveUp={index > 0}
              canMoveDown={index < sortedGroups.length - 1}
              onPress={() => onOpenGroup(group.id)}
              onMoveUp={() => moveGroup(group.id, -1)}
              onMoveDown={() => moveGroup(group.id, 1)}
              colors={colors}
              styles={styles}
            />
          ))
        )}

        <AppButton label="Add group" onPress={onAddGroup} style={styles.addButton} />
      </ScrollView>
    </View>
  );
};
