import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import { OptionChoiceRow } from "./OptionChoiceRow";

type ChoiceSheetOption<T extends string> = {
  value: T;
  label: string;
  detail?: string;
  tone?: string;
};

type Props<T extends string> = {
  visible: boolean;
  title: string;
  options: ChoiceSheetOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

export const ChoiceSheet = <T extends string>({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: Props<T>) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>

        {options.map((option) => (
          <OptionChoiceRow
            key={option.value}
            label={option.label}
            detail={option.detail}
            tone={option.tone}
            isSelected={selectedValue === option.value}
            onPress={() => {
              onSelect(option.value);
              onClose();
            }}
          />
        ))}
      </ScrollView>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
  },
  close: {
    color: colors.accentDark,
    fontWeight: "800",
  },
});
