import React, { createContext, ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, ThemeColors } from "./theme";

const ThemeContext = createContext<ThemeColors>(lightColors);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const scheme = useColorScheme();
  const value = useMemo(() => (scheme === "dark" ? darkColors : lightColors), [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeColors = (): ThemeColors => useContext(ThemeContext);
