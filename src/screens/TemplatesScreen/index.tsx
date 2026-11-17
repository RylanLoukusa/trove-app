import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FilePlus2, Pencil, Trash2 } from "lucide-react-native";

import { MenuAction, MenuSheet } from "../../components/MenuSheet";
import { NavBar } from "../../components/NavBar";
import { DetailRow, RowGroup, SectionHeader } from "../../components/Rows";
import { starterTemplates } from "../../data/starterTemplates";
import { HOME_LABEL } from "../../navigation/backLabel";
import type { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { listDisplayTitle } from "../../utils/listEntries";
import { createSetAsideStyles } from "../setAsideStyles";

type Props = NativeStackScreenProps<RootStackParamList, "Templates">;

const lineCountLabel = (count: number): string => (count === 1 ? "1 line" : `${count} lines`);

// Lists to start new lists from: the person's own templates, then a few
// ready-made ones. Tapping one makes a list and opens it.
export const TemplatesScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createSetAsideStyles(colors), [colors]);
  const { templates, copyItem, createItemWithLines, trashItem } = useTrove();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = templates.find((template) => template.id === chosenId);

  const sorted = useMemo(() => [...templates].sort((a, b) => a.title.localeCompare(b.title)), [templates]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  // The new list takes the place of this screen, so Back returns to Home.
  const openNew = useCallback(
    (listId: string | undefined) => {
      if (listId) navigation.replace("List", { listId });
    },
    [navigation],
  );

  const useOwn = useCallback(
    (templateId: string, title: string) => openNew(copyItem(templateId, { title, fresh: true })?.id),
    [copyItem, openNew],
  );

  const actions: MenuAction[] = chosen
    ? [
        {
          key: "use",
          label: "New list from this template",
          icon: <FilePlus2 size={20} color={colors.accentDark} />,
          onPress: () => useOwn(chosen.id, listDisplayTitle(chosen, chosen.listItems)),
        },
        {
          key: "edit",
          label: "Edit template",
          icon: <Pencil size={20} color={colors.accentDark} />,
          onPress: () => navigation.navigate("List", { listId: chosen.id }),
        },
        {
          key: "delete",
          label: "Delete template",
          icon: <Trash2 size={20} color={colors.danger} />,
          destructive: true,
          separated: true,
          onPress: () => void trashItem(chosen.id),
        },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <NavBar backLabel={HOME_LABEL} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Templates
        </Text>
        <Text style={styles.note}>
          Tap a template to start a new list from it. To make your own, open a list and choose Save as template.
        </Text>

        {sorted.length > 0 && (
          <>
            <SectionHeader title="Your templates" />
            <RowGroup>
              {sorted.map((template) => {
                const title = listDisplayTitle(template, template.listItems);
                return (
                  <DetailRow
                    key={template.id}
                    title={title}
                    detail={lineCountLabel(template.listItems?.length ?? 0)}
                    hint="Starts a new list. Hold for more actions"
                    onPress={() => useOwn(template.id, title)}
                    onLongPress={() => setChosenId(template.id)}
                  />
                );
              })}
            </RowGroup>
          </>
        )}

        <SectionHeader title="Ready-made" />
        <RowGroup>
          {starterTemplates.map((starter) => (
            <DetailRow
              key={starter.id}
              title={starter.title}
              detail={starter.summary}
              hint="Starts a new list"
              onPress={() => openNew(createItemWithLines(starter.title, starter.lines)?.id)}
            />
          ))}
        </RowGroup>
      </ScrollView>

      <MenuSheet
        visible={!!chosen}
        title={chosen ? listDisplayTitle(chosen, chosen.listItems) : undefined}
        actions={actions}
        onClose={() => setChosenId(null)}
      />
    </View>
  );
};
