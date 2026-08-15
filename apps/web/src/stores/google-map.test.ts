import { expect, test } from "bun:test";
import { buildGoogleMapsScriptUrl } from "./google-map";

test("builds a browser-only Google Maps loader URL", () => {
  const url = new URL(buildGoogleMapsScriptUrl("browser-key"));

  expect(url.origin).toBe("https://maps.googleapis.com");
  expect(url.pathname).toBe("/maps/api/js");
  expect(url.searchParams.get("key")).toBe("browser-key");
  expect(url.searchParams.get("loading")).toBe("async");
  expect(url.searchParams.get("v")).toBe("weekly");
});
