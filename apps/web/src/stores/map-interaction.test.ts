import { expect, test } from "bun:test";
import {
  getMobilePreviewId,
  shouldPreserveListOnDesktopToMobile,
  shouldPreserveMapOnDesktopToMobile,
  shouldRevealSelectedStoreOnListTransition
} from "./map-interaction";

test("keeps a selected Store preview actionable in a narrow map-only layout", () => {
  expect(getMobilePreviewId("store-1", true, false)).toBe("store-1");
});

test("does not show a preview on a fresh mobile Map", () => {
  expect(getMobilePreviewId(null, false, false)).toBeNull();
});

test("does not render a mobile preview in the desktop combined layout", () => {
  expect(getMobilePreviewId("store-1", true, true)).toBeNull();
});

test("selection changes keep the preview on the latest selected Store", () => {
  expect(getMobilePreviewId("store-2", true, false)).toBe("store-2");
  expect(getMobilePreviewId("store-1", false, false)).toBeNull();
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

test("preserves Map context when its marker is focused during desktop to mobile transition", () => {
  expect(shouldPreserveMapOnDesktopToMobile(true, false, true)).toBe(true);
  expect(shouldPreserveMapOnDesktopToMobile(true, false, false)).toBe(false);
  expect(shouldPreserveMapOnDesktopToMobile(false, true, true)).toBe(false);
});
