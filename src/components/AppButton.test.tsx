import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppButton } from "./AppButton";

describe("AppButton", () => {
  it("calls onPress when pressed", async () => {
    const onPress = jest.fn();
    await render(<AppButton label="Save" onPress={onPress} />);

    fireEvent.press(screen.getByText("Save"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", async () => {
    const onPress = jest.fn();
    await render(<AppButton label="Save" onPress={onPress} disabled />);

    fireEvent.press(screen.getByText("Save"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("applies a textColor override on top of the variant's default text color", async () => {
    await render(<AppButton label="Continue with Email" onPress={() => {}} variant="secondary" textColor="#000000" />);

    const flattened = StyleSheet.flatten(screen.getByText("Continue with Email").props.style);

    expect(flattened.color).toBe("#000000");
  });
});
