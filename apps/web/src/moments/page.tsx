import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent
} from "react";
import { Link } from "react-router-dom";
import { PublicFooter } from "../public-footer";
import { PublicHeader } from "../public-header";
import { Seo } from "../seo";
import { useDismissiblePopover } from "../use-dismissible-popover";
import {
  loadOwnMomentIds,
  loadPublicMomentsPage,
  momentReportReasons,
  type MomentReportReason,
  type MomentsCursor,
  type PublicMoment
} from "./data";
import { ensurePublicWriteIdentity } from "./identity";
import { ShareMomentComposer } from "./share-composer";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import {
  SipMode,
  type SipActionResult,
  type SipLoadMoreStatus
} from "./sip-mode";

type FeedStatus = "loading" | "ready" | "error";
type LoadMoreStatus = "idle" | "loading" | "error";

function momentImageAlt(moment: PublicMoment) {
  const context = [
    moment.product.name ?? moment.product.text,
    moment.location.name ?? moment.location.text
  ].filter(Boolean);
  return context.length > 0
    ? `Milk tea moment${moment.displayName ? ` shared by ${moment.displayName}` : ""}: ${context.join(" at ")}`
    : "Milk tea moment photo";
}

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

function MomentActions({
  moment,
  isOwn,
  onDelete
}: {
  moment: PublicMoment;
  isOwn: boolean;
  onDelete: (postId: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const reportReasonRef = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<MomentReportReason | "">("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!reportOpen) return;
    queueMicrotask(() => reportReasonRef.current?.focus());
  }, [reportOpen]);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverStyle(null);
      return;
    }

    const updatePopoverPosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const width = Math.max(0, Math.min(176, window.innerWidth - 24));
      const left = Math.min(
        Math.max(margin, rect.right - width),
        Math.max(margin, window.innerWidth - margin - width)
      );
      const height = popover.getBoundingClientRect().height;
      const maxTop = Math.max(margin, window.innerHeight - margin - height);
      const belowTop = rect.bottom + gap;
      const aboveTop = rect.top - gap - height;
      const top =
        belowTop + height <= window.innerHeight - margin ||
        rect.bottom - margin >= height
          ? Math.min(belowTop, maxTop)
          : Math.max(margin, aboveTop);
      setPopoverStyle({ left, top, width });
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition, {
      passive: true
    });
    window.addEventListener("scroll", updatePopoverPosition, {
      capture: true,
      passive: true
    });
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, reportOpen]);

  const close = useCallback(() => {
    setOpen(false);
    setReportOpen(false);
    setReportReason("");
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  useDismissiblePopover({
    open,
    onClose: close,
    popoverRef,
    triggerRef
  });

  const runRpc = async (name: string, args: Record<string, unknown>) => {
    if (!supabase) {
      setError(supabaseConfigurationError ?? "The public app is unavailable.");
      return null;
    }
    const identity = await ensurePublicWriteIdentity();
    if (identity.error) {
      setError("We couldn’t verify your public identity. Please try again.");
      return null;
    }
    const result = await supabase.rpc(name, args);
    if (result.error) {
      setError("That action could not be completed. Please try again.");
      return null;
    }
    return result;
  };

  const deleteMoment = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this Moment?")
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await runRpc("delete_own_community_post", {
      p_post_id: moment.id
    });
    setPending(false);
    if (!result) return;
    onDelete(moment.id);
    close();
  };

  const reportMoment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportReason) return;
    setPending(true);
    setError(null);
    const result = await runRpc("report_community_post", {
      p_details: null,
      p_post_id: moment.id,
      p_reason: reportReason
    });
    setPending(false);
    if (!result) return;
    setMessage("Report sent");
    close();
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open Moment actions"
        className="grid size-9 place-items-center rounded-full bg-card/90 text-lg text-card-foreground shadow-sm backdrop-blur hover:bg-card"
        type="button"
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          aria-label="Moment actions"
          className="fixed z-20 min-w-44 max-h-[calc(100vh-24px)] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
          role={reportOpen ? "dialog" : "menu"}
          style={{
            ...popoverStyle,
            visibility: popoverStyle ? "visible" : "hidden"
          }}
        >
          {reportOpen ? (
            <form className="grid gap-3 p-3" onSubmit={reportMoment}>
              <label
                className="grid gap-1 text-xs font-semibold"
                htmlFor={`report-${moment.id}`}
              >
                Report reason
                <select
                  ref={reportReasonRef}
                  className="h-10 rounded-lg border border-border bg-card px-2 text-sm font-normal text-foreground"
                  id={`report-${moment.id}`}
                  value={reportReason}
                  onChange={(event) =>
                    setReportReason(
                      event.target.value as MomentReportReason | ""
                    )
                  }
                >
                  <option value="">Choose a reason</option>
                  {momentReportReasons.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  type="button"
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!reportReason || pending}
                  type="submit"
                >
                  {pending ? "Sending…" : "Send report"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                role="menuitem"
                type="button"
                onClick={() => {
                  if (isOwn) {
                    void deleteMoment();
                  } else {
                    setReportOpen(true);
                    setMessage(null);
                  }
                }}
              >
                {isOwn ? "Delete" : "Report"}
              </button>
            </>
          )}
          {!reportOpen && error ? (
            <p className="px-3 pb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p
          className="absolute right-0 top-11 z-20 rounded-lg bg-card px-3 py-2 text-xs text-primary shadow-sm"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function MomentCard({
  moment,
  isOwn,
  onDelete,
  onLikeChange
}: {
  moment: PublicMoment;
  isOwn: boolean;
  onDelete: (postId: string) => void;
  onLikeChange: (postId: string, liked: boolean) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const location = publicLocation(moment);
  const product = publicProduct(moment);
  const author = moment.displayName?.trim() || null;
  const caption = moment.caption.trim();
  const relativeTime = author ? relativeMomentTime(moment.submittedAt) : null;
  const hasDetails = Boolean(
    caption || location || product || author || likeError
  );

  const toggleLike = async () => {
    if (!supabase || likePending) return;
    setLikePending(true);
    setLikeError(null);
    const identity = await ensurePublicWriteIdentity();
    if (identity.error) {
      setLikeError("Likes are unavailable right now.");
      setLikePending(false);
      return;
    }
    const liked = !moment.likedByMe;
    const { error } = await supabase.rpc(
      liked ? "like_community_post" : "unlike_community_post",
      { p_post_id: moment.id }
    );
    if (error) {
      setLikeError("Your Like could not be saved. Please try again.");
    } else {
      onLikeChange(moment.id, liked);
    }
    setLikePending(false);
  };

  return (
    <article className="moments-card relative mb-3 w-full break-inside-avoid overflow-visible rounded-xl border border-border bg-card text-card-foreground">
      <div
        className={`moments-card-media relative overflow-hidden bg-muted ${hasDetails ? "rounded-t-xl" : "rounded-xl"}`}
        style={{
          aspectRatio:
            moment.width && moment.height
              ? `${moment.width} / ${moment.height}`
              : "4 / 3"
        }}
      >
        {moment.imageUrl && !imageError ? (
          <img
            alt={momentImageAlt(moment)}
            className="h-full w-full object-cover"
            decoding="async"
            height={moment.height ?? undefined}
            loading="lazy"
            src={moment.imageUrl}
            width={moment.width ?? undefined}
            onError={() => setImageError(true)}
          />
        ) : (
          <div aria-hidden="true" className="h-full w-full bg-accent" />
        )}
        <button
          aria-label={
            moment.likedByMe ? "Unlike this Moment" : "Like this Moment"
          }
          aria-pressed={moment.likedByMe}
          className="absolute bottom-0 right-0 grid size-11 place-items-end p-2 text-xs font-medium text-white drop-shadow-sm hover:text-white/80 disabled:cursor-wait disabled:opacity-70"
          disabled={likePending}
          type="button"
          onClick={() => void toggleLike()}
        >
          <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2 py-1">
            <span aria-hidden="true">{moment.likedByMe ? "♥" : "♡"}</span>
            {moment.likeCount}
          </span>
        </button>
      </div>
      <div className="absolute right-3 top-3 z-10">
        <MomentActions isOwn={isOwn} moment={moment} onDelete={onDelete} />
      </div>
      {hasDetails ? (
        <div className="grid gap-1 px-3.5 py-3">
          {product ? (
            moment.product.id &&
            moment.product.slug &&
            moment.product.name &&
            moment.product.brandSlug ? (
              <Link
                className="break-words text-xl font-semibold leading-7 hover:underline"
                to={`/drinks/${encodeURIComponent(moment.product.brandSlug)}/${encodeURIComponent(moment.product.slug)}`}
              >
                {product}
              </Link>
            ) : (
              <span className="break-words text-xl font-semibold leading-7">
                {product}
              </span>
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
              <span className="break-words text-sm leading-5 text-muted-foreground">
                {location}
              </span>
            )
          ) : null}
          {author ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {author}
              {relativeTime ? ` · ${relativeTime}` : ""}
            </p>
          ) : null}
          {caption ? (
            <p className="break-words whitespace-pre-wrap pt-1 text-sm leading-5">
              {caption}
            </p>
          ) : null}
          {likeError ? (
            <p className="text-xs text-destructive" role="alert">
              {likeError}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MomentsSkeleton() {
  return (
    <div
      aria-label="Loading Moments"
      className="moments-grid columns-2 gap-3 md:columns-3 md:gap-4 lg:columns-4"
      role="status"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          aria-hidden="true"
          className="moments-card mb-3 inline-block w-full break-inside-avoid rounded-xl border border-border bg-card"
          key={index}
          style={{
            height:
              index % 3 === 0 ? "16rem" : index % 3 === 1 ? "13rem" : "18rem"
          }}
        />
      ))}
    </div>
  );
}

export function MomentsPage() {
  const [moments, setMoments] = useState<PublicMoment[]>([]);
  const [ownMomentIds, setOwnMomentIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<FeedStatus>("loading");
  const [loadMoreStatus, setLoadMoreStatus] = useState<LoadMoreStatus>("idle");
  const [cursor, setCursor] = useState<MomentsCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [mode, setMode] = useState<"gallery" | "sip">("gallery");
  const [sipIndex, setSipIndex] = useState(0);
  const generationRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sipTriggerRef = useRef<HTMLButtonElement>(null);
  const previousModeRef = useRef<"gallery" | "sip">("gallery");
  const galleryScrollYRef = useRef(0);
  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const emptyShareTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const loadInitial = useCallback(async () => {
    const generation = ++generationRef.current;
    setStatus("loading");
    setLoadMoreStatus("idle");
    setMoments([]);
    setCursor(null);
    setHasMore(false);
    setSipIndex(0);

    const [page, ownIds] = await Promise.all([
      loadPublicMomentsPage(),
      loadOwnMomentIds()
    ]);
    if (generation !== generationRef.current) return;
    setOwnMomentIds(ownIds);
    if (page.error || !page.data) {
      setStatus("error");
      return;
    }
    setMoments(page.data);
    setCursor(page.nextCursor);
    setHasMore(page.hasMore);
    setStatus("ready");
  }, []);

  const loadMore = useCallback(async () => {
    if (status !== "ready" || !hasMore || loadMoreStatus === "loading") return;
    const generation = generationRef.current;
    const requestedCursor = cursor;
    setLoadMoreStatus("loading");
    const page = await loadPublicMomentsPage(requestedCursor);
    if (generation !== generationRef.current) return;
    if (page.error || !page.data) {
      setLoadMoreStatus("error");
      return;
    }

    setMoments((current) => {
      const seen = new Set(current.map((moment) => moment.id));
      return [
        ...current,
        ...page.data.filter((moment) => !seen.has(moment.id))
      ];
    });
    setCursor(page.nextCursor);
    setHasMore(page.hasMore);
    setLoadMoreStatus("idle");
  }, [cursor, hasMore, loadMoreStatus, status]);

  useEffect(() => {
    void loadInitial();
    return () => {
      generationRef.current += 1;
    };
  }, [loadInitial]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (
      !sentinel ||
      !hasMore ||
      loadMoreStatus === "error" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadMoreStatus]);

  const updateLike = useCallback((postId: string, liked: boolean) => {
    setMoments((current) =>
      current.map((moment) =>
        moment.id === postId
          ? {
              ...moment,
              likeCount:
                moment.likedByMe === liked
                  ? moment.likeCount
                  : Math.max(0, moment.likeCount + (liked ? 1 : -1)),
              likedByMe: liked
            }
          : moment
      )
    );
  }, []);

  const removeMoment = useCallback((postId: string) => {
    setMoments((current) => current.filter((moment) => moment.id !== postId));
    setOwnMomentIds((current) => {
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
  }, []);

  const ensureLike = useCallback(
    async (postId: string): Promise<SipActionResult> => {
      const currentMoment = moments.find((item) => item.id === postId);
      if (!currentMoment || currentMoment.likedByMe) return { ok: true };
      if (!supabase) {
        return {
          ok: false,
          message:
            supabaseConfigurationError ?? "Likes are unavailable right now."
        };
      }
      const identity = await ensurePublicWriteIdentity();
      if (identity.error) {
        return { ok: false, message: "Likes are unavailable right now." };
      }
      const { error } = await supabase.rpc("like_community_post", {
        p_post_id: postId
      });
      if (error) {
        return {
          ok: false,
          message: "Your Like could not be saved. Please try again."
        };
      }
      updateLike(postId, true);
      return { ok: true };
    },
    [moments, updateLike]
  );

  const ensureMustTry = useCallback(
    async (postId: string): Promise<SipActionResult> => {
      const currentMoment = moments.find((item) => item.id === postId);
      if (!currentMoment) return { ok: true };
      if (!supabase) {
        return {
          ok: false,
          message:
            supabaseConfigurationError ?? "Must Try is unavailable right now."
        };
      }
      const identity = await ensurePublicWriteIdentity();
      if (identity.error) {
        return { ok: false, message: "Must Try is unavailable right now." };
      }
      if (!currentMoment.mustTryByMe) {
        const { error } = await supabase.rpc("save_community_post_must_try", {
          p_post_id: postId
        });
        if (error) {
          return {
            ok: false,
            message: "Must Try could not be saved. Please try again."
          };
        }
      }

      if (!currentMoment.likedByMe) {
        const { error } = await supabase.rpc("like_community_post", {
          p_post_id: postId
        });
        if (error) {
          return {
            ok: false,
            message:
              "Must Try was saved, but Like could not be saved. Please try again."
          };
        }
      }

      setMoments((current) =>
        current.map((item) =>
          item.id === postId
            ? {
                ...item,
                mustTryByMe: true,
                likedByMe: true,
                likeCount: item.likedByMe ? item.likeCount : item.likeCount + 1
              }
            : item
        )
      );
      return { ok: true };
    },
    [moments]
  );

  useLayoutEffect(() => {
    if (
      mode === "gallery" &&
      previousModeRef.current === "sip" &&
      typeof window !== "undefined"
    ) {
      window.scrollTo({
        behavior: "auto",
        left: 0,
        top: galleryScrollYRef.current
      });
      queueMicrotask(() => sipTriggerRef.current?.focus());
    }
    previousModeRef.current = mode;
  }, [mode]);

  const enterSipMode = () => {
    if (status !== "ready" || moments.length === 0) return;
    galleryScrollYRef.current = window.scrollY;
    setMode("sip");
  };

  const exitSipMode = useCallback(() => setMode("gallery"), []);

  if (mode === "sip") {
    return (
      <>
        <Seo
          description="Browse public milk tea Moments from the WeMilktea community."
          path="/moments"
          title="Milk Tea Moments | WeMilktea"
        />
        <SipMode
          hasMore={hasMore}
          index={sipIndex}
          loadMoreStatus={loadMoreStatus as SipLoadMoreStatus}
          moments={moments}
          onAdvance={() => setSipIndex((current) => current + 1)}
          onEnsureLike={ensureLike}
          onEnsureMustTry={ensureMustTry}
          onExit={exitSipMode}
          onLoadMore={loadMore}
        />
      </>
    );
  }

  const showFooter =
    status === "error" ||
    (status === "ready" && !hasMore && loadMoreStatus !== "loading");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Seo
        description="Browse public milk tea Moments from the WeMilktea community."
        path="/moments"
        title="Milk Tea Moments | WeMilktea"
      />
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-10 pt-6 sm:px-8">
        <header className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary">
              MILK TEA MOMENTS
            </p>
            <h1 className="mt-3 text-[32px] font-semibold leading-10">
              What’s Auckland sipping? 🧋
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-6 text-muted-foreground">
              Little milk tea moments shared around the city. Browse the gallery
              or switch to Sip Mode.
            </p>
          </div>
          <div
            aria-label="Moments views"
            className="flex max-w-full items-center gap-2 overflow-x-auto pb-1"
          >
            <div className="flex h-12 w-[190px] shrink-0 items-center rounded-xl border border-border bg-card p-1">
              <span className="flex h-10 w-[86px] shrink-0 items-center rounded-lg bg-accent px-4 py-2 text-xs font-medium text-primary">
                Gallery
              </span>
              <button
                ref={sipTriggerRef}
                aria-pressed={false}
                className="flex h-10 w-[96px] shrink-0 items-center rounded-lg px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={status !== "ready" || moments.length === 0}
                type="button"
                onClick={enterSipMode}
              >
                Sip Mode
              </button>
            </div>
            <button
              ref={shareTriggerRef}
              className="flex h-12 w-[156px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-primary px-6 py-4 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed"
              type="button"
              onClick={() => {
                returnFocusRef.current = shareTriggerRef.current;
                setShareOpen(true);
              }}
            >
              Share your moment
            </button>
            <span className="sr-only" id="sip-mode-status">
              Sip Mode opens the current Moments without reloading the feed.
            </span>
          </div>
        </header>

        {status === "loading" ? (
          <div className="mt-8">
            <MomentsSkeleton />
          </div>
        ) : null}
        {status === "error" ? (
          <section
            className="mt-8 rounded-2xl border border-border bg-card p-6"
            role="alert"
          >
            <h2 className="text-lg font-semibold">
              Moments are taking a break.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn’t load the Gallery right now.
            </p>
            <button
              className="mt-4 rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground"
              type="button"
              onClick={() => void loadInitial()}
            >
              Try again
            </button>
          </section>
        ) : null}
        {status === "ready" && moments.length === 0 && !hasMore ? (
          <section className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary">
              THE GALLERY IS QUIET
            </p>
            <h2 className="mt-3 text-2xl font-semibold">No Moments yet.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Be the first to share what you&apos;re drinking 🧋
            </p>
            <button
              ref={emptyShareTriggerRef}
              className="mt-5 min-h-11 rounded-xl bg-primary px-6 py-4 text-xs font-medium text-primary-foreground"
              type="button"
              onClick={() => {
                returnFocusRef.current = emptyShareTriggerRef.current;
                setShareOpen(true);
              }}
            >
              Share first Moment
            </button>
          </section>
        ) : null}
        {status === "ready" && (moments.length > 0 || hasMore) ? (
          <section aria-label="Public Moments Gallery" className="mt-5">
            <div className="moments-grid columns-2 gap-3 md:columns-3 md:gap-4 lg:columns-4">
              {moments.map((moment) => (
                <MomentCard
                  isOwn={ownMomentIds.has(moment.id)}
                  key={moment.id}
                  moment={moment}
                  onDelete={removeMoment}
                  onLikeChange={updateLike}
                />
              ))}
            </div>
            <div ref={sentinelRef} aria-hidden="true" className="h-1" />
            {loadMoreStatus === "loading" ? (
              <p
                className="py-6 text-center text-xs font-medium text-muted-foreground"
                role="status"
              >
                Loading more moments…
              </p>
            ) : null}
            {loadMoreStatus === "error" ? (
              <div
                className="flex flex-col items-center gap-3 py-6"
                role="alert"
              >
                <p className="text-sm text-muted-foreground">
                  More Moments couldn’t load.
                </p>
                <button
                  className="rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold hover:bg-accent"
                  type="button"
                  onClick={() => void loadMore()}
                >
                  Try again
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
      {showFooter ? <PublicFooter /> : null}
      <ShareMomentComposer
        open={shareOpen}
        returnFocusRef={returnFocusRef}
        onClose={() => setShareOpen(false)}
        onSuccess={() => void loadInitial()}
      />
    </div>
  );
}
