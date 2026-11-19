import { useEffect, useRef } from "react";

import { useTrove } from "../storage/storage";
import { saveWidgetSnapshot, widgetsSupported } from "./widgetBridge";
import { buildWidgetSnapshot, widgetSnapshotKey } from "./widgetSnapshot";

const DEBOUNCE_MS = 1200;

// Keeps the home screen widget showing the pinned lists (or the latest
// ones) as they change here or arrive from another device.
export const useWidgetSync = (enabled: boolean): void => {
  const { items, listEntries, isReady } = useTrove();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !isReady || !widgetsSupported()) return;
    const handle = setTimeout(() => {
      const snapshot = buildWidgetSnapshot(items, listEntries ?? []);
      const key = widgetSnapshotKey(snapshot);
      if (key === lastKey.current) return;
      void saveWidgetSnapshot(snapshot).then((saved) => {
        if (saved) lastKey.current = key;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [enabled, isReady, items, listEntries]);

  // Signed out: the widget stops showing this person's lists.
  useEffect(() => {
    if (enabled || !widgetsSupported() || lastKey.current === "") return;
    lastKey.current = "";
    void saveWidgetSnapshot({ version: 1, updatedAt: new Date().toISOString(), source: "none", lists: [] });
  }, [enabled]);
};
