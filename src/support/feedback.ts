import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import { Alert, Linking, Platform } from "react-native";

export const SUPPORT_EMAIL = "support@novaendeavor.com";

const appVersion = (): string => Constants.expoConfig?.version ?? "unknown";

// The body starts with what helps answer: the app version and the phone.
export const feedbackMailUrl = (): string => {
  const subject = "Trove feedback";
  const body = [
    "",
    "",
    "---",
    `Trove ${appVersion()}`,
    `${Platform.OS === "ios" ? "iOS" : "Android"} ${String(Platform.Version)}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export const sendFeedback = async (): Promise<void> => {
  try {
    await Linking.openURL(feedbackMailUrl());
  } catch {
    // No mail app set up: say where to write instead.
    Alert.alert("Send feedback", `Email us at ${SUPPORT_EMAIL} and we'll get back to you.`);
  }
};

export const rateTrove = async (): Promise<void> => {
  try {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // Fall through to the store page.
  }
  const url = StoreReview.storeUrl();
  if (url) await Linking.openURL(url).catch(() => undefined);
};

const RATING_KEY = "trove:ratingPrompt:v1";
// Asked once, after Trove has been opened on this many different days.
export const RATING_AFTER_DAYS = 5;

type RatingState = { days: string[]; asked?: boolean };

// Counts the days Trove is opened, and once there have been enough, asks
// for a rating. The phone decides whether the prompt really shows.
export const noteDayForRating = async (day: string): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(RATING_KEY);
    const state: RatingState = raw ? JSON.parse(raw) : { days: [] };
    if (state.asked || state.days.includes(day)) return;
    const days = [...state.days, day].slice(-RATING_AFTER_DAYS);
    const ready = days.length >= RATING_AFTER_DAYS;
    await AsyncStorage.setItem(RATING_KEY, JSON.stringify({ days, asked: ready }));
    if (ready && (await StoreReview.hasAction())) await StoreReview.requestReview();
  } catch {
    // A rating prompt is never worth an error.
  }
};
