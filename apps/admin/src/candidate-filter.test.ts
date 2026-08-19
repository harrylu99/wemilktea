import { expect, test } from "bun:test";
import {
  candidateFilterLabel,
  candidateFilterFromSearchParams,
  candidateReviewReturnPath,
  searchParamsForCandidateFilter
} from "./candidate-filter";

test("formats candidate filter labels without changing filter values", () => {
  expect(candidateFilterLabel("possible_duplicate")).toBe("Possible duplicate");
  expect(candidateFilterLabel("approved")).toBe("Approved");
  expect(candidateFilterLabel("all")).toBe("All candidates");
});

test("reads valid candidate filters from the URL", () => {
  expect(
    candidateFilterFromSearchParams(new URLSearchParams("status=approved"))
  ).toBe("approved");
  expect(candidateFilterFromSearchParams(new URLSearchParams())).toBe("all");
});

test("falls back to all for an invalid candidate filter", () => {
  expect(
    candidateFilterFromSearchParams(new URLSearchParams("status=banana"))
  ).toBe("all");
});

test("updates only the candidate status query parameter", () => {
  const searchParams = searchParamsForCandidateFilter(
    new URLSearchParams("page=2&status=new"),
    "approved"
  );

  expect(searchParams.toString()).toBe("page=2&status=approved");
});

test("removes status when the default all filter is selected", () => {
  const searchParams = searchParamsForCandidateFilter(
    new URLSearchParams("page=2&status=new"),
    "all"
  );

  expect(searchParams.toString()).toBe("page=2");
});

test("keeps the originating Candidates URL for an explicit review return", () => {
  expect(
    candidateReviewReturnPath({ returnTo: "/candidates?status=new" })
  ).toBe("/candidates?status=new");
  expect(candidateReviewReturnPath(null)).toBe("/candidates");
  expect(candidateReviewReturnPath({ returnTo: "https://example.com" })).toBe(
    "/candidates"
  );
  expect(candidateReviewReturnPath({ returnTo: "/candidates/123" })).toBe(
    "/candidates"
  );
});
