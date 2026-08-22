import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { PublicFooter } from "../public-footer";
import { Seo } from "../seo";
import {
  cravingOption,
  CRAVING_OPTIONS,
  loadPublicPickerCandidates,
  pickRecommendation,
  pickerResultPath,
  type CravingKey,
  type PickerCandidate
} from "./data";

function CravingOption({
  option,
  selected,
  disabled,
  onChange
}: {
  option: (typeof CRAVING_OPTIONS)[number];
  selected: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`relative flex min-h-[76px] cursor-pointer flex-col items-start justify-between rounded-xl border p-4 transition-colors ${selected ? "border-primary bg-accent ring-2 ring-primary ring-offset-2" : "border-border bg-card hover:bg-muted"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        aria-label={option.label}
        checked={selected}
        className="sr-only"
        disabled={disabled}
        name="picker-craving"
        type="radio"
        value={option.key}
        onChange={onChange}
      />
      <span aria-hidden="true" className="text-2xl leading-7">
        {option.icon}
      </span>
      <span className="text-sm font-semibold text-card-foreground">
        {option.label}
      </span>
    </label>
  );
}

function PickerStage({ drawing }: { drawing: boolean }) {
  return (
    <section
      aria-label="Daily milk tea sign"
      className={`relative flex min-h-[190px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-accent ${drawing ? "animate-pulse" : ""}`}
    >
      <div aria-hidden="true" className="text-center">
        <span className="block text-6xl leading-none text-primary">✦</span>
        <span className="mt-3 block text-xs font-medium tracking-[0.2em] text-primary">
          {drawing ? "DRAWING" : "YOUR SIGN"}
        </span>
      </div>
    </section>
  );
}

export function PickerPage() {
  const [selectedCraving, setSelectedCraving] = useState<CravingKey>("matcha");
  const [candidates, setCandidates] = useState<PickerCandidate[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const drawingTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setMessage(null);
    const result = await loadPublicPickerCandidates();
    if (result.error || !result.data) {
      setStatus("error");
      return;
    }
    setCandidates(result.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (drawingTimer.current !== null) {
        window.clearTimeout(drawingTimer.current);
      }
    };
  }, [load]);

  const draw = () => {
    if (status !== "ready" || isDrawing) return;
    const recommendation = pickRecommendation(candidates, selectedCraving);
    if (!recommendation) {
      setMessage(
        candidates.length === 0
          ? "No drinks are ready for the picker yet."
          : "Nothing matches that craving right now. Try another sign, or choose Surprise Me."
      );
      return;
    }

    setMessage(null);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) {
      window.location.assign(pickerResultPath(recommendation));
      return;
    }

    setIsDrawing(true);
    drawingTimer.current = window.setTimeout(() => {
      window.location.assign(pickerResultPath(recommendation));
    }, 260);
  };

  const selectedLabel = cravingOption(selectedCraving).label;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Seo
        description="Let WeMilktea choose a milk tea drink and real Auckland store for your next craving."
        path="/picker"
        title="Daily Milk Tea Picker | WeMilktea"
      />
      <PublicHeader />
      <main className="flex-1 w-full mx-auto max-w-[1280px] px-5 pb-12 pt-5 sm:px-8 md:pt-8">
        <div className="mb-8">
          <p className="text-xs font-medium tracking-wide text-primary">
            DAILY MILK TEA PICKER
          </p>
          <h1 className="mt-4 text-[32px] font-semibold leading-10 md:text-[40px] md:leading-[48px]">
            Draw your milk tea sign.
          </h1>
          <p className="mt-3 max-w-[560px] text-base leading-6 text-muted-foreground">
            Can&apos;t decide? Give us one craving and we&apos;ll choose one
            drink and one real place to find it.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] md:items-start lg:gap-10">
          <PickerStage drawing={isDrawing} />

          <section aria-labelledby="picker-controls-heading">
            <h2 className="text-xl font-semibold" id="picker-controls-heading">
              What are you craving?
            </h2>
            <fieldset className="mt-4">
              <legend className="sr-only">Choose one craving</legend>
              <div className="grid grid-cols-2 gap-3">
                {CRAVING_OPTIONS.map((option) => (
                  <CravingOption
                    disabled={isDrawing || status !== "ready"}
                    key={option.key}
                    option={option}
                    selected={option.key === selectedCraving}
                    onChange={() => {
                      setSelectedCraving(option.key);
                      setMessage(null);
                    }}
                  />
                ))}
              </div>
            </fieldset>

            {status === "loading" ? (
              <p className="mt-5 text-sm text-muted-foreground" role="status">
                Preparing today&apos;s signs…
              </p>
            ) : null}
            {status === "error" ? (
              <div
                className="mt-5 rounded-xl border border-border bg-card p-4"
                role="alert"
              >
                <p className="text-sm text-destructive">
                  The picker is unavailable right now. Please try again.
                </p>
                <button
                  className="mt-3 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
                  type="button"
                  onClick={() => void load()}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {message ? (
              <div
                className="mt-5 rounded-xl border border-border bg-card p-4"
                role="alert"
                tabIndex={-1}
              >
                <p className="text-sm text-muted-foreground">{message}</p>
                {candidates.length === 0 ? (
                  <Link
                    className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground"
                    to="/drinks"
                  >
                    Browse drinks
                  </Link>
                ) : null}
              </div>
            ) : null}

            <button
              className="mt-6 flex h-[52px] w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status !== "ready" || isDrawing}
              type="button"
              onClick={draw}
            >
              {isDrawing ? "Drawing your sign…" : "Draw my milk tea sign"}
            </button>
            <p
              className="mt-3 text-center text-xs leading-5 text-muted-foreground"
              aria-live="polite"
            >
              {isDrawing
                ? "Your sign is choosing one drink and one available store."
                : `Selected craving: ${selectedLabel}`}
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PickerResultBoundary() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-[680px] px-5 py-16 text-center sm:px-8">
        <p className="text-xs font-medium tracking-wide text-primary">
          YOUR MILK TEA SIGN
        </p>
        <h1 className="mt-4 text-[32px] font-semibold leading-10">
          Your result is ready.
        </h1>
        <p className="mt-3 text-base leading-6 text-muted-foreground">
          The full result presentation is coming in WM-31. You can draw another
          sign or browse the catalogue.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-xs font-medium text-primary-foreground"
            to="/picker"
          >
            Pick again
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-xs font-medium text-foreground"
            to="/drinks"
          >
            Browse drinks
          </Link>
        </div>
      </main>
    </div>
  );
}
