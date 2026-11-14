import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FocusRule, SavedItem } from "../types/models";
import { isSharedAccess } from "../utils/access";

// Everyone starts with two lists pinned at the top of Home: Today and This
// week. Each also picks up lines with a due date in its range from every
// other list. Someone who already has a list with one of these names gets
// that list pinned instead of a second one.
export const PINNED_DEFAULTS: ReadonlyArray<{ title: string; focusRule: FocusRule }> = [
  { title: "This week", focusRule: "due_week" },
  { title: "Today", focusRule: "due_today" },
];

// v2: the first version's lists could be lost to a pull from the server (see
// keepOwnData), so everyone gets one more go.
const doneKey = (userKey: string) => `trove:pinnedDefaultsDone:v2:${userKey}`;

export const isPinnedDefaultsDone = async (userKey: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(doneKey(userKey))) === "true";
  } catch {
    return false;
  }
};

export const markPinnedDefaultsDone = async (userKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(doneKey(userKey), "true");
  } catch (error) {
    console.warn("Failed to remember the pinned lists were set up", error);
  }
};

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// What setting up the pinned lists would do: lists to pin, and lists to make.
export const planPinnedDefaults = (
  lists: SavedItem[],
  canEdit: (listId: string) => boolean,
): { pin: string[]; create: Array<{ title: string; focusRule: FocusRule }> } => {
  const pin: string[] = [];
  const create: Array<{ title: string; focusRule: FocusRule }> = [];
  PINNED_DEFAULTS.forEach((wanted) => {
    // Only a list of their own: one shared with them belongs to someone else.
    const existing = lists.find(
      (list) =>
        list.type === "list" && !isSharedAccess(list) && sameTitle(list.title, wanted.title) && canEdit(list.id),
    );
    if (!existing) create.push(wanted);
    else if (!existing.pinned) pin.push(existing.id);
  });
  return { pin, create };
};
