import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { FeedbackScreen } from "./index";
import { submitFeedback } from "../../support/feedback";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));

jest.mock("../../support/feedback", () => ({
  SUPPORT_EMAIL: "support@example.com",
  sendFeedback: jest.fn(),
  submitFeedback: jest.fn(),
}));

const mockSubmit = submitFeedback as jest.Mock;
const navigation = { canGoBack: jest.fn(() => true), goBack: jest.fn(), navigate: jest.fn() };

const renderFeedback = () =>
  renderScreen(
    <FeedbackScreen
      navigation={navigation as unknown as NativeStackScreenProps<RootStackParamList, "Feedback">["navigation"]}
      route={{ key: "Feedback", name: "Feedback" } as NativeStackScreenProps<RootStackParamList, "Feedback">["route"]}
    />,
  );

describe("FeedbackScreen", () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  it("sends what was typed, with its kind, and goes back", async () => {
    mockSubmit.mockResolvedValue(true);
    await renderFeedback();

    await fireEvent.press(screen.getByText("Something's wrong"));
    await fireEvent.changeText(screen.getByLabelText("Your feedback"), "The widget is blank");
    await fireEvent.press(screen.getByText("Send"));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockSubmit).toHaveBeenCalledWith("The widget is blank", "problem", "user-1");
    expect(alert).toHaveBeenCalledWith("Thanks for telling us", expect.any(String));
  });

  it("offers email when it can't be sent", async () => {
    mockSubmit.mockResolvedValue(false);
    await renderFeedback();

    await fireEvent.changeText(screen.getByLabelText("Your feedback"), "Hello");
    await fireEvent.press(screen.getByText("Send"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't send that here", expect.any(String), expect.any(Array)));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
