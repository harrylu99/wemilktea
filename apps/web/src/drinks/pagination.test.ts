import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicPagination } from "../public-pagination";
import {
  clampPage,
  paginationItems,
  parsePageParam,
  resetDrinksPage,
  resultRange,
  setDrinksPage,
  totalPagesFor
} from "./pagination";

test("paginates 849 results into 20-drink pages and reports the range", () => {
  expect(totalPagesFor(849)).toBe(43);
  expect(resultRange(1, 849)).toEqual({ start: 1, end: 20 });
  expect(resultRange(2, 849)).toEqual({ start: 21, end: 40 });
  expect(resultRange(43, 849)).toEqual({ start: 841, end: 849 });
});

test("builds compact page controls for the beginning, middle, and end", () => {
  expect(paginationItems(1, 43)).toEqual([1, 2, 3, "ellipsis", 43]);
  expect(paginationItems(3, 16)).toEqual([1, 2, 3, 4, "ellipsis", 16]);
  expect(paginationItems(8, 16)).toEqual([
    1,
    "ellipsis",
    7,
    8,
    9,
    "ellipsis",
    16
  ]);
  expect(paginationItems(14, 16)).toEqual([1, "ellipsis", 13, 14, 15, 16]);
  expect(paginationItems(16, 16)).toEqual([1, "ellipsis", 14, 15, 16]);
  expect(paginationItems(21, 43)).toEqual([
    1,
    "ellipsis",
    20,
    21,
    22,
    "ellipsis",
    43
  ]);
  expect(paginationItems(43, 43)).toEqual([1, "ellipsis", 41, 42, 43]);
  expect(paginationItems(1, 4)).toEqual([1, 2, 3, 4]);
});

test("normalizes malformed and out-of-range page values", () => {
  expect(parsePageParam(null)).toBe(1);
  expect(parsePageParam("0")).toBe(1);
  expect(parsePageParam("-2")).toBe(1);
  expect(parsePageParam("hello")).toBe(1);
  expect(parsePageParam("1.5")).toBe(1);
  expect(parsePageParam("3")).toBe(3);
  expect(clampPage(99999, 43)).toBe(43);
  expect(clampPage(0, 43)).toBe(1);
  expect(clampPage(2, 0)).toBe(1);
});

test("resets page changes without dropping active filters", () => {
  const params = new URLSearchParams("q=mango&category=matcha&page=8");
  expect(resetDrinksPage(params).toString()).toBe("q=mango&category=matcha");
  expect(setDrinksPage(params, 3).toString()).toBe(
    "q=mango&category=matcha&page=3"
  );
  expect(setDrinksPage(params, 1).toString()).toBe("q=mango&category=matcha");
});

test("renders accessible controls and hides itself for one page", () => {
  const markup = renderToStaticMarkup(
    createElement(PublicPagination, {
      currentPage: 2,
      onPageChange: () => undefined,
      pageSize: 20,
      totalPages: 3,
      totalResults: 45
    })
  );
  expect(markup).toContain('aria-label="Drink results pagination"');
  expect(markup).toContain('aria-current="page"');
  expect(markup).toContain("bg-[#6f9e62]");
  expect(markup).toContain("border-transparent");
  expect(markup).toContain("Previous");
  expect(markup).toContain("Next");
  expect(markup).toContain("21–40 of 45 drinks");
  expect(markup).toContain("Page 2 of 3");

  expect(
    renderToStaticMarkup(
      createElement(PublicPagination, {
        currentPage: 1,
        onPageChange: () => undefined,
        pageSize: 20,
        totalPages: 1,
        totalResults: 20
      })
    )
  ).toBe("");
});
