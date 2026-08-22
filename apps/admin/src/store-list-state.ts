import { publicationFilters, type PublicationFilter } from "./store-list";
import {
  pageFromSearchParams,
  searchParamsForPage
} from "./management-pagination-state";

export type StoreListState = {
  query: string;
  publicationStatus: PublicationFilter;
  brandId: string;
  suburb: string;
  page: number;
};

export function storeListStateFromSearchParams(
  searchParams: URLSearchParams,
  options: {
    brandIds?: readonly string[];
    suburbs?: readonly string[];
  } = {}
): StoreListState {
  const rawStatus = searchParams.get("status");
  const rawBrandId = searchParams.get("brand") ?? "";
  const rawSuburb = searchParams.get("suburb") ?? "";

  return {
    query: searchParams.get("q") ?? "",
    publicationStatus: publicationFilters.includes(
      rawStatus as PublicationFilter
    )
      ? (rawStatus as PublicationFilter)
      : "all",
    brandId:
      options.brandIds && !options.brandIds.includes(rawBrandId)
        ? ""
        : rawBrandId,
    suburb:
      options.suburbs && !options.suburbs.includes(rawSuburb) ? "" : rawSuburb,
    page: pageFromSearchParams(searchParams)
  };
}

export function searchParamsForStoreFilters(
  searchParams: URLSearchParams,
  updates: Partial<StoreListState>
) {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("page");

  if (updates.query !== undefined) {
    const query = updates.query.trim();
    if (query) nextSearchParams.set("q", query);
    else nextSearchParams.delete("q");
  }
  if (updates.publicationStatus !== undefined) {
    if (updates.publicationStatus === "all") {
      nextSearchParams.delete("status");
    } else {
      nextSearchParams.set("status", updates.publicationStatus);
    }
  }
  if (updates.brandId !== undefined) {
    if (updates.brandId) nextSearchParams.set("brand", updates.brandId);
    else nextSearchParams.delete("brand");
  }
  if (updates.suburb !== undefined) {
    if (updates.suburb) nextSearchParams.set("suburb", updates.suburb);
    else nextSearchParams.delete("suburb");
  }

  return nextSearchParams;
}

export function searchParamsForStorePage(
  searchParams: URLSearchParams,
  page: number
) {
  return searchParamsForPage(searchParams, page);
}

function isStoreListPath(value: string) {
  return value === "/stores" || value.startsWith("/stores?");
}

export function storeManagementReturnPath(state: unknown) {
  if (typeof state !== "object" || state === null || !("returnTo" in state)) {
    return "/stores";
  }

  const returnTo = state.returnTo;
  return typeof returnTo === "string" && isStoreListPath(returnTo)
    ? returnTo
    : "/stores";
}
