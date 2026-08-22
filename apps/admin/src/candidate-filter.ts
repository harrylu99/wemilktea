import { formatStatusLabel } from "./lib/status-label";
import {
  PAGE_SIZE,
  pageFromSearchParams,
  searchParamsForPage
} from "./management-pagination-state";

export const candidateFilters = [
  "all",
  "new",
  "possible_duplicate",
  "approved",
  "rejected"
] as const;

export const CANDIDATE_PAGE_SIZE = PAGE_SIZE;

export type CandidateFilter = (typeof candidateFilters)[number];

export function candidateFilterLabel(filter: CandidateFilter) {
  return filter === "all" ? "All candidates" : formatStatusLabel(filter);
}

export function candidateFilterFromSearchParams(
  searchParams: URLSearchParams
): CandidateFilter {
  const status = searchParams.get("status");
  return candidateFilters.includes(status as CandidateFilter)
    ? (status as CandidateFilter)
    : "all";
}

export function searchParamsForCandidateFilter(
  searchParams: URLSearchParams,
  filter: CandidateFilter
) {
  const nextSearchParams = new URLSearchParams(searchParams);

  nextSearchParams.delete("page");

  if (filter === "all") {
    nextSearchParams.delete("status");
  } else {
    nextSearchParams.set("status", filter);
  }

  return nextSearchParams;
}

export function candidatePageFromSearchParams(searchParams: URLSearchParams) {
  return pageFromSearchParams(searchParams);
}

export function searchParamsForCandidatePage(
  searchParams: URLSearchParams,
  page: number
) {
  return searchParamsForPage(searchParams, page);
}

function isCandidateListPath(value: string) {
  return value === "/candidates" || value.startsWith("/candidates?");
}

export function candidateReviewReturnPath(state: unknown) {
  if (typeof state !== "object" || state === null || !("returnTo" in state)) {
    return "/candidates";
  }

  const returnTo = state.returnTo;
  return typeof returnTo === "string" && isCandidateListPath(returnTo)
    ? returnTo
    : "/candidates";
}
