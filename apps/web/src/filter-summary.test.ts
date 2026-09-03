import { expect, test } from "bun:test";
import { summarizeFilterLabels } from "./filter-summary";

test("summarizes selected filters with a bounded visible label count", () => {
  expect(summarizeFilterLabels(["Area", "Brand", "Category"])).toBe(
    "Area, Brand +1"
  );
  expect(summarizeFilterLabels(["  Area  ", "", "Brand"])).toBe("Area, Brand");
});
