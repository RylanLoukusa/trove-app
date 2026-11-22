import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { applyReminders, onReminderOpened, setUpReminderHandling } from "./notifications";
import { planReminders } from "./reminderPlan";
import { navigationRef } from "../navigation/navigationRef";
import { useTrove } from "../storage/storage";

const APPLY_DELAY_MS = 1500;

// Keeps this device's reminders in step with the lines that have a time,
// and opens the list when a reminder is tapped. Used once, near the root.
// Without Pro (allowed false) the plan is empty, so any reminders scheduled
// earlier are cancelled.
export const useReminders = (enabled: boolean, allowed = true): void => {
  const { isReady, items, listEntries } = useTrove();
  const lastPlan = useRef("");
  // Coming back to the app tries again, e.g. after reminders were allowed in
  // the phone's settings.
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setWake((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setUpReminderHandling();
    return onReminderOpened((listId) => {
      if (navigationRef.isReady()) navigationRef.navigate("List", { listId });
    });
  }, []);

  useEffect(() => {
    if (!enabled || !isReady) return;
    const timer = setTimeout(() => {
      const plan = allowed ? planReminders(items, listEntries) : [];
      const signature = plan.map((reminder) => reminder.key).join(",");
      if (signature === lastPlan.current) return;
      void applyReminders(plan).then((applied) => {
        if (applied) lastPlan.current = signature;
      });
    }, APPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [allowed, enabled, isReady, items, listEntries, wake]);
};
