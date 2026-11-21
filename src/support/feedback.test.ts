import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { Linking } from "react-native";

import { feedbackMailUrl, noteDayForRating, RATING_AFTER_DAYS, sendFeedback, SUPPORT_EMAIL } from "./feedback";

jest.mock("expo-store-review", () => ({
  hasAction: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
  storeUrl: jest.fn(() => null),
}));

describe("feedback", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("writes to support with the app version and phone filled in", () => {
    const url = feedbackMailUrl();
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=Trove%20feedback`)).toBe(true);
    expect(decodeURIComponent(url)).toMatch(/Trove .+\n(iOS|Android) /);
  });

  it("opens the mail app", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await sendFeedback();
    expect(open).toHaveBeenCalledWith(feedbackMailUrl());
  });

  it("asks for a rating once, after Trove is opened on enough different days", async () => {
    await noteDayForRating("2026-11-01");
    await noteDayForRating("2026-11-01");
    for (let day = 2; day < RATING_AFTER_DAYS; day += 1) await noteDayForRating(`2026-11-0${day}`);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    await noteDayForRating("2026-11-09");
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);

    await noteDayForRating("2026-11-10");
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });
});
