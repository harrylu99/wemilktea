export const DRINKS_PAGE_SIZE = 20;

export type PaginationItem = number | "ellipsis";

export function parsePageParam(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function totalPagesFor(
  totalResults: number,
  pageSize = DRINKS_PAGE_SIZE
) {
  return Math.ceil(totalResults / pageSize);
}

export function clampPage(page: number, totalPages: number) {
  return totalPages > 0 ? Math.min(Math.max(page, 1), totalPages) : 1;
}

export function paginationItems(
  currentPage: number,
  totalPages: number
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) return [1, 2, 3, "ellipsis", totalPages];
  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages
  ];
}

export function resultRange(
  currentPage: number,
  totalResults: number,
  pageSize = DRINKS_PAGE_SIZE
) {
  if (totalResults === 0) return null;
  return {
    start: (currentPage - 1) * pageSize + 1,
    end: Math.min(currentPage * pageSize, totalResults)
  };
}

export function resetDrinksPage(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  next.delete("page");
  return next;
}

export function setDrinksPage(searchParams: URLSearchParams, page: number) {
  const next = new URLSearchParams(searchParams);
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  return next;
}
