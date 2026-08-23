import { createContext, useContext } from "react";
import type { ResolvedTheme } from "./theme-preference";

type ThemeContextValue = {
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ResolvedTheme) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
