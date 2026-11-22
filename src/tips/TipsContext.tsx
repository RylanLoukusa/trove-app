import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";

// Small one-time pointers for the parts of Trove that aren't obvious. Each
// shows once, only one is up at a time, and it goes as soon as the person
// does what it describes (or taps ×). Settings can turn them all off.
export type TipId =
  | "lineDetails"
  | "swipeLine"
  | "keyboardBar"
  | "checkedLines"
  | "todayList"
  | "holdList"
  | "widget"
  | "reminders"
  | "sharing";

export const TIP_TEXT: Record<TipId, string> = {
  lineDetails: "Tap ⓘ to add a date, reminder or notes to this line.",
  swipeLine: "Swipe a line left to send it to another list, like Today.",
  keyboardBar: "Switch a line between checkbox, bullet and plain text here.",
  checkedLines: "Choose whether checked lines move down or hide, in List settings under •••.",
  todayList: "Lines due today, from every list, land here by themselves.",
  holdList: "Hold a list to pin, move or archive it.",
  widget: "Add Trove to your Home Screen to see Today at a glance.",
  reminders: "Trove can remind you when a line is due.",
  sharing: "People you invite can view for free. Editing together comes with Pro.",
};

// The widget card waits until Trove has been used for a few days.
export const WIDGET_TIP_AFTER_DAYS = 3;
// After a tip goes, the next one waits this long.
export const TIP_PAUSE_MS = 20_000;

type Stored = { seen: TipId[]; off?: boolean; firstDay?: string };

type TipsValue = {
  // The tip on screen, if any.
  active: TipId | null;
  enabled: boolean;
  // False for a short while after a tip goes, so tips never pile up.
  ready: boolean;
  // Days since tips were first counted on this device, for the widget card.
  daysUsed: number;
  // Asks for a tip; it shows only if it hasn't been seen and nothing else is up.
  request: (id: TipId) => void;
  // The tip was read, closed or acted on: it won't come back.
  dismiss: (id: TipId) => void;
  // Takes a tip down for now, e.g. its screen closed; it can show again.
  release: (id: TipId) => void;
  hasSeen: (id: TipId) => boolean;
  setEnabled: (enabled: boolean) => void;
  showAgain: () => void;
};

const noop = () => undefined;
// Without a provider (tests, previews) there are no tips.
const disabled: TipsValue = {
  active: null,
  enabled: false,
  ready: false,
  daysUsed: 0,
  request: noop,
  dismiss: noop,
  release: noop,
  hasSeen: () => true,
  setEnabled: noop,
  showAgain: noop,
};

const TipsContext = createContext<TipsValue>(disabled);

const keyFor = (userKey: string) => `trove:tips:v1:${userKey}`;
const todayKey = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const TipsProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const userKey = session?.user?.id ?? "anonymous";
  const [stored, setStored] = useState<Stored | null>(null);
  const [active, setActive] = useState<TipId | null>(null);
  const storedRef = useRef<Stored | null>(null);
  const [ready, setReady] = useState(true);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (quietTimer.current) clearTimeout(quietTimer.current);
  }, []);

  const save = useCallback(
    (next: Stored) => {
      storedRef.current = next;
      setStored(next);
      void AsyncStorage.setItem(keyFor(userKey), JSON.stringify(next)).catch(() => undefined);
    },
    [userKey],
  );

  useEffect(() => {
    let cancelled = false;
    setActive(null);
    void (async () => {
      let next: Stored = { seen: [] };
      try {
        const raw = await AsyncStorage.getItem(keyFor(userKey));
        if (raw) next = JSON.parse(raw) as Stored;
      } catch {
        // Start fresh.
      }
      if (cancelled) return;
      if (!next.firstDay) {
        next = { ...next, firstDay: todayKey() };
        void AsyncStorage.setItem(keyFor(userKey), JSON.stringify(next)).catch(() => undefined);
      }
      storedRef.current = next;
      setStored(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  const request = useCallback((id: TipId) => {
    const current = storedRef.current;
    if (!current || current.off || current.seen.includes(id)) return;
    setActive((shown) => shown ?? id);
  }, []);

  const dismiss = useCallback(
    (id: TipId) => {
      setActive((shown) => (shown === id ? null : shown));
      // A pause before the next tip.
      setReady(false);
      if (quietTimer.current) clearTimeout(quietTimer.current);
      quietTimer.current = setTimeout(() => setReady(true), TIP_PAUSE_MS);
      const current = storedRef.current;
      if (!current || current.seen.includes(id)) return;
      save({ ...current, seen: [...current.seen, id] });
    },
    [save],
  );

  const release = useCallback((id: TipId) => {
    setActive((shown) => (shown === id ? null : shown));
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const current = storedRef.current ?? { seen: [] };
      if (!enabled) setActive(null);
      save({ ...current, off: !enabled });
    },
    [save],
  );

  const showAgain = useCallback(() => {
    const current = storedRef.current ?? { seen: [] };
    save({ ...current, seen: [], off: false });
  }, [save]);

  const value = useMemo<TipsValue>(
    () => ({
      active,
      enabled: !!stored && !stored.off,
      ready: !!stored && ready,
      daysUsed: stored?.firstDay ? daysBetween(stored.firstDay, todayKey()) : 0,
      request,
      dismiss,
      release,
      hasSeen: (id) => !stored || !!stored.off || stored.seen.includes(id),
      setEnabled,
      showAgain,
    }),
    [active, dismiss, ready, release, request, setEnabled, showAgain, stored],
  );

  return <TipsContext.Provider value={value}>{children}</TipsContext.Provider>;
};

export const useTips = (): TipsValue => useContext(TipsContext);

// Asks for a tip while `when` holds. When the screen goes or the moment
// passes, the tip steps aside without counting as seen.
export const useTip = (id: TipId, when: boolean): { shown: boolean; dismiss: () => void } => {
  const { active, ready, request, dismiss, release } = useTips();
  useEffect(() => {
    if (when && ready && active === null) request(id);
  }, [active, id, ready, request, when]);
  useEffect(() => {
    if (!when) release(id);
  }, [id, release, when]);
  useEffect(() => () => release(id), [id, release]);
  const close = useCallback(() => dismiss(id), [dismiss, id]);
  return { shown: active === id && when, dismiss: close };
};
