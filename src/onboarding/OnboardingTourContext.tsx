import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { isAppTourDone, markAppTourDone } from "../storage/appTour";
import { useTrove } from "../storage/storage";

export type TourStepMode = "info" | "action" | "message";

export type TourStep = {
  id: string;
  screen: keyof RootStackParamList;
  mode: TourStepMode;
  anchorKey?: string;
  title: string;
  body: string;
  /** Forces the tooltip to a side instead of auto-picking based on available space —
   * for anchors where auto-placement ends up covering the highlighted content itself. */
  preferredPlacement?: "above" | "below";
};

// The tour is a single welcome note. The lists teach the rest: a new account
// starts with a "Welcome to Trove" list that walks through the gestures.
const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    screen: "Home",
    mode: "message",
    title: "Welcome to Trove",
    body: "Trove keeps your lists in one place. Tap the pencil to start one, or open the Welcome list to see what a list can do.",
  },
];

type FocusReport = {
  screen: keyof RootStackParamList;
  folderId?: string | null;
  parentFolderId?: string | null;
};

type OnboardingTourContextValue = {
  currentStep: TourStep | undefined;
  stepNumber: number;
  totalSteps: number;
  /** For steps scoped to a specific folder instance (e.g. "the Places folder" or "the subfolder just created"),
   * the folder id that screen must match before rendering the step — null when the step isn't folder-scoped. */
  stepTargetFolderId: string | null;
  next: () => void;
  skip: () => void;
  /** Advances past `stepId` if it's still the current step — for steps completed by a local, in-screen
   * action (e.g. picking a type) rather than a cross-screen navigation. */
  advance: (stepId: string) => void;
  reportFocus: (report: FocusReport) => void;
  maybeStart: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | undefined>(undefined);

export const OnboardingTourProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const { isReady } = useTrove();
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const startAttemptedForKeyRef = useRef<string | null>(null);

  const userKey = session?.user?.id ?? "anonymous";

  const goToNextFrom = useCallback(
    (index: number): number | null => {
      const nextIndex = index + 1;
      if (nextIndex >= TOUR_STEPS.length) {
        void markAppTourDone(userKey);
        return null;
      }
      return nextIndex;
    },
    [userKey],
  );

  const maybeStart = useCallback(() => {
    if (!isReady || stepIndex !== null || startAttemptedForKeyRef.current === userKey) return;
    startAttemptedForKeyRef.current = userKey;
    void (async () => {
      const done = await isAppTourDone(userKey);
      if (!done) setStepIndex(0);
    })();
  }, [isReady, stepIndex, userKey]);

  const next = useCallback(() => {
    setStepIndex((index) => (index === null ? index : goToNextFrom(index)));
  }, [goToNextFrom]);

  const skip = useCallback(() => {
    setStepIndex(null);
    void markAppTourDone(userKey);
  }, [userKey]);

  const advance = useCallback(
    (stepId: string) => {
      setStepIndex((index) => {
        if (index === null || TOUR_STEPS[index].id !== stepId) return index;
        return goToNextFrom(index);
      });
    },
    [goToNextFrom],
  );

  // No step is completed by moving between screens any more; screens still
  // report where they are so steps like that can come back without rewiring.
  const reportFocus = useCallback((_report: FocusReport) => undefined, []);

  const currentStep = stepIndex !== null ? TOUR_STEPS[stepIndex] : undefined;
  const stepTargetFolderId: string | null = null;

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      currentStep,
      stepNumber: stepIndex !== null ? stepIndex + 1 : 0,
      totalSteps: TOUR_STEPS.length,
      stepTargetFolderId,
      next,
      skip,
      advance,
      reportFocus,
      maybeStart,
    }),
    [currentStep, stepIndex, stepTargetFolderId, next, skip, advance, reportFocus, maybeStart],
  );

  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
};

export const useOnboardingTour = (): OnboardingTourContextValue => {
  const context = useContext(OnboardingTourContext);
  if (!context) {
    throw new Error("useOnboardingTour must be used within an OnboardingTourProvider");
  }
  return context;
};
