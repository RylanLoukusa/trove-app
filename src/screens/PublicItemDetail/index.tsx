import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { ListLinesPreview } from "../../components/ListMarks";
import { NavBar } from "../../components/NavBar";
import { usePublicFolder } from "../../collaboration/usePublicFolder";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { listDisplayTitle } from "../../utils/listEntries";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "PublicItemDetail">;

// One list from a folder shared by link, read-only.
export const PublicItemDetailScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, itemId } = route.params;
  const { data, error, isLoading } = usePublicFolder(token);
  const list = data?.items.find((candidate) => candidate.id === itemId);
  const folder = data?.folders.find((candidate) => candidate.id === list?.folderId);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);
  const navBar = <NavBar backLabel={folder?.name ?? "Back"} onBack={goBack} />;

  if (isLoading) {
    return (
      <View style={styles.screen}>
        {navBar}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentDark} />
        </View>
      </View>
    );
  }

  if (error || !data || !list) {
    return (
      <View style={styles.screen}>
        {navBar}
        <View style={styles.center}>
          <Text style={styles.unavailableTitle}>List unavailable</Text>
          <Text style={styles.unavailableText}>{error ?? "This list is no longer available."}</Text>
        </View>
      </View>
    );
  }

  const checks = list.listItems.filter((line) => line.kind === "check");
  const done = checks.filter((line) => line.checked).length;

  return (
    <View style={styles.screen}>
      {navBar}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {listDisplayTitle(list, list.listItems)}
        </Text>
        <Text style={styles.caption}>
          {[checks.length > 0 ? `${done} of ${checks.length} done` : "", "View only"].filter(Boolean).join(" · ")}
        </Text>

        {list.listItems.length > 0 ? (
          <ListLinesPreview lines={list.listItems} colors={colors} />
        ) : (
          <Text style={styles.empty}>Nothing on this list yet.</Text>
        )}

        <Text style={styles.footer}>Shared read-only from Trove</Text>
      </ScrollView>
    </View>
  );
};
