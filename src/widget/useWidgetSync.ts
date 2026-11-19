import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { useTrove } from "../storage/storage";
import { priorityOptionsFor, toDateKey } from "../utils/listView";
import { saveWidgetSnapshot, widgetsSupported } from "./widgetBridge";
import { buildWidgetSnapshot, widgetSnapshotKey, WIDGET_SNAPSHOT_VERSION } from "./widgetSnapshot";

const DEBOUNCE_MS = 1200;

// Keeps the home screen widget showing Today, This week and the pinned
// lists (or the latest ones) as they change here or arrive from another
// device, and catches up on a new day when the app comes back.
export const useWidgetSync = (enabled: boolean): void => {
  const { items, listEntries, isReady, tagGroups, tagOptions } = useTrove();
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
      const snapshot = buildWidgetSnapshot(items, listEntries ?? [], new Date(), priorityOptions);
      const key = widgetSnapshotKey(snapshot);
      if (key === lastKey.current) return;
      void saveWidgetSnapshot(snapshot).then((saved) => {
        if (saved) lastKey.current = key;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [enabled, isReady, items, listEntries, priorityOptions, day]);

  // Signed out: the widget stops showing this person's lists.
  useEffect(() => {
    if (enabled || !widgetsSupported() || lastKey.current === "") return;
    lastKey.current = "";
    const now = new Date();
    void saveWidgetSnapshot({
      version: WIDGET_SNAPSHOT_VERSION,
      updatedAt: now.toISOString(),
      day: toDateKey(now),
      source: "none",
      lists: [],
    });
  }, [enabled]);
};
