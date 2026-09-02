import { expect, test } from "bun:test";
import {
  groupPendingReports,
  normalizeMomentView,
  type MomentReport
} from "./moments-data";

const firstReport: MomentReport = {
  id: "11111111-1111-4111-8111-111111111111",
  post_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reason: "spam",
  details: null,
  status: "pending",
  created_at: "2026-08-31T12:00:00.000Z",
  resolved_at: null,
  resolved_by: null
};

const secondReport: MomentReport = {
  ...firstReport,
  id: "22222222-2222-4222-8222-222222222222",
  post_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reason: "unsafe"
};

test("normalizes unknown Moment views to the Reported queue", () => {
  expect(normalizeMomentView("recent")).toBe("recent");
  expect(normalizeMomentView("hidden")).toBe("hidden");
  expect(normalizeMomentView("draft")).toBe("reported");
  expect(normalizeMomentView(null)).toBe("reported");
});

test("groups pending reports by post without changing report order", () => {
  const groups = groupPendingReports([firstReport, secondReport, firstReport]);

  expect(groups.get(firstReport.post_id)).toEqual([firstReport, firstReport]);
  expect(groups.get(secondReport.post_id)).toEqual([secondReport]);
});
