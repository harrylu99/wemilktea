import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { ThemeContext } from "./theme-context";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference
} from "./theme-preference";

function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function storedThemePreference() {
  try {
    return readThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    storedThemePreference
  );
  const [isSystemDark, setIsSystemDark] = useState(systemIsDark);
  const resolvedTheme = resolveTheme(preference, isSystemDark);

  useEffect(() => {
    applyTheme(document.documentElement, resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setIsSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ResolvedTheme) => {
    setPreferenceState(nextPreference);
    setIsSystemDark(systemIsDark());
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // Theme selection remains usable when storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ resolvedTheme, setPreference }),
    [resolvedTheme, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
