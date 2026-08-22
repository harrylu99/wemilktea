import { describe, expect, test } from "bun:test";
import { resolvePublicSiteOrigin } from "./seo-origin";

describe("resolvePublicSiteOrigin", () => {
  test("normalizes a valid production origin", () => {
    expect(
      resolvePublicSiteOrigin(
        "https://web.wemilkteanz.workers.dev/some/path",
        "production"
      )
    ).toBe("https://web.wemilkteanz.workers.dev");
  });

  test("allows the localhost fallback outside production", () => {
    expect(resolvePublicSiteOrigin(undefined, "development")).toBe(
      "http://localhost:5173"
    );
  });

  test("rejects a missing production origin", () => {
    expect(() => resolvePublicSiteOrigin(undefined, "production")).toThrow(
      "VITE_PUBLIC_SITE_URL is required"
    );
  });

  test.each([
    "not-a-url",
    "http://web.wemilkteanz.workers.dev",
    "https://localhost:5173",
    "https://127.0.0.1:5173"
  ])("rejects an unsafe production origin: %s", (value) => {
    expect(() => resolvePublicSiteOrigin(value, "production")).toThrow(
      "valid HTTPS public origin"
    );
  });
});
