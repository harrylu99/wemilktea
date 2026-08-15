import type { ReactNode } from "react";

type LoadingRegionProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`admin-skeleton motion-safe:animate-pulse rounded bg-muted ${className}`}
    />
  );
}

export function LoadingRegion({
  label,
  children,
  className = ""
}: LoadingRegionProps) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={className}
      role="status"
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function ManagementTableSkeleton({
  label,
  columnCount = 6,
  minWidth = "44rem",
  rows = 6
}: {
  label: string;
  columnCount?: number;
  minWidth?: string;
  rows?: number;
}) {
  const gridStyle = {
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`
  };

  return (
    <LoadingRegion label={label} className="p-4">
      <div className="space-y-3" style={{ minWidth }}>
        <div
          className="grid gap-4 border-b border-border pb-3"
          style={gridStyle}
        >
          {Array.from({ length: columnCount }, (_, index) => (
            <Skeleton
              className={index === 0 ? "h-4 w-3/5" : "h-4 w-2/5"}
              key={index}
            />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            className="grid items-center gap-4 border-b border-border py-2 last:border-0"
            key={rowIndex}
            style={gridStyle}
          >
            {Array.from({ length: columnCount }, (_, columnIndex) => (
              <Skeleton
                className={
                  columnIndex === 0
                    ? "h-9 w-4/5"
                    : columnIndex === columnCount - 1
                      ? "ml-auto h-9 w-16"
                      : "h-4 w-3/5"
                }
                key={columnIndex}
              />
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function ManagementDetailSkeleton({
  label,
  className = ""
}: {
  label: string;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={`space-y-8 ${className}`}>
      <Skeleton className="h-4 w-20" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <div className="space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              className={`h-10 ${index === 4 || index === 5 ? "sm:col-span-1" : ""}`}
              key={index}
            />
          ))}
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-32 w-48" />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-10 w-32" />
      </div>
    </LoadingRegion>
  );
}
