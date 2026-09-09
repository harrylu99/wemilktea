import type { Ref } from "react";

export function MomentsModeSelector({
  mode,
  onGallery,
  onSip,
  sipDisabled = false,
  sipRef
}: {
  mode: "gallery" | "sip";
  onGallery: () => void;
  onSip: () => void;
  sipDisabled?: boolean;
  sipRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div
      aria-label="Moments views"
      className="flex min-h-12 w-full max-w-xs items-center rounded-xl border border-border bg-card p-1"
      role="group"
    >
      <button
        aria-current={mode === "gallery" ? "true" : undefined}
        aria-label={mode === "sip" ? "Open Gallery" : "Gallery"}
        aria-pressed={mode === "gallery"}
        className={`min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "gallery" ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"}`}
        type="button"
        onClick={onGallery}
      >
        Gallery
      </button>
      <button
        ref={sipRef}
        aria-current={mode === "sip" ? "true" : undefined}
        aria-label="Sip Mode"
        aria-pressed={mode === "sip"}
        className={`min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${mode === "sip" ? "bg-primary text-primary-foreground shadow-sm" : "text-primary hover:bg-primary/10"}`}
        disabled={sipDisabled}
        type="button"
        onClick={onSip}
      >
        Sip Mode
      </button>
    </div>
  );
}
