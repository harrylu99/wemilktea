import { expect, test } from "bun:test";
import { getMobileStorePreviewId } from "./map-interaction";

test("keeps a selected Store actionable in a narrow map-only layout", () => {
  // A hover-capable device can still be below the desktop breakpoint.
  expect(getMobileStorePreviewId("store-1", false)).toBe("store-1");
});

test("does not render a mobile preview in the desktop combined layout", () => {
  expect(getMobileStorePreviewId("store-1", true)).toBeNull();
});
