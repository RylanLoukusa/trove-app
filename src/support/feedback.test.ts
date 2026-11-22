import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { Linking } from "react-native";

import { feedbackMailUrl, noteDayForRating, noteListFinished, RATING_AFTER_DAYS, sendFeedback, SUPPORT_EMAIL } from "./feedback";

jest.mock("expo-store-review", () => ({
  hasAction: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
  storeUrl: jest.fn(() => null),
}));

describe("feedback", () => {
  const devFlag = (globalThis as { __DEV__?: boolean }).__DEV__;
  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = devFlag;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
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

  it("asks for a rating once, when a list is finished after a few days of use", async () => {
    await noteDayForRating("2026-11-01");
    await noteDayForRating("2026-11-01");
    await noteListFinished();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    for (let day = 2; day <= RATING_AFTER_DAYS; day += 1) await noteDayForRating(`2026-11-0${day}`);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    await noteListFinished();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);

    await noteListFinished();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("asks every time a list is finished in a development build", async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    await noteListFinished();
    await noteListFinished();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(2);
  });
});
