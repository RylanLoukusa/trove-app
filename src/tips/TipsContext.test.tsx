import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { TIP_PAUSE_MS, TipId, TipsProvider, useTip, useTips } from "./TipsContext";

jest.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));

const Tip = ({ id, when = true }: { id: TipId; when?: boolean }) => {
  const tip = useTip(id, when);
  return tip.shown ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`close ${id}`} onPress={tip.dismiss}>
      <Text>{id}</Text>
    </Pressable>
  ) : null;
};

const Switches = () => {
  const tips = useTips();
  return (
    <>
      <Pressable onPress={() => tips.setEnabled(false)}>
        <Text>Turn tips off</Text>
      </Pressable>
      <Pressable onPress={tips.showAgain}>
        <Text>See tips again</Text>
      </Pressable>
    </>
  );
};

const renderTips = (children: React.ReactNode) =>
  render(
    <TipsProvider>
      {children}
      <Switches />
    </TipsProvider>,
  );

describe("tips", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  it("shows one tip at a time, and the next only after a pause", async () => {
    jest.useFakeTimers();
    await renderTips(
      <>
        <Tip id="keyboardBar" />
        <Tip id="lineDetails" />
      </>,
    );
    await waitFor(() => expect(screen.getByText("keyboardBar")).toBeTruthy());
    expect(screen.queryByText("lineDetails")).toBeNull();

    await fireEvent.press(screen.getByLabelText("close keyboardBar"));
    expect(screen.queryByText("keyboardBar")).toBeNull();
    expect(screen.queryByText("lineDetails")).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(TIP_PAUSE_MS);
    });
    await waitFor(() => expect(screen.getByText("lineDetails")).toBeTruthy());
  });

  it("doesn't show a tip again once it's been closed", async () => {
    const first = await renderTips(<Tip id="holdList" />);
    await waitFor(() => expect(screen.getByText("holdList")).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("close holdList"));
    first.unmount();

    await renderTips(<Tip id="holdList" />);
    await act(async () => undefined);
    expect(screen.queryByText("holdList")).toBeNull();
  });

  it("waits for its moment", async () => {
    await renderTips(<Tip id="todayList" when={false} />);
    await act(async () => undefined);
    expect(screen.queryByText("todayList")).toBeNull();
  });
});
