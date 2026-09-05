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

function actionIcon(action: SipAction, pressed = false) {
  if (action === "skip") return "×";
  if (action === "must_try") return "★";
  return pressed ? "♥" : "♡";
}

function exitVector(action: SipAction) {
  if (action === "skip") return { x: "-120vw", y: "0px" };
  if (action === "like") return { x: "120vw", y: "0px" };
  return { x: "0px", y: "-120vh" };
}

function SipCard({
  moment,
  dragAction,
  dragX,
  dragY,
  isPreview = false,
  isExiting = false,
  isDragging = false,
  onTransitionEnd
}: {
  moment: PublicMoment;
  dragAction: SipAction | null;
  dragX: number;
  dragY: number;
  isPreview?: boolean;
  isExiting?: boolean;
  isDragging?: boolean;
  onTransitionEnd?: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const location = publicLocation(moment);
  const product = publicProduct(moment);
  const author = moment.displayName?.trim() || null;
  const caption = moment.caption.trim();
  const relativeTime = author ? relativeMomentTime(moment.submittedAt) : null;
  const hasDetails = Boolean(product || location || author || caption);
  const rotation = Math.max(-10, Math.min(10, dragX / 24));
  const vector = isExiting && dragAction ? exitVector(dragAction) : null;

  useEffect(() => setImageError(false), [moment.id]);

  return (
    <article
      aria-hidden={isPreview || undefined}
      aria-label={isPreview ? undefined : "Current Moment"}
      className={`sip-card relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl md:max-h-[calc(100dvh-13rem)] md:flex-row ${isPreview ? "sip-card-preview" : "z-10"} ${isExiting ? "sip-card-exiting" : ""} ${isDragging ? "sip-card-dragging" : ""}`}
      style={{
        transform: isPreview
          ? "scale(0.97) translateY(0.5rem)"
          : vector
            ? `translate3d(${vector.x}, ${vector.y}, 0) rotate(${rotation}deg)`
            : `translate3d(${dragX}px, ${dragY}px, 0) rotate(${rotation}deg)`
      }}
      onTransitionEnd={onTransitionEnd}
    >
      <div
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center bg-muted md:min-h-0"
        data-sip-gesture-surface="true"
      >
        {moment.imageUrl && !imageError ? (
          <img
            alt={imageAlt(moment)}
            className="h-full max-h-full w-full object-contain md:max-h-[calc(100dvh-9rem)]"
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
        {dragAction && !isPreview ? (
          <div
            aria-hidden="true"
            className="sip-drag-feedback pointer-events-none absolute inset-x-0 top-1/2 mx-auto grid size-16 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/65 text-4xl font-semibold text-white shadow-lg"
          >
            {actionIcon(dragAction)}
          </div>
        ) : null}
        <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1 text-sm font-medium text-white">
          <span aria-hidden="true">{moment.likedByMe ? "♥" : "♡"}</span>{" "}
          {moment.likeCount}
        </span>
      </div>
      {hasDetails ? (
        <div className="grid max-h-[30%] content-start gap-2 overflow-y-auto p-4 [touch-action:pan-y] md:min-h-0 md:max-h-none md:w-[min(28rem,38%)] md:p-7">
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
    startTime: number;
  } | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drag, setDrag] = useState({
    action: null as SipAction | null,
    x: 0,
    y: 0
  });
  const [exitAction, setExitAction] = useState<SipAction | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<SipAction | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);
  const moment = moments[index] ?? null;
  const hadMomentRef = useRef(Boolean(moment));

  const finishExit = useCallback(() => {
    if (!mountedRef.current) return;
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setExitAction(null);
    setPending(null);
    pendingRef.current = false;
    setDrag({ action: null, x: 0, y: 0 });
    onAdvance();
  }, [onAdvance]);

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null)
        window.clearTimeout(exitTimerRef.current);
    },
    []
  );

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
    setDragging(false);
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
      setExitAction(action);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      exitTimerRef.current = window.setTimeout(
        finishExit,
        reduceMotion ? 0 : 260
      );
    },
    [finishExit, helpOpen, moment, onEnsureLike, onEnsureMustTry]
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
      startY: event.clientY,
      startTime: performance.now()
    };
    setDragging(true);
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
    const elapsed = Math.max(1, performance.now() - pointer.startTime);
    const action = resolveSipAction(
      x,
      y,
      rect.width,
      rect.height,
      x / elapsed,
      y / elapsed
    );
    pointerRef.current = null;
    setDragging(false);
    if (action) {
      void runAction(action);
    } else {
      setDrag({ action: null, x: 0, y: 0 });
    }
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
      <div className="grid min-h-0 w-full max-w-5xl grid-rows-[minmax(0,1fr)_auto] gap-3">
        <div
          ref={stageRef}
          aria-label={`Sip Mode, Moment ${index + 1}`}
          className="relative flex min-h-0 w-full items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          role="region"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={clearPointer}
          onPointerCancel={clearPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {moments[index + 1] ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <SipCard
                isPreview
                moment={moments[index + 1]}
                dragAction={null}
                dragX={0}
                dragY={0}
              />
            </div>
          ) : null}
          <SipCard
            moment={moment}
            dragAction={exitAction ?? drag.action}
            dragX={drag.x}
            dragY={drag.y}
            isExiting={exitAction !== null}
            isDragging={dragging}
            onTransitionEnd={finishExit}
          />
        </div>
        <div
          aria-label="Sip actions"
          className="flex justify-center gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          role="group"
        >
          <button
            aria-label="Skip this Moment"
            className="sip-action-button rounded-full border border-border bg-card text-xl text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            type="button"
            onClick={() => void runAction("skip")}
          >
            <span aria-hidden="true">{actionIcon("skip")}</span>
          </button>
          <button
            aria-label="Must Try this Moment"
            aria-pressed={moment.mustTryByMe}
            className="sip-action-button rounded-full border border-border bg-card text-xl text-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            type="button"
            onClick={() => void runAction("must_try")}
          >
            <span aria-hidden="true">{actionIcon("must_try")}</span>
          </button>
          <button
            aria-label={
              moment.likedByMe ? "Unlike this Moment" : "Like this Moment"
            }
            aria-pressed={moment.likedByMe}
            className="sip-action-button rounded-full border border-border bg-card text-xl text-rose-600 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            type="button"
            onClick={() => void runAction("like")}
          >
            <span aria-hidden="true">
              {actionIcon("like", moment.likedByMe)}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="sip-mode-shell fixed inset-0 z-30 flex min-h-[100dvh] flex-col overflow-hidden bg-background text-foreground"
      onKeyDown={handleOverlayKeyDown}
    >
      <header className="relative flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">Sip Mode</h1>
          <button
            ref={helpTriggerRef}
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
            aria-label="How Sip Mode works"
            className="grid size-9 place-items-center rounded-full border border-border bg-card text-sm font-semibold hover:bg-accent"
            type="button"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Exit"
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
      <main
        className={`flex min-h-0 flex-1 items-start justify-center overflow-hidden px-3 py-2 sm:px-8 ${feedback ? "md:items-start" : "md:items-center"}`}
      >
        {content}
      </main>
      {feedback ? (
        <p
          aria-live={feedbackError ? "assertive" : "polite"}
          className={`mx-auto mb-2 max-w-[min(32rem,calc(100vw-2.5rem))] rounded-xl border px-4 py-2 text-center text-sm ${feedbackError ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border bg-card text-muted-foreground"}`}
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
