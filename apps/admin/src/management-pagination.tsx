import { PAGE_SIZE } from "./management-pagination-state";

export function ManagementPagination({
  page,
  totalCount,
  onPageChange
}: {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (totalCount === 0) return null;

  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-4 text-sm"
    >
      <p className="text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {totalCount}
      </p>
      <div className="flex items-center gap-3">
        <button
          className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page <= 1}
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <button
          className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page >= totalPages}
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
