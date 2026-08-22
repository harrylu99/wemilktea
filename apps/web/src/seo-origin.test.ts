import { describe, expect, test } from "bun:test";
import { resolvePublicSiteOrigin, shouldNoIndexWebBuild } from "./seo-origin";

describe("resolvePublicSiteOrigin", () => {
  test("normalizes a valid production origin", () => {
    expect(
      resolvePublicSiteOrigin(
        "https://web.wemilkteanz.workers.dev/some/path",
        "main"
      )
    ).toBe("https://web.wemilkteanz.workers.dev");
  });

  test("allows the localhost fallback for a local production-mode build", () => {
    expect(resolvePublicSiteOrigin(undefined, undefined)).toBe(
      "http://localhost:5173"
    );
  });

  test("rejects a missing origin on the main Workers build", () => {
    expect(() => resolvePublicSiteOrigin(undefined, "main")).toThrow(
      "VITE_PUBLIC_SITE_URL is required"
    );
  });

  test.each([
    "not-a-url",
    "http://web.wemilkteanz.workers.dev",
    "https://localhost:5173",
    "https://127.0.0.1:5173"
  ])("rejects an unsafe production origin: %s", (value) => {
    expect(() => resolvePublicSiteOrigin(value, "main")).toThrow(
      "valid HTTPS public origin"
    );
  });

  test("allows a non-production Workers build without a preview origin", () => {
    expect(resolvePublicSiteOrigin(undefined, "feature/wm-67")).toBe(
      "http://localhost:5173"
    );
  });
});

describe("shouldNoIndexWebBuild", () => {
  test("keeps the main Workers build indexable by default", () => {
    expect(shouldNoIndexWebBuild(undefined, "main")).toBe(false);
  });

  test("forces non-production Workers builds to be noindex", () => {
    expect(shouldNoIndexWebBuild(undefined, "feature/wm-67")).toBe(true);
  });

  test("preserves an explicit local noindex setting", () => {
    expect(shouldNoIndexWebBuild("true", undefined)).toBe(true);
  });
});
