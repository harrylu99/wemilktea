import { expect, test } from "bun:test";
import {
  candidatePageFromSearchParams,
  candidateFilterLabel,
  candidateFilterFromSearchParams,
  candidateReviewReturnPath,
  searchParamsForCandidatePage,
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
    new URLSearchParams("debug=1&page=2&status=new"),
    "approved"
  );

  expect(searchParams.toString()).toBe("debug=1&status=approved");
});

test("removes status when the default all filter is selected", () => {
  const searchParams = searchParamsForCandidateFilter(
    new URLSearchParams("page=2&status=new"),
    "all"
  );

  expect(searchParams.toString()).toBe("");
});

test("reads a valid one-based candidate page from the URL", () => {
  expect(candidatePageFromSearchParams(new URLSearchParams("page=3"))).toBe(3);
  expect(candidatePageFromSearchParams(new URLSearchParams())).toBe(1);
});

test("falls back to page one for invalid candidate pages", () => {
  for (const value of ["0", "-1", "abc", "1.5"]) {
    expect(
      candidatePageFromSearchParams(new URLSearchParams(`page=${value}`))
    ).toBe(1);
  }
});

test("changes candidate page without dropping the status filter", () => {
  expect(
    searchParamsForCandidatePage(
      new URLSearchParams("status=approved"),
      2
    ).toString()
  ).toBe("status=approved&page=2");
});

test("omits the default candidate page from the URL", () => {
  expect(
    searchParamsForCandidatePage(
      new URLSearchParams("status=approved&page=2"),
      1
    ).toString()
  ).toBe("status=approved");
});

test("keeps the originating Candidates URL for an explicit review return", () => {
  expect(
    candidateReviewReturnPath({
      returnTo: "/candidates?status=approved&page=3"
    })
  ).toBe("/candidates?status=approved&page=3");
  expect(candidateReviewReturnPath(null)).toBe("/candidates");
  expect(candidateReviewReturnPath({ returnTo: "https://example.com" })).toBe(
    "/candidates"
  );
  expect(candidateReviewReturnPath({ returnTo: "/candidates/123" })).toBe(
    "/candidates"
  );
});
