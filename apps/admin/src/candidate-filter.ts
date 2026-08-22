import { formatStatusLabel } from "./lib/status-label";

export const candidateFilters = [
  "all",
  "new",
  "possible_duplicate",
  "approved",
  "rejected"
] as const;

export const CANDIDATE_PAGE_SIZE = 25;

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
  const rawPage = searchParams.get("page");
  if (!rawPage || !/^\d+$/.test(rawPage)) return 1;

  const page = Number(rawPage);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function searchParamsForCandidatePage(
  searchParams: URLSearchParams,
  page: number
) {
  const nextSearchParams = new URLSearchParams(searchParams);

  if (page <= 1) {
    nextSearchParams.delete("page");
  } else {
    nextSearchParams.set("page", String(page));
  }

  return nextSearchParams;
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
