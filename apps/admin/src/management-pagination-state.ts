export const PAGE_SIZE = 25;

export function pageFromSearchParams(searchParams: URLSearchParams) {
  const rawPage = searchParams.get("page");
  if (!rawPage || !/^\d+$/.test(rawPage)) return 1;

  const page = Number(rawPage);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function searchParamsForPage(
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
