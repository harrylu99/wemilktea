import { describe, expect, test } from "bun:test";
import {
  applyTheme,
  readThemePreference,
  resolveTheme
} from "./theme-preference";

describe("public theme preferences", () => {
  test("defaults an absent or invalid preference to System", () => {
    expect(readThemePreference(null)).toBe("system");
    expect(readThemePreference("sepia")).toBe("system");
  });

  test("preserves saved Light, Dark, and System preferences", () => {
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("dark")).toBe("dark");
    expect(readThemePreference("system")).toBe("system");
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

  test("reacts to system changes only while the System preference is selected", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
