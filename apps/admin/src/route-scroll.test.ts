import { expect, test } from "bun:test";
import { NavigationType } from "react-router-dom";
import { resetRouteScroll, shouldResetRouteScroll } from "./route-scroll-logic";

test("resets the document scroll for initial, pushed, and replaced routes", () => {
  expect(shouldResetRouteScroll(NavigationType.Pop, true)).toBe(true);
  expect(shouldResetRouteScroll(NavigationType.Push, false)).toBe(true);
  expect(shouldResetRouteScroll(NavigationType.Replace, false)).toBe(true);
});

test("does not reset scroll during back or forward navigation", () => {
  expect(shouldResetRouteScroll(NavigationType.Pop, false)).toBe(false);
});

test("resets the document scroll position to the top", () => {
  const scrollCalls: ScrollToOptions[] = [];

  resetRouteScroll((options) => {
    scrollCalls.push(options);
  });

  expect(scrollCalls).toEqual([{ top: 0, left: 0, behavior: "auto" }]);
});
