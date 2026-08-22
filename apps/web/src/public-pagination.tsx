import {
  paginationItems,
  resultRange,
  type PaginationItem
} from "./drinks/pagination";

type PublicPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

const controlClassName =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm leading-5 text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-[#f3f5ef] disabled:opacity-70";
const pageClassName =
  "inline-flex size-11 items-center justify-center rounded-xl text-xs font-medium leading-4 text-foreground transition-colors";
const defaultPageClassName = `${pageClassName} border border-border bg-card hover:bg-accent`;
const activePageClassName = `${pageClassName} border border-transparent bg-[#6f9e62] hover:bg-[#6f9e62]`;

function PageButton({
  page,
  currentPage,
  onPageChange
}: {
  page: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}) {
  const active = page === currentPage;
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={`Go to page ${page}`}
      className={active ? activePageClassName : defaultPageClassName}
      type="button"
      onClick={() => onPageChange(page)}
    >
      {page}
    </button>
  );
}

function PageItems({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      {paginationItems(currentPage, totalPages).map(
        (item: PaginationItem, index) =>
          item === "ellipsis" ? (
            <span
              aria-hidden="true"
              className="inline-flex h-11 w-7 items-center justify-center text-xs font-medium leading-4 text-muted-foreground"
              key={`ellipsis-${index}`}
            >
              …
            </span>
          ) : (
            <PageButton
              currentPage={currentPage}
              key={item}
              onPageChange={onPageChange}
              page={item}
            />
          )
      )}
    </>
  );
}

export function PublicPagination({
  currentPage,
  totalPages,
  totalResults,
  pageSize,
  onPageChange
}: PublicPaginationProps) {
  if (totalPages <= 1 || totalResults === 0) return null;

  const range = resultRange(currentPage, totalResults, pageSize);
  if (!range) return null;

  return (
    <nav aria-label="Drink results pagination" className="w-full">
      <div className="hidden h-[88px] items-center justify-between sm:flex">
        <p className="text-sm leading-5 text-muted-foreground">
          {range.start}–{range.end} of {totalResults} drinks
        </p>
        <div className="flex items-center gap-2">
          <button
            aria-label="Go to previous page"
            className={`${controlClassName} w-24`}
            disabled={currentPage === 1}
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous
          </button>
          <PageItems
            currentPage={currentPage}
            onPageChange={onPageChange}
            totalPages={totalPages}
          />
          <button
            aria-label="Go to next page"
            className={`${controlClassName} w-[72px]`}
            disabled={currentPage === totalPages}
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex h-[72px] items-center justify-between sm:hidden">
        <button
          aria-label="Go to previous page"
          className={`${controlClassName} w-[92px]`}
          disabled={currentPage === 1}
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>
        <p className="text-xs font-medium leading-4 text-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <button
          aria-label="Go to next page"
          className={`${controlClassName} w-[72px]`}
          disabled={currentPage === totalPages}
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
