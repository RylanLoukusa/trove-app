import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { OnboardingScreen } from "./index";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

const mockPlan = { isPro: false };
const mockPresentPaywall = jest.fn();
jest.mock("../../entitlements/EntitlementContext", () => ({
  useEntitlement: () => ({ isPro: mockPlan.isPro, isLoading: false, presentPaywall: mockPresentPaywall }),
}));

type Nav = NativeStackScreenProps<RootStackParamList, "Onboarding">["navigation"];
const navigation = { canGoBack: jest.fn(() => true), goBack: jest.fn(), replace: jest.fn() };

const renderIntro = () =>
  renderScreen(
    <OnboardingScreen
      navigation={navigation as unknown as Nav}
      route={{ key: "Onboarding", name: "Onboarding" } as NativeStackScreenProps<RootStackParamList, "Onboarding">["route"]}
    />,
  );

describe("OnboardingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlan.isPro = false;
  });

  it("walks through a few short slides and ends on Pro", async () => {
    await renderIntro();
    expect(screen.getByText("Lists that keep up")).toBeTruthy();
    await fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("Today and This week")).toBeTruthy();
    await fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("Trove on your Home Screen")).toBeTruthy();
    await fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("Do more with Pro")).toBeTruthy();

    await fireEvent.press(screen.getByText("See Trove Pro"));
    expect(navigation.goBack).toHaveBeenCalled();
    expect(mockPresentPaywall).toHaveBeenCalledWith("general");
  });

  it("leaves Pro out for someone who has it", async () => {
    mockPlan.isPro = true;
    await renderIntro();
    await fireEvent.press(screen.getByText("Next"));
    await fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("Get started")).toBeTruthy();
    expect(screen.queryByText("Do more with Pro")).toBeNull();
  });
});
