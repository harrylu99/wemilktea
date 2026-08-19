import { expect, test } from "bun:test";
import { formatStatusLabel } from "./status-label";

test("formats enum values as readable Admin labels", () => {
  expect(formatStatusLabel("possible_duplicate")).toBe("Possible duplicate");
  expect(formatStatusLabel("needs_review")).toBe("Needs review");
  expect(formatStatusLabel("draft")).toBe("Draft");
});
