export function FilterButtonLabel({
  active,
  summary
}: {
  active: boolean;
  summary: string;
}) {
  if (!active) return <>Filters</>;

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <span className="shrink-0">Filters</span>
      <span aria-hidden="true">·</span>
      <span
        className="min-w-0 max-w-[min(14rem,calc(100vw-3rem))] truncate"
        title={summary || "Filters active"}
      >
        {summary || "active"}
      </span>
    </span>
  );
}
