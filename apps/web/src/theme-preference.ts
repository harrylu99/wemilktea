export const THEME_STORAGE_KEY = "wemilktea-theme";
export const themePreferences = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function readThemePreference(value: string | null): ThemePreference {
  return themePreferences.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
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
