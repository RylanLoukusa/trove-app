import { NativeModules, Platform } from "react-native";

import type { WidgetSnapshot } from "./widgetSnapshot";

// The native side keeps the snapshot where the widget can read it (the app
// group on iOS, shared preferences on Android) and asks the system to redraw
// the widget.
type TroveWidgetNativeModule = {
  saveSnapshot: (json: string) => Promise<boolean>;
};

const nativeModule = NativeModules.TroveWidgetModule as TroveWidgetNativeModule | undefined;

export const widgetsSupported = (): boolean =>
  (Platform.OS === "ios" || Platform.OS === "android") && !!nativeModule?.saveSnapshot;

export const saveWidgetSnapshot = async (snapshot: WidgetSnapshot): Promise<boolean> => {
  if (!widgetsSupported()) return false;
  try {
    return await nativeModule!.saveSnapshot(JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Could not update the home screen widget", error);
    return false;
  }
};
