import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, ThemeColors } from "./theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedScheme = "light" | "dark";

const THEME_PREFERENCE_KEY = "trove.themePreference";

type ThemeContextValue = {
  colors: ThemeColors;
  scheme: ResolvedScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const defaultValue: ThemeContextValue = {
  colors: lightColors,
  scheme: "light",
  preference: "system",
  setPreference: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    void AsyncStorage.getItem(THEME_PREFERENCE_KEY).then((stored) => {
      if (isThemePreference(stored)) {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
  }, []);

  const scheme: ResolvedScheme = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === "dark" ? darkColors : lightColors,
      scheme,
      preference,
      setPreference,
    }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeColors = (): ThemeColors => useContext(ThemeContext).colors;
export const useThemeScheme = (): ResolvedScheme => useContext(ThemeContext).scheme;
export const useThemePreference = (): { preference: ThemePreference; setPreference: (preference: ThemePreference) => void } => {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, setPreference };
};
