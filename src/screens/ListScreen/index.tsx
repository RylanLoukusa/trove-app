import React, { useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { NavBar } from "../../components/NavBar";
import { SkeletonBlock, SkeletonText } from "../../components";
import { backLabelFor } from "../../navigation/backLabel";
import type { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { spacing, ThemeColors } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import { ListPage } from "./ListPage";

type Props = NativeStackScreenProps<RootStackParamList, "List">;

export const ListScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { folders, isReady, items } = useTrove();
  const backLabel = backLabelFor(navigation.getState(), route.key, folders);
  const item = items.find((candidate) => candidate.id === route.params.listId && candidate.type === "list");
  // Once shown, a list that goes away (deleted, or thrown away for being
  // empty) leaves a blank page behind while the screen closes.
  const wasShown = useRef(false);
  if (item) wasShown.current = true;

  if (item) {
    return <ListPage key={item.id} item={item} navigation={navigation} backLabel={backLabel} isNew={!!route.params.isNew} />;
  }

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  };

  return (
    <View style={styles.screen}>
      <NavBar backLabel={backLabel} onBack={goBack} />
      {!isReady ? (
        <View style={styles.body}>
          <SkeletonBlock height={34} radius={10} width="62%" />
          <SkeletonText lineCount={5} lineWidths={["88%", "72%", "80%", "54%", "66%"]} lineHeight={22} style={styles.lines} />
        </View>
      ) : wasShown.current ? null : (
        <View style={styles.body}>
          <Text style={styles.missing}>This list isn't here any more.</Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.surface,
      flex: 1,
    },
    body: {
      paddingHorizontal: 20,
      paddingTop: spacing.sm,
    },
    lines: {
      marginTop: spacing.lg,
    },
    missing: {
      color: colors.muted,
      fontSize: 17,
    },
  });
