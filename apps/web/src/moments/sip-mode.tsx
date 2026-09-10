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
import { MomentsModeSelector } from "./mode-selector";
import { sipDirection, resolveSipAction, type SipAction } from "./sip-gesture";
export type SipLoadMoreStatus = "idle" | "loading" | "error";

export type SipActionResult = { ok: true } | { ok: false; message: string };
export type SipReactionAction = Extract<SipAction, "like" | "must_try">;
export type SipReactionSnapshot = Pick<
  PublicMoment,
  "likedByMe" | "mustTryByMe" | "likeCount"
>;
export type SipReactionOperation = {
  action: SipReactionAction;
  postId: string;
  previous: SipReactionSnapshot;
  version: number;
};

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

function SipActionEffect({ action }: { action: SipAction | null }) {
  if (!action || action === "skip") return null;
  const mustTry = action === "must_try";
  const particles = mustTry ? ["✦", "★", "✦", "·", "✦"] : ["♥", "♥", "·", "·"];

  return (
    <div
      aria-hidden="true"
      className={`sip-action-effect sip-action-effect-${mustTry ? "must-try" : "like"}`}
      data-sip-effect={action}
    >
      <span className="sip-action-effect-core">{mustTry ? "★" : "♥"}</span>
      {particles.map((particle, index) => (
        <span
          className="sip-action-effect-particle"
          data-particle-index={index}
          key={`${particle}-${index}`}
        >
          {particle}
        </span>
      ))}
    </div>
  );
}

function SipCard({
  moment,
  dragAction,
  dragX,
  dragY,
  isPreview = false,
  isExiting = false,
  isDragging = false,
  feedbackProgress = 0,
  previewProgress = 0,
  onTransitionEnd
}: {
  moment: PublicMoment;
  dragAction: SipAction | null;
  dragX: number;
  dragY: number;
  isPreview?: boolean;
  isExiting?: boolean;
  isDragging?: boolean;
  feedbackProgress?: number;
  previewProgress?: number;
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
  const normalizedFeedbackProgress = Math.max(0, Math.min(1, feedbackProgress));
  const normalizedPreviewProgress = Math.max(0, Math.min(1, previewProgress));

  useEffect(() => setImageError(false), [moment.id]);

  return (
    <article
      aria-hidden={isPreview || undefined}
      aria-label={isPreview ? undefined : "Current Moment"}
      className={`sip-card relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl md:max-h-[calc(100dvh-13rem)] md:flex-row ${isPreview ? "sip-card-preview" : "z-10"} ${isExiting ? "sip-card-exiting" : ""} ${isDragging ? "sip-card-dragging" : ""}`}
      style={{
        transform: isPreview
          ? `scale(${0.97 + normalizedPreviewProgress * 0.03}) translateY(${(1 - normalizedPreviewProgress) * 0.5}rem)`
          : vector
            ? `translate3d(${vector.x}, ${vector.y}, 0) rotate(${rotation}deg)`
            : `translate3d(${dragX}px, ${dragY}px, 0) rotate(${rotation}deg)`
      }}
      onTransitionEnd={(event) => {
        if (
          event.target !== event.currentTarget ||
          event.propertyName !== "transform"
        ) {
          return;
        }
        onTransitionEnd?.();
      }}
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
            style={{
              opacity: 0.18 + normalizedFeedbackProgress * 0.7,
              transform: `translateY(-50%) scale(${0.82 + normalizedFeedbackProgress * 0.18})`
            }}
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
            moment.product.brandSlug &&
            !isPreview ? (
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
            moment.location.name &&
            !isPreview ? (
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

export function SipModeLoadingSkeleton() {
  return (
    <div className="sip-mode-shell fixed inset-0 z-30 flex min-h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="relative flex shrink-0 flex-col gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-8 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">Sip Mode</span>
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full border border-border bg-card text-sm font-semibold text-muted-foreground"
            >
              ?
            </span>
          </div>
          <span className="min-h-11 shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground sm:px-5">
            <span className="sm:hidden">+ Share</span>
            <span className="hidden sm:inline">Share your moment</span>
          </span>
        </div>
        <div
          aria-hidden="true"
          aria-label="Moments views"
          className="flex min-h-12 w-full max-w-xs items-center rounded-xl border border-border bg-card p-1"
          role="group"
        >
          <span className="min-h-11 flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
            Gallery
          </span>
          <span className="min-h-11 flex-1 rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground shadow-sm">
            Sip Mode
          </span>
        </div>
      </header>
      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2 sm:px-8">
        <div
          aria-label="Loading Sip Mode"
          className="h-full min-h-0 w-full max-w-5xl"
          role="status"
        >
          <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl items-center justify-center">
            <div className="flex h-full max-h-[min(70dvh,36rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl md:flex-row">
              <div className="min-h-[min(45dvh,24rem)] flex-1 animate-pulse bg-muted md:min-h-0" />
              <div className="flex flex-1 flex-col justify-end gap-3 p-5 sm:p-8">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </main>
      <div
        aria-hidden="true"
        className="flex shrink-0 justify-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-8 sm:pb-4"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <span
            className="size-14 animate-pulse rounded-full border border-border bg-card sm:size-16"
            key={index}
          />
        ))}
      </div>
    </div>
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
  onOptimisticReaction,
  pendingSipReactionPostIds,
  onReactionSettled,
  onRollbackReaction,
  onExit,
  onLoadMore,
  onShare
}: {
  moments: PublicMoment[];
  index: number;
  hasMore: boolean;
  loadMoreStatus: SipLoadMoreStatus;
  onAdvance: () => void;
  onEnsureLike: (postId: string) => Promise<SipActionResult>;
  onEnsureMustTry: (postId: string) => Promise<SipActionResult>;
  onOptimisticReaction: (
    postId: string,
    action: SipReactionAction,
    previous: SipReactionSnapshot
  ) => SipReactionOperation;
  pendingSipReactionPostIds: ReadonlySet<string>;
  onReactionSettled: (operation: SipReactionOperation) => void;
  onRollbackReaction: (operation: SipReactionOperation) => void;
  onExit: () => void;
  onLoadMore: () => Promise<void>;
  onShare: (trigger: HTMLElement) => void;
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
  const exitActionRef = useRef<SipAction | null>(null);
  const exitCompletedRef = useRef(false);
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
  const feedbackErrorRef = useRef(false);
  const feedbackSequenceRef = useRef(0);
  const moment = moments[index] ?? null;
  const hadMomentRef = useRef(Boolean(moment));
  const dragProgress = Math.min(
    1,
    Math.max(Math.abs(drag.x) / 160, Math.max(0, -drag.y) / 120)
  );

  const finishExit = useCallback(() => {
    if (
      !mountedRef.current ||
      exitActionRef.current === null ||
      exitCompletedRef.current
    ) {
      return;
    }
    exitCompletedRef.current = true;
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setExitAction(null);
    setPending(null);
    pendingRef.current = false;
    exitActionRef.current = null;
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
    if (pendingRef.current || exitActionRef.current !== null) return;
    setDrag({ action: null, x: 0, y: 0 });
  }, []);

  const runAction = useCallback(
    (action: SipAction) => {
      if (
        !moment ||
        pendingRef.current ||
        helpOpen ||
        (action !== "skip" && pendingSipReactionPostIds.has(moment.id))
      ) {
        return;
      }
      pendingRef.current = true;
      setPending(action);
      if (!feedbackErrorRef.current) {
        setFeedback(null);
        setFeedbackError(false);
      }
      const feedbackSequence = ++feedbackSequenceRef.current;

      const operation =
        action === "skip"
          ? null
          : onOptimisticReaction(moment.id, action, {
              likedByMe: moment.likedByMe,
              mustTryByMe: moment.mustTryByMe,
              likeCount: moment.likeCount
            });
      if (!feedbackErrorRef.current) {
        setFeedback(
          action === "skip" ? "Skipped" : `${actionLabel(action)} sending…`
        );
      }
      exitActionRef.current = action;
      exitCompletedRef.current = false;
      setExitAction(action);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      exitTimerRef.current = window.setTimeout(
        finishExit,
        reduceMotion ? 0 : 260
      );

      if (operation) {
        const persist = Promise.resolve().then(() =>
          action === "like"
            ? onEnsureLike(operation.postId)
            : onEnsureMustTry(operation.postId)
        );
        void persist
          .then((result) => {
            if (result.ok) {
              if (
                mountedRef.current &&
                feedbackSequenceRef.current === feedbackSequence &&
                !feedbackErrorRef.current
              ) {
                setFeedback(null);
                setFeedbackError(false);
              }
              return;
            }
            onRollbackReaction(operation);
            if (mountedRef.current) {
              feedbackErrorRef.current = true;
              setFeedback(result.message);
              setFeedbackError(true);
            }
          })
          .catch(() => {
            onRollbackReaction(operation);
            if (mountedRef.current) {
              feedbackErrorRef.current = true;
              setFeedback(
                `${actionLabel(action)} wasn’t saved. Please try again.`
              );
              setFeedbackError(true);
            }
          })
          .finally(() => onReactionSettled(operation));
      }
    },
    [
      finishExit,
      helpOpen,
      moment,
      onEnsureLike,
      onEnsureMustTry,
      onOptimisticReaction,
      pendingSipReactionPostIds,
      onReactionSettled,
      onRollbackReaction
    ]
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
  let actionBar: ReactNode = null;
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
              className="mx-auto cursor-pointer rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="mx-auto cursor-pointer rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={onExit}
        >
          Back to Gallery
        </button>
      </div>
    );
  } else {
    content = (
      <div className="h-full min-h-0 w-full max-w-5xl">
        <div
          ref={stageRef}
          aria-label={`Sip Mode, Moment ${index + 1}`}
          className="relative flex h-full min-h-0 w-full items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <SipCard
                isPreview
                moment={moments[index + 1]}
                dragAction={null}
                dragX={0}
                dragY={0}
                previewProgress={exitAction ? 1 : dragProgress}
              />
            </div>
          ) : null}
          <SipCard
            key={moment.id}
            moment={moment}
            dragAction={exitAction ?? drag.action}
            dragX={drag.x}
            dragY={drag.y}
            isExiting={exitAction !== null}
            isDragging={dragging}
            feedbackProgress={exitAction ? 1 : dragProgress}
            onTransitionEnd={finishExit}
          />
          <SipActionEffect action={exitAction} />
        </div>
      </div>
    );
    actionBar = (
      <div
        aria-label="Sip actions"
        className="flex shrink-0 justify-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-8 sm:pb-4"
        role="group"
      >
        <button
          aria-label="Skip this Moment"
          className="sip-action-button cursor-pointer rounded-full border border-border bg-card text-xl text-muted-foreground transition-colors enabled:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending !== null}
          type="button"
          onClick={() => void runAction("skip")}
        >
          <span aria-hidden="true">{actionIcon("skip")}</span>
        </button>
        <button
          aria-label="Must Try this Moment"
          aria-pressed={moment.mustTryByMe}
          className="sip-action-button cursor-pointer rounded-full border border-sky-600 bg-card text-xl text-sky-600 transition-colors enabled:hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-400 dark:text-sky-400 dark:enabled:hover:bg-sky-950"
          disabled={
            pending !== null || pendingSipReactionPostIds.has(moment.id)
          }
          type="button"
          onClick={() => void runAction("must_try")}
        >
          <span aria-hidden="true">{actionIcon("must_try")}</span>
        </button>
        <button
          aria-label="Like this Moment"
          aria-pressed={moment.likedByMe}
          className="sip-action-button cursor-pointer rounded-full border border-border bg-card text-xl text-rose-600 transition-colors enabled:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            pending !== null || pendingSipReactionPostIds.has(moment.id)
          }
          type="button"
          onClick={() => void runAction("like")}
        >
          <span aria-hidden="true">{actionIcon("like", moment.likedByMe)}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="sip-mode-shell fixed inset-0 z-30 flex min-h-[100dvh] flex-col overflow-hidden bg-background text-foreground"
      onKeyDown={handleOverlayKeyDown}
    >
      <header className="relative flex shrink-0 flex-col gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-8 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">Sip Mode</h1>
            <div className="relative">
              <button
                ref={helpTriggerRef}
                aria-expanded={helpOpen}
                aria-haspopup="dialog"
                aria-label="How Sip Mode works"
                className="grid size-9 cursor-pointer place-items-center rounded-full border border-border bg-card text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={() => setHelpOpen(true)}
              >
                ?
              </button>
              {helpOpen ? (
                <div
                  ref={helpPanelRef}
                  aria-label="Sip Mode help"
                  className="absolute left-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(28rem,calc(100dvh-7rem))] w-[min(20rem,calc(100vw-7rem))] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
                  role="dialog"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-semibold">How to sip</h2>
                    <button
                      aria-label="Close Sip Mode help"
                      className="grid size-8 cursor-pointer place-items-center rounded-full border border-border bg-background text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <li>Press Escape or Gallery to return to Gallery</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          <button
            aria-label="Share your moment"
            className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors enabled:hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
            type="button"
            onClick={(event) => onShare(event.currentTarget)}
          >
            <span className="sm:hidden">+ Share</span>
            <span className="hidden sm:inline">Share your moment</span>
          </button>
        </div>
        <MomentsModeSelector
          mode="sip"
          onGallery={onExit}
          onSip={() => undefined}
        />
      </header>
      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2 sm:px-8">
        {content}
        {feedback ? (
          <p
            aria-live={feedbackError ? "assertive" : "polite"}
            className={`pointer-events-none absolute inset-x-3 bottom-2 z-20 mx-auto max-w-[min(32rem,calc(100vw-2.5rem))] rounded-xl border px-4 py-2 text-center text-sm ${feedbackError ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border bg-card text-muted-foreground"}`}
            role={feedbackError ? "alert" : "status"}
          >
            {feedback}
          </p>
        ) : null}
      </main>
      {actionBar}
      {pending ? (
        <p aria-live="polite" className="sr-only" role="status">
          {`${actionLabel(pending)} in progress`}
        </p>
      ) : null}
    </div>
  );
}
