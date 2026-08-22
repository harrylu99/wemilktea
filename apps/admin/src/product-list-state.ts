import {
  pageFromSearchParams,
  searchParamsForPage
} from "./management-pagination-state";

export const productStatuses = ["all", "draft", "published"] as const;
export type ProductStatus = (typeof productStatuses)[number];

export type ProductListState = {
  query: string;
  status: ProductStatus;
  page: number;
};

export function productListStateFromSearchParams(
  searchParams: URLSearchParams
): ProductListState {
  const rawStatus = searchParams.get("status");

  return {
    query: searchParams.get("q") ?? "",
    status: productStatuses.includes(rawStatus as ProductStatus)
      ? (rawStatus as ProductStatus)
      : "all",
    page: pageFromSearchParams(searchParams)
  };
}

export function searchParamsForProductFilters(
  searchParams: URLSearchParams,
  updates: Partial<Pick<ProductListState, "query" | "status">>
) {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("page");

  if (updates.query !== undefined) {
    const query = updates.query.trim();
    if (query) nextSearchParams.set("q", query);
    else nextSearchParams.delete("q");
  }
  if (updates.status !== undefined) {
    if (updates.status === "all") nextSearchParams.delete("status");
    else nextSearchParams.set("status", updates.status);
  }

  return nextSearchParams;
}

export function searchParamsForProductPage(
  searchParams: URLSearchParams,
  page: number
) {
  return searchParamsForPage(searchParams, page);
}

function isProductListPath(value: string) {
  return value === "/products" || value.startsWith("/products?");
}

export function productManagementReturnPath(state: unknown) {
  if (typeof state !== "object" || state === null || !("returnTo" in state)) {
    return "/products";
  }

  const returnTo = state.returnTo;
  return typeof returnTo === "string" && isProductListPath(returnTo)
    ? returnTo
    : "/products";
}
