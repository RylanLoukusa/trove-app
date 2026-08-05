import React, { useCallback, useMemo, useRef } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Pencil, Trash2 } from "lucide-react-native";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { ScreenSkeleton, SkeletonBlock, SkeletonList, SkeletonText } from "../../components";
import { SpotlightMessageCard } from "../../components/SpotlightTour";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { useOnboardingTour } from "../../onboarding/OnboardingTourContext";
import { useThemeColors } from "../../theme/ThemeContext";
import { useTrove } from "../../storage/storage";
import type { SavedItem } from "../../types/models";
import { getItemsInFolder } from "../../utils/folderTree";
import { createStyles } from "./styles";
import { ItemDetailPage } from "./ItemDetailPage";

type Props = NativeStackScreenProps<RootStackParamList, "ItemDetail">;

type ScreenStyles = ReturnType<typeof createStyles>;

const ItemDetailSkeleton = ({ styles }: { styles: ScreenStyles }) => (
  <ScreenSkeleton>
    <SkeletonBlock height={42} radius={21} />
    <SkeletonBlock height={14} radius={7} width="28%" />
    <SkeletonText lineCount={2} lineWidths={["88%", "58%"]} lineHeight={30} />
    <SkeletonBlock height={18} radius={9} width="52%" />
    <SkeletonBlock height={260} radius={18} style={styles.mediaPreview} />
    <SkeletonText lineCount={4} lineWidths={["94%", "86%", "76%", "42%"]} style={styles.skeletonSection} />
    <View style={styles.row}>
      <SkeletonBlock height={38} radius={19} width={92} />
      <SkeletonBlock height={38} radius={19} width={128} />
    </View>
    <SkeletonBlock height={20} radius={10} width="28%" style={styles.skeletonSection} />
    <SkeletonText lineCount={1} lineWidths={["48%"]} />
    <SkeletonList
      count={3}
      renderItem={() => <SkeletonBlock height={52} radius={16} style={styles.button} />}
    />
  </ScreenSkeleton>
);

export const ItemDetailScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const { isReady, items, deleteItem, canEditItem } = useTrove();
  const item = items.find((candidate) => candidate.id === route.params.itemId);
  const canEditCurrentItem = item ? canEditItem(item.id) : false;
  const pagerRef = useRef<FlatList<SavedItem>>(null);

  const { presentPaywall } = useEntitlement();
  const { currentStep, next, skip: skipTour, reportFocus } = useOnboardingTour();
  const isMessageStepHere = currentStep?.screen === "ItemDetail" && currentStep.mode === "message";
  const isProPreview = currentStep?.id === "pro-preview";

  useFocusEffect(
    useCallback(() => {
      reportFocus({ screen: "ItemDetail" });
    }, [reportFocus]),
  );

  const onPressSeePro = useCallback(() => {
    skipTour();
    navigation.navigate("Home");
    presentPaywall("sharing");
  }, [navigation, presentPaywall, skipTour]);

  const onPressExitToHome = useCallback(() => {
    skipTour();
    navigation.navigate("Home");
  }, [navigation, skipTour]);

  const folderItems = useMemo(
    () => (item ? getItemsInFolder(items, item.folderId) : []),
    [item, items],
  );
  const itemIndex = item ? folderItems.findIndex((candidate) => candidate.id === item.id) : -1;
  const previousItem = itemIndex > 0 ? folderItems[itemIndex - 1] : undefined;
  const nextItem = itemIndex >= 0 && itemIndex < folderItems.length - 1 ? folderItems[itemIndex + 1] : undefined;

  const onPressEdit = useCallback(() => {
    if (!item || !canEditCurrentItem) return;
    navigation.navigate("AddEditItem", { itemId: item.id });
  }, [canEditCurrentItem, item, navigation]);

  const handleNavigateToIndex = useCallback((index: number): void => {
    pagerRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      const settledItem = folderItems[newIndex];
      if (settledItem && settledItem.id !== route.params.itemId) {
        navigation.setParams({ itemId: settledItem.id });
      }
    },
    [folderItems, navigation, route.params.itemId, width],
  );

  const confirmDelete = useCallback((): void => {
    if (!item || !canEditCurrentItem) return;
    Alert.alert("Delete item?", "This removes it from Trove.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await deleteItem(item.id);
            if (!result.ok) {
              Alert.alert("Could not delete item", result.error ?? "Unable to delete uploaded media.");
              return;
            }
            navigation.navigate("Home");
          })();
        },
      },
    ]);
  }, [canEditCurrentItem, deleteItem, item, navigation]);

  if (!isReady) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <ItemDetailSkeleton styles={styles} />
        </ScrollView>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.notFoundBody}>
          <Text style={styles.notFoundText}>Item not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        navigation={navigation}
        rightActions={
          canEditCurrentItem ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit item"
                hitSlop={8}
                onPress={onPressEdit}
                style={({ pressed }) => [styles.topBarAction, pressed && styles.topBarActionPressed]}
              >
                <Pencil size={22} color={colors.accentDark} strokeWidth={2.4} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete item"
                hitSlop={8}
                onPress={confirmDelete}
                style={({ pressed }) => [styles.topBarAction, pressed && styles.topBarActionPressed]}
              >
                <Trash2 size={22} color={colors.danger} strokeWidth={2.4} />
              </Pressable>
            </>
          ) : undefined
        }
      />
      {folderItems.length > 1 && (
        <View style={styles.itemNav}>
          <Pressable
            disabled={!previousItem}
            onPress={() => handleNavigateToIndex(itemIndex - 1)}
            style={({ pressed }) => [
              styles.itemNavButton,
              !previousItem && styles.itemNavButtonDisabled,
              pressed && previousItem && styles.itemNavButtonPressed,
            ]}
          >
            <Text style={[styles.itemNavText, !previousItem && styles.itemNavTextDisabled]}>‹ Previous</Text>
          </Pressable>
          <Text style={styles.itemNavCount}>
            {itemIndex + 1} / {folderItems.length}
          </Text>
          <Pressable
            disabled={!nextItem}
            onPress={() => handleNavigateToIndex(itemIndex + 1)}
            style={({ pressed }) => [
              styles.itemNavButton,
              !nextItem && styles.itemNavButtonDisabled,
              pressed && nextItem && styles.itemNavButtonPressed,
            ]}
          >
            <Text style={[styles.itemNavText, !nextItem && styles.itemNavTextDisabled]}>Next ›</Text>
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={pagerRef}
          data={folderItems}
          keyExtractor={(pageItem) => pageItem.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={itemIndex >= 0 ? itemIndex : 0}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          windowSize={3}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={({ item: pageItem }) => <ItemDetailPage item={pageItem} width={width} navigation={navigation} />}
        />
      </KeyboardAvoidingView>
      {isMessageStepHere && currentStep ? (
        <SpotlightMessageCard
          title={currentStep.title}
          body={currentStep.body}
          primaryLabel={isProPreview ? "See Pro features" : "Next"}
          onPrimary={isProPreview ? onPressSeePro : next}
          onSkip={isProPreview ? onPressExitToHome : skipTour}
        />
      ) : null}
    </View>
  );
};
