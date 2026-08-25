import { describe, expect, test } from "bun:test";
import { shouldScrollToTop } from "./route-scroll";

describe("shouldScrollToTop", () => {
  test("scrolls new route pushes to the top", () => {
    expect(shouldScrollToTop("/", "/drinks", "PUSH")).toBe(true);
  });

  test("does not scroll when only search params change", () => {
    expect(shouldScrollToTop("/drinks", "/drinks", "REPLACE")).toBe(false);
  });

  test("preserves browser back and forward restoration", () => {
    expect(shouldScrollToTop("/drinks", "/", "POP")).toBe(false);
  });
});
