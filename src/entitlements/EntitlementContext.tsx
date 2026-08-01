import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { navigationRef } from "../navigation/navigationRef";
import type { PaywallTrigger } from "../utils/limits";

const DEV_PLAN_KEY_PREFIX = "trove:entitlement:devIsPro:v1";

// Stubbed entitlement state until RevenueCat is wired up. isPro is read from a
// per-user local flag so gated flows (paywall triggers, editor-invite downgrade,
// etc.) can be built and tested before real billing exists. Swapping in
// react-native-purchases later should only touch this file's internals, not
// the EntitlementContextValue shape consumers rely on.
type EntitlementContextValue = {
  isPro: boolean;
  isLoading: boolean;
  presentPaywall: (trigger: PaywallTrigger) => void;
  restorePurchases: () => Promise<{ ok: boolean; error?: string }>;
  setDevIsPro: (value: boolean) => void;
};

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

const devPlanKeyForUser = (userId?: string | null): string =>
  userId ? `${DEV_PLAN_KEY_PREFIX}:user:${userId}` : `${DEV_PLAN_KEY_PREFIX}:anonymous`;

export const EntitlementProvider = ({ children }: { children: ReactNode }) => {
  const { session, isAuthReady } = useAuth();
  const activeUserId = isAuthReady ? session?.user?.id ?? null : null;
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(devPlanKeyForUser(activeUserId));
        if (!cancelled) setIsPro(stored === "true");
      } catch {
        if (!cancelled) setIsPro(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserId, isAuthReady]);

  const setDevIsPro = useCallback(
    (value: boolean) => {
      setIsPro(value);
      void AsyncStorage.setItem(devPlanKeyForUser(activeUserId), value ? "true" : "false");
    },
    [activeUserId],
  );

  const presentPaywall = useCallback((trigger: PaywallTrigger) => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate("Paywall", { trigger });
  }, []);

  const restorePurchases = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    return { ok: false, error: "Restore purchases isn't available yet." };
  }, []);

  const value = useMemo<EntitlementContextValue>(
    () => ({ isPro, isLoading, presentPaywall, restorePurchases, setDevIsPro }),
    [isPro, isLoading, presentPaywall, restorePurchases, setDevIsPro],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
};

export const useEntitlement = (): EntitlementContextValue => {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error("useEntitlement must be used inside EntitlementProvider");
  return context;
};
