import React from "react";
import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ErrorBoundary } from "./ErrorBoundary";

let shouldThrow = true;
const Bomb = () => {
  if (shouldThrow) throw new Error("boom");
  return <Text>Recovered</Text>;
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    shouldThrow = true;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when nothing throws", async () => {
    await render(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeTruthy();
  });

  it("shows a fallback screen when a child throws", async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.queryByText("Recovered")).toBeNull();
  });

  it("re-renders children after Try again once the error condition clears", async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    shouldThrow = false;
    await fireEvent.press(screen.getByText("Try again"));

    expect(screen.getByText("Recovered")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
