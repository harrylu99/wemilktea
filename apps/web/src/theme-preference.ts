export const THEME_STORAGE_KEY = "wemilktea-theme";

export type ResolvedTheme = "light" | "dark";
export type ThemePreference = ResolvedTheme | "system";

export function readThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemIsDark: boolean
): ResolvedTheme {
  if (preference === "system") return systemIsDark ? "dark" : "light";
  return preference;
}

export function nextExplicitTheme(theme: ResolvedTheme): ResolvedTheme {
  return theme === "light" ? "dark" : "light";
}

export function applyTheme(
  root: Pick<HTMLElement, "dataset" | "style">,
  theme: ResolvedTheme
) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
