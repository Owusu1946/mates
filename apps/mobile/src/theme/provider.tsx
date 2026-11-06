import React, { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Appearance, useColorScheme as useNativeColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { lightColors, darkColors, type ColorTokens } from "./tokens";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  colorScheme: "light" | "dark";
  isDark: boolean;
  colors: ColorTokens;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "expojet.theme.mode";
const defaultThemeValue: ThemeContextValue = {
  mode: "system",
  resolvedMode: "light",
  colorScheme: "light",
  isDark: false,
  colors: lightColors,
  setMode: () => {},
  toggleTheme: () => {},
};
const ThemeContext = createContext<ThemeContextValue>(defaultThemeValue);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useNativeColorScheme() ?? "light";
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "system") {
          setModeState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    SecureStore.setItemAsync(STORAGE_KEY, nextMode).catch(() => {});
  };

  const resolvedMode: "light" | "dark" =
    (mode === "system" ? systemScheme : mode) === "dark" ? "dark" : "light";
  const isDark = resolvedMode === "dark";
  const colorScheme = resolvedMode;
  const colors = colorScheme === "dark" ? darkColors : lightColors;

  useEffect(() => {
    // Drive React Native, Uniwind/NativeWind, and any system-aware styling
    // adapter from the same persisted theme decision.
    Appearance.setColorScheme?.(mode === "system" ? systemScheme : resolvedMode);
  }, [mode, resolvedMode, systemScheme]);

  const toggleTheme = () => {
    setMode(colorScheme === "dark" ? "light" : "dark");
  };

  const value = useMemo(
    () => ({ mode, resolvedMode, colorScheme, isDark, colors, setMode, toggleTheme }),
    [mode, resolvedMode, colorScheme, isDark, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  return context ?? defaultThemeValue;
}
