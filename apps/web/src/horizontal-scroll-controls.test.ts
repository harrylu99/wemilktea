import { expect, test } from "bun:test";
import {
  getHorizontalScrollDistance,
  getHorizontalScrollState
} from "./horizontal-scroll";

test("hides controls when a scroller has no overflow", () => {
  expect(getHorizontalScrollState(0, 400, 400)).toEqual({
    canScrollNext: false,
    canScrollPrevious: false,
    hasOverflow: false
  });
});

test("exposes the next control at the start of an overflowing scroller", () => {
  expect(getHorizontalScrollState(0, 400, 900)).toEqual({
    canScrollNext: true,
    canScrollPrevious: false,
    hasOverflow: true
  });
});

test("exposes both controls in the middle and only Previous at the end", () => {
  expect(getHorizontalScrollState(200, 400, 900)).toEqual({
    canScrollNext: true,
    canScrollPrevious: true,
    hasOverflow: true
  });
  expect(getHorizontalScrollState(500, 400, 900)).toEqual({
    canScrollNext: false,
    canScrollPrevious: true,
    hasOverflow: true
  });
});

test("scrolls by a useful visible group", () => {
  expect(getHorizontalScrollDistance(400)).toBe(300);
});
