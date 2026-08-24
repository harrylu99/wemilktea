import { expect, test } from "bun:test";
import {
  getMobileStorePreviewId,
  shouldPreserveListOnDesktopToMobile,
  shouldRevealSelectedStoreOnListTransition
} from "./map-interaction";

test("keeps a selected Store actionable in a narrow map-only layout", () => {
  // A hover-capable device can still be below the desktop breakpoint.
  expect(getMobileStorePreviewId("store-1", false)).toBe("store-1");
});

test("does not render a mobile preview in the desktop combined layout", () => {
  expect(getMobileStorePreviewId("store-1", true)).toBeNull();
});

test("only reveals a selected visible Store after an explicit Map to List switch", () => {
  expect(
    shouldRevealSelectedStoreOnListTransition("map", "list", "store-1", [
      "store-1",
      "store-2"
    ])
  ).toBe(true);
  expect(
    shouldRevealSelectedStoreOnListTransition("map", "map", "store-1", [
      "store-1"
    ])
  ).toBe(false);
  expect(
    shouldRevealSelectedStoreOnListTransition("map", "list", null, ["store-1"])
  ).toBe(false);
  expect(
    shouldRevealSelectedStoreOnListTransition("map", "list", "store-1", [
      "store-2"
    ])
  ).toBe(false);
});

test("preserves List context only when focused during desktop to mobile transition", () => {
  expect(shouldPreserveListOnDesktopToMobile(true, false, true)).toBe(true);
  expect(shouldPreserveListOnDesktopToMobile(true, false, false)).toBe(false);
  expect(shouldPreserveListOnDesktopToMobile(false, true, true)).toBe(false);
});
