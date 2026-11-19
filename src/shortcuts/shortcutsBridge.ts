import { NativeModules, Platform } from "react-native";

import type { ShortcutCommand, ShortcutListChoice } from "./shortcutCommands";

// Commands Siri and the Shortcuts app left for the app (iOS 16 and later).
type TroveShortcutsNativeModule = {
  takePendingCommands: () => Promise<string>;
  // The lists Siri can offer, as JSON.
  saveLists?: (json: string) => Promise<boolean>;
};

const nativeModule = NativeModules.TroveShortcutsModule as TroveShortcutsNativeModule | undefined;

const isCommand = (value: unknown): value is ShortcutCommand => {
  if (typeof value !== "object" || value === null) return false;
  const command = value as Record<string, unknown>;
  if (command.listId !== undefined && typeof command.listId !== "string") return false;
  if (command.action === "add") return typeof command.text === "string" && (command.list === undefined || typeof command.list === "string");
  if (command.action === "open") return typeof command.list === "string";
  return false;
};

// Takes the waiting commands (they are gone from the queue afterwards).
export const takePendingShortcutCommands = async (): Promise<ShortcutCommand[]> => {
  if (Platform.OS !== "ios" || !nativeModule?.takePendingCommands) return [];
  try {
    const parsed = JSON.parse((await nativeModule.takePendingCommands()) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isCommand).map((command) => (command.action === "add" && !command.list ? { ...command, list: undefined } : command))
      : [];
  } catch (error) {
    console.warn("Could not read what Siri left for Trove", error);
    return [];
  }
};

// Tells Siri which lists there are to pick from.
export const saveShortcutLists = async (lists: ShortcutListChoice[]): Promise<boolean> => {
  if (Platform.OS !== "ios" || !nativeModule?.saveLists) return false;
  try {
    return await nativeModule.saveLists(JSON.stringify(lists));
  } catch (error) {
    console.warn("Could not tell Siri about Trove's lists", error);
    return false;
  }
};
