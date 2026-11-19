import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { useTrove } from "../storage/storage";
import { useThemePreference } from "../theme/ThemeContext";
import { priorityOptionsFor, toDateKey } from "../utils/listView";
import { saveWidgetSnapshot, widgetsSupported } from "./widgetBridge";
import { buildWidgetSnapshot, widgetSnapshotKey, WIDGET_SNAPSHOT_VERSION } from "./widgetSnapshot";

const DEBOUNCE_MS = 1200;

// Keeps the home screen widget showing Today, This week and the pinned
// lists (or the latest ones) as they change here or arrive from another
// device, and catches up on a new day when the app comes back.
export const useWidgetSync = (enabled: boolean): void => {
  const { items, listEntries, isReady, tagGroups, tagOptions } = useTrove();
  // The widget follows the app's Light, Dark or System setting.
  const { preference: appearance } = useThemePreference();
  const lastKey = useRef<string | null>(null);
  const [day, setDay] = useState(() => toDateKey(new Date()));
  const priorityOptions = useMemo(() => priorityOptionsFor(tagGroups, tagOptions), [tagGroups, tagOptions]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setDay(toDateKey(new Date()));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !isReady || !widgetsSupported()) return;
    const handle = setTimeout(() => {
      const snapshot = buildWidgetSnapshot(items, listEntries ?? [], new Date(), priorityOptions, appearance);
      const key = widgetSnapshotKey(snapshot);
      if (key === lastKey.current) return;
      void saveWidgetSnapshot(snapshot).then((saved) => {
        if (saved) lastKey.current = key;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [enabled, isReady, items, listEntries, priorityOptions, day, appearance]);

  // Signed out: the widget stops showing this person's lists.
  useEffect(() => {
    if (enabled || !widgetsSupported() || lastKey.current === "") return;
    lastKey.current = "";
    const now = new Date();
    void saveWidgetSnapshot({
      version: WIDGET_SNAPSHOT_VERSION,
      updatedAt: now.toISOString(),
      day: toDateKey(now),
      appearance,
      source: "none",
      lists: [],
    });
    // Only on signing out: the appearance at that moment is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
};
