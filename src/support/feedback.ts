import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import { Alert, Linking, Platform } from "react-native";

import { getSupabase } from "../lib/supabase";

export const SUPPORT_EMAIL = "support@novaendeavor.com";

const appVersion = (): string => Constants.expoConfig?.version ?? "unknown";

export type FeedbackKind = "idea" | "problem" | "general";

const osLabel = (): string => `${Platform.OS === "ios" ? "iOS" : "Android"} ${String(Platform.Version)}`;

// The body ends with what helps answer: the app version and the phone.
export const feedbackMailUrl = (message = ""): string => {
  const subject = "Trove feedback";
  const body = [
    message,
    "",
    "---",
    `Trove ${appVersion()}`,
    osLabel(),
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

// Saves feedback for the team to read. False when it couldn't be sent, e.g.
// signed out or offline, so the caller can offer email instead.
export const submitFeedback = async (message: string, kind: FeedbackKind, userId?: string | null): Promise<boolean> => {
  const supabase = getSupabase();
  const text = message.trim();
  if (!supabase || !userId || !text) return false;
  const { error } = await supabase.from("trove_feedback").insert({
    user_id: userId,
    message: text.slice(0, 5000),
    kind,
    app_version: appVersion(),
    platform: Platform.OS,
    os_version: String(Platform.Version),
  });
  if (error) console.warn("Failed to send feedback", error.message);
  return !error;
};

export const sendFeedback = async (message = ""): Promise<void> => {
  try {
    await Linking.openURL(feedbackMailUrl(message));
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

const RATING_KEY = "trove:ratingPrompt:v2";
// Asked once, the first time a list is finished after Trove has been used
// on this many different days.
export const RATING_AFTER_DAYS = 3;

type RatingState = { days: string[]; asked?: boolean };

const readRating = async (): Promise<RatingState> => {
  const raw = await AsyncStorage.getItem(RATING_KEY);
  return raw ? (JSON.parse(raw) as RatingState) : { days: [] };
};

// Counts the days Trove is opened.
export const noteDayForRating = async (day: string): Promise<void> => {
  try {
    const state = await readRating();
    if (state.asked || state.days.includes(day) || state.days.length >= RATING_AFTER_DAYS) return;
    await AsyncStorage.setItem(RATING_KEY, JSON.stringify({ ...state, days: [...state.days, day] }));
  } catch {
    // A rating prompt is never worth an error.
  }
};

// A list just had its last line checked off: a good moment to ask, once
// Trove has been used for a few days. The phone decides whether the prompt
// really shows.
export const noteListFinished = async (): Promise<void> => {
  try {
    const state = await readRating();
    if (state.asked || state.days.length < RATING_AFTER_DAYS) return;
    await AsyncStorage.setItem(RATING_KEY, JSON.stringify({ ...state, asked: true }));
    if (await StoreReview.hasAction()) await StoreReview.requestReview();
  } catch {
    // A rating prompt is never worth an error.
  }
};
