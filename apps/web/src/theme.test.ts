import { describe, expect, test } from "bun:test";
import {
  applyTheme,
  nextExplicitTheme,
  readThemePreference,
  resolveTheme
} from "./theme-preference";

describe("public theme preferences", () => {
  test("uses System internally only when there is no explicit saved preference", () => {
    expect(readThemePreference(null)).toBe("system");
    expect(readThemePreference("sepia")).toBe("system");
    expect(readThemePreference("system")).toBe("system");
  });

  test("preserves explicit Light and Dark preferences", () => {
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("dark")).toBe("dark");
  });

  test("applies explicit Light and Dark themes to the document root", () => {
    const root = {
      dataset: {},
      style: { colorScheme: "" }
    } as Pick<HTMLElement, "dataset" | "style">;

    applyTheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    applyTheme(root, "light");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });

  test("follows Light and Dark operating-system preferences before selection", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });

  test("quick switching from a system-resolved theme stores the opposite explicit theme", () => {
    expect(nextExplicitTheme(resolveTheme("system", false))).toBe("dark");
    expect(nextExplicitTheme(resolveTheme("system", true))).toBe("light");
  });

  test("explicit preferences ignore later operating-system changes", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("quick switching alternates explicit Light and Dark preferences", () => {
    expect(nextExplicitTheme("light")).toBe("dark");
    expect(nextExplicitTheme("dark")).toBe("light");
  });
});
