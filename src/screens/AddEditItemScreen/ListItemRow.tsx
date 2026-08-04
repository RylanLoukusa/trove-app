import React, { useMemo } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { GripVertical, ListIndentDecrease, ListIndentIncrease, Trash2 } from "lucide-react-native";
import { ThemeColors } from "../../theme/theme";
import { SavedListItem } from "../../types/models";
import { bulletGlyphForIndent } from "../../utils/itemTypes";
import { createStyles } from "./styles";

export const LIST_ROW_HEIGHT = 54;

type Props = {
  listItem: SavedListItem;
  indentMarginLeft: number;
  isDragging: boolean;
  isDragActive: boolean;
  shiftDirection: -1 | 0 | 1;
  canIndent: boolean;
  canOutdent: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  registerInputRef: (el: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onToggleChecked: () => void;
  onSubmitEditing: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragUpdate: (translationY: number) => void;
  onDragEnd: () => void;
};

export const ListItemRow = ({
  listItem,
  indentMarginLeft,
  isDragging,
  isDragActive,
  shiftDirection,
  canIndent,
  canOutdent,
  colors,
  styles,
  registerInputRef,
  onChangeText,
  onToggleChecked,
  onSubmitEditing,
  onIndent,
  onOutdent,
  onRemove,
  onDragStart,
  onDragUpdate,
  onDragEnd,
}: Props) => {
  const dragTranslateY = useSharedValue(0);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onStart(() => {
          dragTranslateY.value = 0;
          runOnJS(onDragStart)();
        })
        .onUpdate((event) => {
          dragTranslateY.value = event.translationY;
          runOnJS(onDragUpdate)(event.translationY);
        })
        .onEnd(() => {
          // Reset instantly (no easing): the reordered array snaps every row to its
          // final flex position the moment the drag ends, so an animated reset here
          // would double up with that snap and briefly overshoot before settling.
          dragTranslateY.value = 0;
          runOnJS(onDragEnd)();
        }),
    [dragTranslateY, onDragEnd, onDragStart, onDragUpdate],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (isDragging) {
      return { transform: [{ translateY: dragTranslateY.value }], zIndex: 10, opacity: 0.92 };
    }
    if (isDragActive) {
      return { transform: [{ translateY: withTiming(shiftDirection * LIST_ROW_HEIGHT) }], zIndex: 0, opacity: 1 };
    }
    return { transform: [{ translateY: 0 }], zIndex: 0, opacity: 1 };
  }, [isDragging, isDragActive, shiftDirection]);

  return (
    <Animated.View style={[styles.listRow, animatedStyle]}>
      <GestureDetector gesture={dragGesture}>
        <View style={styles.listDragHandle}>
          <GripVertical size={16} color={colors.muted} />
        </View>
      </GestureDetector>

      <View style={[styles.listRowContent, { marginLeft: indentMarginLeft }]}>
        {listItem.kind === "check" ? (
          <Pressable onPress={onToggleChecked} style={styles.listMarker}>
            <Text style={styles.listMarkerText}>{listItem.checked ? "☑" : "☐"}</Text>
          </Pressable>
        ) : (
          <View style={styles.listMarker}>
            <Text style={styles.listBulletText}>{bulletGlyphForIndent(listItem.indentLevel)}</Text>
          </View>
        )}
        <TextInput
          ref={registerInputRef}
          style={styles.listInput}
          value={listItem.text}
          onChangeText={onChangeText}
          placeholder={listItem.kind === "check" ? "Checklist item" : "Bullet item"}
          placeholderTextColor={colors.muted}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={onSubmitEditing}
        />
        <Pressable disabled={!canOutdent} onPress={onOutdent} style={styles.listIndentButton}>
          <ListIndentDecrease size={18} color={colors.accentDark} opacity={canOutdent ? 1 : 0.35} />
        </Pressable>
        <Pressable disabled={!canIndent} onPress={onIndent} style={styles.listIndentButton}>
          <ListIndentIncrease size={18} color={colors.accentDark} opacity={canIndent ? 1 : 0.35} />
        </Pressable>
        <Pressable onPress={onRemove} style={styles.listIndentButton}>
          <Trash2 size={18} color={colors.danger} />
        </Pressable>
      </View>
    </Animated.View>
  );
};
