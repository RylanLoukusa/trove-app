import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { isAppTourDone, markAppTourDone } from "../storage/appTour";
import { useTrove } from "../storage/storage";

// The tour is a single welcome note on Home. The lists teach the rest: a new
// account starts with a "Welcome to Trove" list that walks through the gestures.
export const WELCOME_NOTE = {
  title: "Welcome to Trove",
  body: "Your lists live here. Tap the pencil to start one, or open the Welcome list to see what a list can do.",
};

type OnboardingTourContextValue = {
  showWelcome: boolean;
  dismissWelcome: () => void;
  // Shows the welcome note the first time this person reaches Home.
  maybeStart: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | undefined>(undefined);

export const OnboardingTourProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const { isReady } = useTrove();
  const [showWelcome, setShowWelcome] = useState(false);
  const startAttemptedForKeyRef = useRef<string | null>(null);

  const userKey = session?.user?.id ?? "anonymous";

  const maybeStart = useCallback(() => {
    if (!isReady || showWelcome || startAttemptedForKeyRef.current === userKey) return;
    startAttemptedForKeyRef.current = userKey;
    void (async () => {
      const done = await isAppTourDone(userKey);
      if (!done) setShowWelcome(true);
    })();
  }, [isReady, showWelcome, userKey]);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    void markAppTourDone(userKey);
  }, [userKey]);

  const value = useMemo<OnboardingTourContextValue>(
    () => ({ showWelcome, dismissWelcome, maybeStart }),
    [showWelcome, dismissWelcome, maybeStart],
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
