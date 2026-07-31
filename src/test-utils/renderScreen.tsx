import React, { ReactElement } from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// `initialWindowMetrics` from the library is null in the test environment (it's
// populated natively at app startup), and SafeAreaProvider renders no children at
// all until it has metrics -- so we supply a fixed set directly.
const testMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

export const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={testMetrics}>{ui}</SafeAreaProvider>);
