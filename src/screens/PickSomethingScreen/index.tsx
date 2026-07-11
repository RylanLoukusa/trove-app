import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { EmptyState } from "../../components/EmptyState";
import { FolderChoiceRow } from "../../components/FolderChoiceRow";
import { ItemCard } from "../../components/ItemCard";
import { OptionChoiceRow } from "../../components/OptionChoiceRow";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { SavedItem } from "../../types/models";
import { getFolderHierarchyRows, getFolderPathLabel } from "../../utils/folderTree";
import { pickRandomWaitingItem } from "../../utils/itemFilters";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "PickSomething">;

const PickSomethingSkeleton = () => (
  <ScreenSkeleton>
    <SkeletonBlock height={38} radius={16} width="64%" />
    <SkeletonText lineCount={2} lineWidths={["92%", "72%"]} />
    <SkeletonBlock height={22} radius={11} width="28%" style={styles.skeletonSection} />
    <SkeletonList
      count={5}
      renderItem={() => (
        <View style={styles.skeletonChoice}>
          <SkeletonBlock height={20} radius={10} width="64%" />
          <SkeletonBlock height={14} radius={7} width="42%" style={styles.skeletonChoiceDetail} />
        </View>
      )}
    />
    <SkeletonBlock height={22} radius={11} width="32%" style={styles.skeletonSection} />
    <SkeletonList
      count={2}
      renderItem={() => (
        <View style={styles.skeletonChoice}>
          <SkeletonBlock height={20} radius={10} width="58%" />
          <SkeletonBlock height={14} radius={7} width="48%" style={styles.skeletonChoiceDetail} />
        </View>
      )}
    />
    <SkeletonBlock height={52} radius={16} style={styles.button} />
  </ScreenSkeleton>
);

const priorityFilterChoices = [
  { value: false, label: "Any priority", detail: "Pull from everything waiting", tone: "#6E8F72" },
  { value: true, label: "High priority only", detail: "Only pick from top-priority saves", tone: "#B85B53" },
];

const PickedItemRow = React.memo(function PickedItemRow({
  picked,
  folderPath,
  onOpenItemDetail,
}: {
  picked: SavedItem;
  folderPath: string;
  onOpenItemDetail: (itemId: string) => void;
}) {
  const onPress = useCallback(() => {
    onOpenItemDetail(picked.id);
  }, [picked.id, onOpenItemDetail]);

  return <ItemCard item={picked} folderPath={folderPath} onPress={onPress} />;
});

export const PickSomethingScreen = ({ navigation, route }: Props) => {
  const { folders, isReady, items } = useTrove();
  const [folderId, setFolderId] = useState<string | undefined>(route.params?.folderId);
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);
  const [picked, setPicked] = useState<SavedItem | undefined>(() =>
    pickRandomWaitingItem(items, folders, route.params?.folderId, false),
  );
  const folderRows = useMemo(() => getFolderHierarchyRows(folders), [folders]);

  useEffect(() => {
    if (!isReady || picked) return;
    setPicked(pickRandomWaitingItem(items, folders, folderId, highPriorityOnly));
  }, [folderId, folders, highPriorityOnly, isReady, items, picked]);

  const pick = useCallback((): void => {
    setPicked(pickRandomWaitingItem(items, folders, folderId, highPriorityOnly));
  }, [folderId, folders, highPriorityOnly, items]);

  const onOpenItemDetail = useCallback(
    (itemId: string) => {
      navigation.navigate("ItemDetail", { itemId });
    },
    [navigation],
  );

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!isReady ? (
          <PickSomethingSkeleton />
        ) : (
          <>
        <Text style={styles.title}>Pick Something</Text>
        <Text style={styles.subtitle}>
          Randomly choose from waiting items. Narrow it by folder or high priority.
        </Text>

        <Text style={styles.section}>Folder</Text>
        <Pressable
          onPress={() => setFolderId(undefined)}
          style={[styles.anyFolderChoice, !folderId && styles.anyFolderSelected]}
        >
          <Text style={[styles.anyFolderText, !folderId && styles.anyFolderTextSelected]}>All folders</Text>
        </Pressable>
        {folderRows.map(({ folder, depth }) => (
          <FolderChoiceRow
            key={folder.id}
            folder={folder}
            depth={depth}
            isSelected={folderId === folder.id}
            onPress={() => setFolderId(folder.id)}
          />
        ))}

        <Text style={styles.section}>Priority</Text>
        {priorityFilterChoices.map((choice) => (
          <OptionChoiceRow
            key={choice.label}
            label={choice.label}
            detail={choice.detail}
            tone={choice.tone}
            isSelected={highPriorityOnly === choice.value}
            onPress={() => setHighPriorityOnly(choice.value)}
          />
        ))}

        <AppButton label="Pick for me" onPress={pick} style={styles.button} />

        {picked ? (
          <PickedItemRow
            picked={picked}
            folderPath={getFolderPathLabel(folders, picked.folderId)}
            onOpenItemDetail={onOpenItemDetail}
          />
        ) : (
          <EmptyState
            title="Nothing waiting here."
            message="Try a different folder or turn off high-priority filtering."
          />
        )}
          </>
        )}
      </ScrollView>
    </View>
  );
};
