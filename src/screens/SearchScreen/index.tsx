import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CircleX, Search } from "lucide-react-native";

import { BulletMark, CheckMark } from "../../components/ListMarks";
import { NavBar } from "../../components/NavBar";
import { FolderStrip, ListRow, RowGroup, SectionHeader } from "../../components/Rows";
import { backLabelFor } from "../../navigation/backLabel";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { useThemeColors } from "../../theme/ThemeContext";
import { folderLabel, getDescendantFolderIds } from "../../utils/folderTree";
import { listActivityTimes, listDisplayTitle, sortListsByActivity } from "../../utils/listEntries";
import { searchTrove, splitAtMatch } from "../../utils/search";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

const RECENT_LIMIT = 8;

// Finds folders, lists, and single lines. Before anything is typed it offers
// the lists touched most recently.
export const SearchScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items, listEntries } = useTrove();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const hasQuery = query.trim().length > 0;

  const activity = useMemo(() => listActivityTimes(items, listEntries ?? []), [items, listEntries]);
  const recent = useMemo(() => sortListsByActivity(items, activity).slice(0, RECENT_LIMIT), [activity, items]);
  // A line pulled into another list is found once, where it lives.
  const borrowedLineIds = useMemo(
    () => new Set((listEntries ?? []).filter((entry) => entry.refEntryId).map((entry) => entry.id)),
    [listEntries],
  );
  const results = useMemo(() => {
    const found = searchTrove(query, folders, items, borrowedLineIds);
    return { ...found, lists: sortListsByActivity(found.lists, activity) };
  }, [activity, borrowedLineIds, folders, items, query]);
  const foundNothing = results.folders.length + results.lists.length + results.lines.length === 0;

  const countForFolder = useCallback(
    (folderId: string): number => {
      const ids = new Set([folderId, ...getDescendantFolderIds(folders, folderId)]);
      return items.reduce((count, item) => count + (ids.has(item.folderId) ? 1 : 0), 0);
    },
    [folders, items],
  );

  const openList = useCallback(
    (listId: string) => {
      navigation.navigate("List", { listId });
    },
    [navigation],
  );

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <NavBar backLabel={backLabelFor(navigation.getState(), route.key, folders)} onBack={goBack} />
      <View style={styles.field}>
        <Search size={17} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search"
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search lists and lines"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
        {hasQuery && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery("")}>
            <CircleX size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {!isReady ? null : !hasQuery ? (
          recent.length > 0 ? (
            <>
              <SectionHeader title="Recent" />
              <RowGroup>
                {recent.map((list) => (
                  <ListRow
                    key={list.id}
                    list={list}
                    activityAt={activity.get(list.id)}
                    folderLabel={folderLabel(folders, list.folderId)}
                    onPress={() => openList(list.id)}
                  />
                ))}
              </RowGroup>
            </>
          ) : (
            <Text style={styles.hint}>Your lists and their lines show up here as you type.</Text>
          )
        ) : foundNothing ? (
          <Text style={styles.hint}>Nothing matches “{query.trim()}”.</Text>
        ) : (
          <>
            {results.folders.length > 0 && (
              <>
                <SectionHeader title="Folders" />
                <FolderStrip
                  folders={results.folders}
                  countFor={countForFolder}
                  onOpen={(folderId) => navigation.navigate("Folder", { folderId })}
                />
              </>
            )}

            {results.lists.length > 0 && (
              <>
                <SectionHeader title="Lists" />
                <RowGroup>
                  {results.lists.map((list) => (
                    <ListRow
                      key={list.id}
                      list={list}
                      activityAt={activity.get(list.id)}
                      folderLabel={folderLabel(folders, list.folderId)}
                      onPress={() => openList(list.id)}
                    />
                  ))}
                </RowGroup>
              </>
            )}

            {results.lines.length > 0 && (
              <>
                <SectionHeader title="Lines" />
                <RowGroup>
                  {results.lines.map(({ list, line }) => {
                    const listTitle = listDisplayTitle(list, list.listItems);
                    const parts = splitAtMatch(line.text, query);
                    return (
                      <Pressable
                        key={`${list.id}:${line.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${line.text}, on ${listTitle}`}
                        onPress={() => openList(list.id)}
                        style={({ pressed }) => [styles.lineRow, pressed && styles.lineRowPressed]}
                      >
                        <View style={styles.lineMark}>
                          {line.kind === "check" ? (
                            <CheckMark checked={!!line.checked} colors={colors} size={18} />
                          ) : line.kind === "bullet" ? (
                            <BulletMark colors={colors} />
                          ) : null}
                        </View>
                        <View style={styles.lineText}>
                          <Text numberOfLines={2} style={[styles.lineTitle, line.checked && styles.lineTitleDone]}>
                            {parts.before}
                            <Text style={styles.lineMatch}>{parts.match}</Text>
                            {parts.after}
                          </Text>
                          <Text numberOfLines={1} style={styles.lineList}>
                            {listTitle}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </RowGroup>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};
