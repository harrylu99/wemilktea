export function HorizontalScrollControls({
  label,
  canScrollPrevious,
  canScrollNext,
  onPrevious,
  onNext
}: {
  label: string;
  canScrollPrevious: boolean;
  canScrollNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="horizontal-scroll-controls items-center gap-1">
      <button
        aria-label={`Scroll ${label} left`}
        className="grid size-9 cursor-pointer place-items-center rounded-md border border-border bg-card text-lg text-foreground disabled:cursor-default disabled:opacity-40"
        disabled={!canScrollPrevious}
        type="button"
        onClick={onPrevious}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        aria-label={`Scroll ${label} right`}
        className="grid size-9 cursor-pointer place-items-center rounded-md border border-border bg-card text-lg text-foreground disabled:cursor-default disabled:opacity-40"
        disabled={!canScrollNext}
        type="button"
        onClick={onNext}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
