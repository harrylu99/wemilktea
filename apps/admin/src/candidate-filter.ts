export const candidateFilters = [
  "all",
  "new",
  "possible_duplicate",
  "approved",
  "rejected"
] as const;

export type CandidateFilter = (typeof candidateFilters)[number];

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

  if (filter === "all") {
    nextSearchParams.delete("status");
  } else {
    nextSearchParams.set("status", filter);
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
