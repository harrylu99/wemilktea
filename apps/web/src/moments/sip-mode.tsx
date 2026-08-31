import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { Link } from "react-router-dom";
import { useDismissiblePopover } from "../use-dismissible-popover";
import type { PublicMoment } from "./data";
import { sipDirection, resolveSipAction, type SipAction } from "./sip-gesture";
export type SipLoadMoreStatus = "idle" | "loading" | "error";

export type SipActionResult = { ok: true } | { ok: false; message: string };

function publicLocation(moment: PublicMoment) {
  return moment.location.name ?? moment.location.text;
}

function publicProduct(moment: PublicMoment) {
  return moment.product.name ?? moment.product.text;
}

function relativeMomentTime(value: string, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const minutes = Math.max(
    1,
    Math.floor(Math.max(0, now - timestamp) / 60_000)
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function imageAlt(moment: PublicMoment) {
  const context = [publicProduct(moment), publicLocation(moment)].filter(
    Boolean
  );
  return context.length > 0
    ? `Milk tea moment${moment.displayName ? ` shared by ${moment.displayName}` : ""}: ${context.join(" at ")}`
    : "Milk tea moment photo";
}

function actionLabel(action: SipAction) {
  if (action === "skip") return "Skip";
  if (action === "like") return "Like";
  return "Must Try";
}

function SipCard({
  moment,
  dragAction,
  dragX,
  dragY
}: {
  moment: PublicMoment;
  dragAction: SipAction | null;
  dragX: number;
  dragY: number;
}) {
  const [imageError, setImageError] = useState(false);
  const location = publicLocation(moment);
  const product = publicProduct(moment);
  const author = moment.displayName?.trim() || null;
  const caption = moment.caption.trim();
  const relativeTime = author ? relativeMomentTime(moment.submittedAt) : null;
  const hasDetails = Boolean(product || location || author || caption);
  const dragDistance = Math.min(28, Math.max(-28, dragX * 0.08));
  const dragVerticalDistance = Math.min(28, Math.max(-28, dragY * 0.08));

  useEffect(() => setImageError(false), [moment.id]);

  return (
    <article
      aria-label="Current Moment"
      className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl md:max-h-[calc(100dvh-13rem)] md:flex-row"
      style={{
        transform: `translate(${dragDistance}px, ${dragVerticalDistance}px)`
      }}
    >
      <div
        className="relative flex min-h-[min(62dvh,34rem)] flex-1 touch-none items-center justify-center bg-muted md:min-h-0"
        data-sip-gesture-surface="true"
      >
        {moment.imageUrl && !imageError ? (
          <img
            alt={imageAlt(moment)}
            className="max-h-[min(62dvh,34rem)] w-full object-contain md:max-h-[calc(100dvh-9rem)]"
            decoding="async"
            draggable={false}
            height={moment.height ?? undefined}
            src={moment.imageUrl}
            width={moment.width ?? undefined}
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-full min-h-64 w-full bg-accent"
          />
        )}
        {dragAction ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full border border-white/30 bg-black/65 px-4 py-2 text-sm font-semibold text-white shadow-lg motion-reduce:transition-none"
          >
            {actionLabel(dragAction)}
          </div>
        ) : null}
        <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1 text-sm font-medium text-white">
          <span aria-hidden="true">{moment.likedByMe ? "♥" : "♡"}</span>{" "}
          {moment.likeCount}
        </span>
      </div>
      {hasDetails ? (
        <div className="grid content-start gap-2 overflow-y-auto p-5 [touch-action:pan-y] md:min-h-0 md:w-[min(28rem,38%)] md:p-7">
          {product ? (
            moment.product.id &&
            moment.product.slug &&
            moment.product.name &&
            moment.product.brandSlug ? (
              <Link
                className="break-words text-2xl font-semibold leading-8 hover:underline"
                to={`/drinks/${encodeURIComponent(moment.product.brandSlug)}/${encodeURIComponent(moment.product.slug)}`}
              >
                {product}
              </Link>
            ) : (
              <h2 className="break-words text-2xl font-semibold leading-8">
                {product}
              </h2>
            )
          ) : null}
          {location ? (
            moment.location.id &&
            moment.location.slug &&
            moment.location.name ? (
              <Link
                className="w-fit break-words text-sm leading-5 text-muted-foreground hover:underline"
                to={`/stores/${encodeURIComponent(moment.location.slug)}`}
              >
                {location}
              </Link>
            ) : (
              <p className="break-words text-sm leading-5 text-muted-foreground">
                {location}
              </p>
            )
          ) : null}
          {author ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {author}
              {relativeTime ? ` · ${relativeTime}` : ""}
            </p>
          ) : null}
          {caption ? (
            <p className="break-words whitespace-pre-wrap pt-1 text-sm leading-6">
              {caption}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function SipMode({
  moments,
  index,
  hasMore,
  loadMoreStatus,
  onAdvance,
  onEnsureLike,
  onEnsureMustTry,
  onExit,
  onLoadMore
}: {
  moments: PublicMoment[];
  index: number;
  hasMore: boolean;
  loadMoreStatus: SipLoadMoreStatus;
  onAdvance: () => void;
  onEnsureLike: (postId: string) => Promise<SipActionResult>;
  onEnsureMustTry: (postId: string) => Promise<SipActionResult>;
  onExit: () => void;
  onLoadMore: () => Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const endTriggerRef = useRef<HTMLButtonElement>(null);
  const loadMoreStatusRef = useRef<HTMLParagraphElement>(null);
  const retryLoadMoreRef = useRef<HTMLButtonElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const helpPanelRef = useRef<HTMLDivElement>(null);
  const didFocusStageRef = useRef(false);
  const lastIndexRef = useRef(index);
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drag, setDrag] = useState({
    action: null as SipAction | null,
    x: 0,
    y: 0
  });
  const [pending, setPending] = useState<SipAction | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);
  const moment = moments[index] ?? null;
  const hadMomentRef = useRef(Boolean(moment));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    queueMicrotask(() => helpTriggerRef.current?.focus());
  }, []);

  useDismissiblePopover({
    open: helpOpen,
    onClose: closeHelp,
    popoverRef: helpPanelRef,
    triggerRef: helpTriggerRef
  });

  useEffect(() => {
    if (helpOpen) return;
    const momentArrived = Boolean(moment) && !hadMomentRef.current;
    hadMomentRef.current = Boolean(moment);
    if (!moment && hasMore) {
      queueMicrotask(() => {
        if (loadMoreStatus === "error") {
          retryLoadMoreRef.current?.focus();
        } else {
          loadMoreStatusRef.current?.focus();
        }
      });
      return;
    }
    if (!moment && !hasMore) {
      queueMicrotask(() => endTriggerRef.current?.focus());
      return;
    }
    const indexChanged = lastIndexRef.current !== index;
    lastIndexRef.current = index;
    if (!didFocusStageRef.current || indexChanged || momentArrived) {
      queueMicrotask(() => stageRef.current?.focus());
      didFocusStageRef.current = true;
    }
  }, [hasMore, helpOpen, index, loadMoreStatus, moment]);

  useEffect(() => {
    if (helpOpen) {
      queueMicrotask(() =>
        helpPanelRef.current
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus()
      );
    }
  }, [helpOpen]);

  useEffect(() => {
    if (
      !hasMore ||
      loadMoreStatus !== "idle" ||
      moments.length === 0 ||
      moments.length - index > 2
    ) {
      return;
    }
    void onLoadMore();
  }, [hasMore, index, loadMoreStatus, moments.length, onLoadMore]);

  const clearPointer = useCallback(() => {
    pointerRef.current = null;
    setDrag({ action: null, x: 0, y: 0 });
  }, []);

  const runAction = useCallback(
    async (action: SipAction) => {
      if (!moment || pendingRef.current || helpOpen) return;
      pendingRef.current = true;
      setPending(action);
      setFeedback(null);
      setFeedbackError(false);
      let result: SipActionResult;
      try {
        result =
          action === "skip"
            ? { ok: true }
            : action === "like"
              ? await onEnsureLike(moment.id)
              : await onEnsureMustTry(moment.id);
      } catch {
        result = {
          ok: false,
          message: "That action could not be completed. Please try again."
        };
      }
      if (!mountedRef.current) return;
      if (!result.ok) {
        setFeedback(result.message);
        setFeedbackError(true);
        pendingRef.current = false;
        setPending(null);
        return;
      }
      setFeedback(
        action === "skip" ? "Skipped" : `${actionLabel(action)} saved`
      );
      onAdvance();
      pendingRef.current = false;
      setPending(null);
    },
    [helpOpen, moment, onAdvance, onEnsureLike, onEnsureMustTry]
  );

  const handleOverlayKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "Escape" ||
      helpOpen ||
      event.target === stageRef.current
    ) {
      return;
    }
    event.preventDefault();
    onExit();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      pendingRef.current ||
      helpOpen ||
      (event.target instanceof HTMLElement &&
        (Boolean(event.target.closest("a,button,input,select,textarea")) ||
          !event.target.closest("[data-sip-gesture-surface]")))
    ) {
      return;
    }
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.startX;
    const y = event.clientY - pointer.startY;
    setDrag({ action: sipDirection(x, y), x, y });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.startX;
    const y = event.clientY - pointer.startY;
    const rect = event.currentTarget.getBoundingClientRect();
    const action = resolveSipAction(x, y, rect.width, rect.height);
    clearPointer();
    if (action) void runAction(action);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || helpOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onExit();
      return;
    }
    const action =
      event.key === "ArrowLeft"
        ? "skip"
        : event.key === "ArrowRight"
          ? "like"
          : event.key === "ArrowUp"
            ? "must_try"
            : null;
    if (!action) return;
    event.preventDefault();
    void runAction(action);
  };

  let content: ReactNode;
  if (!moment) {
    content = hasMore ? (
      <div className="grid max-w-md gap-3 text-center">
        {loadMoreStatus === "loading" ? (
          <p ref={loadMoreStatusRef} role="status" tabIndex={-1}>
            Loading more Moments…
          </p>
        ) : loadMoreStatus === "error" ? (
          <>
            <p>More Moments couldn’t load.</p>
            <button
              ref={retryLoadMoreRef}
              className="mx-auto rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold hover:bg-accent"
              type="button"
              onClick={() => void onLoadMore()}
            >
              Try again
            </button>
          </>
        ) : (
          <p role="status">Loading more Moments…</p>
        )}
      </div>
    ) : (
      <div className="grid max-w-md gap-3 text-center">
        <p className="text-2xl font-semibold">That’s all for now 🧋</p>
        <p className="text-sm text-muted-foreground">
          You’ve caught up on the latest Moments.
        </p>
        <button
          ref={endTriggerRef}
          className="mx-auto rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground"
          type="button"
          onClick={onExit}
        >
          Back to Gallery
        </button>
      </div>
    );
  } else {
    content = (
      <div className="grid min-h-0 w-full max-w-5xl gap-4">
        <div
          ref={stageRef}
          aria-label={`Sip Mode, Moment ${index + 1}`}
          className="flex min-h-0 w-full items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          role="region"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={clearPointer}
          onPointerCancel={clearPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <SipCard
            moment={moment}
            dragAction={drag.action}
            dragX={drag.x}
            dragY={drag.y}
          />
        </div>
        <div
          aria-label="Sip actions"
          className="flex justify-center gap-2"
          role="group"
        >
          <button
            aria-label="Skip this Moment"
            className="rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            type="button"
            onClick={() => void runAction("skip")}
          >
            Skip
          </button>
          <button
            aria-label="Like this Moment"
            aria-pressed={moment.likedByMe}
            className="rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            type="button"
            onClick={() => void runAction("like")}
          >
            Like
          </button>
          <button
            aria-label="Must Try this Moment"
            aria-pressed={moment.mustTryByMe}
            className="rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            type="button"
            onClick={() => void runAction("must_try")}
          >
            Must Try
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-30 flex min-h-[100dvh] flex-col bg-background text-foreground"
      onKeyDown={handleOverlayKeyDown}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <h1 className="text-base font-semibold">Sip Mode</h1>
        <div className="flex items-center gap-2">
          <button
            ref={helpTriggerRef}
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
            aria-label="How Sip Mode works"
            className="grid size-10 place-items-center rounded-full border border-border bg-card text-sm font-semibold hover:bg-accent"
            type="button"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
          <button
            className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent"
            type="button"
            onClick={onExit}
          >
            Exit
          </button>
        </div>
        {helpOpen ? (
          <div
            ref={helpPanelRef}
            aria-label="Sip Mode help"
            className="absolute right-5 top-16 z-10 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-border bg-card p-5 shadow-xl sm:right-8"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold">How to sip</h2>
              <button
                aria-label="Close Sip Mode help"
                className="rounded-lg px-2 py-1 text-sm hover:bg-accent"
                type="button"
                onClick={closeHelp}
              >
                ×
              </button>
            </div>
            <ul className="mt-4 grid gap-2 text-sm leading-5 text-muted-foreground">
              <li>← Swipe or press Left to Skip</li>
              <li>→ Swipe or press Right to Like</li>
              <li>↑ Swipe or press Up to Must Try</li>
              <li>Or use the action buttons below the card</li>
              <li>Press Escape or Exit to return to Gallery</li>
            </ul>
          </div>
        ) : null}
      </header>
      <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-5 pb-8 sm:px-8 md:items-center">
        {content}
      </main>
      {feedback ? (
        <p
          aria-live={feedbackError ? "assertive" : "polite"}
          className={`mx-auto mb-5 max-w-[min(32rem,calc(100vw-2.5rem))] rounded-xl border px-4 py-3 text-center text-sm ${feedbackError ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border bg-card text-muted-foreground"}`}
          role={feedbackError ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}
      {pending ? (
        <p aria-live="polite" className="sr-only" role="status">
          {`${actionLabel(pending)} in progress`}
        </p>
      ) : null}
    </div>
  );
}
