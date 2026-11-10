import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import {
  CompletedMode,
  defaultListViewSettings,
  ListSortMode,
  ListViewSettings,
} from "../utils/listView";

// How a list is displayed (sort, completed lines) is remembered per list on
// this device. It is a view preference, so it is not synced.
const keyForList = (listId: string) => `trove:listView:${listId}`;

const sortModes: ListSortMode[] = ["manual", "due", "priority", "alpha", "newest"];
const completedModes: CompletedMode[] = ["inline", "bottom", "hide"];

const parseSettings = (stored: string | null): ListViewSettings => {
  if (!stored) return defaultListViewSettings;
  try {
    const parsed = JSON.parse(stored) as Partial<ListViewSettings>;
    return {
      sortMode: sortModes.includes(parsed.sortMode as ListSortMode)
        ? (parsed.sortMode as ListSortMode)
        : defaultListViewSettings.sortMode,
      completedMode: completedModes.includes(parsed.completedMode as CompletedMode)
        ? (parsed.completedMode as CompletedMode)
        : defaultListViewSettings.completedMode,
    };
  } catch {
    return defaultListViewSettings;
  }
};

export const useListViewSettings = (
  listId: string,
): [ListViewSettings, (updates: Partial<ListViewSettings>) => void] => {
  const [settings, setSettings] = useState<ListViewSettings>(defaultListViewSettings);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(keyForList(listId))
      .then((stored) => {
        if (!cancelled) setSettings(parseSettings(stored));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const update = useCallback(
    (updates: Partial<ListViewSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...updates };
        void AsyncStorage.setItem(keyForList(listId), JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [listId],
  );

  return [settings, update];
};
