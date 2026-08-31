import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
import { supabase, supabaseConfigurationError } from "../lib/supabase";

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
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<MomentReportReason | "">("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setReportOpen(false);
    setReportReason("");
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
    setReportOpen(false);
    setReportReason("");
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
          className="absolute right-0 top-11 z-20 min-w-44 rounded-xl border border-border bg-popover p-1 shadow-lg"
          role={reportOpen ? "dialog" : "menu"}
        >
          {reportOpen ? (
            <form className="grid gap-3 p-3" onSubmit={reportMoment}>
              <label
                className="grid gap-1 text-xs font-semibold"
                htmlFor={`report-${moment.id}`}
              >
                Report reason
                <select
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
                  onClick={() => setReportOpen(false)}
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
          {!reportOpen && message ? (
            <p className="px-3 pb-2 text-xs text-primary" role="status">
              {message}
            </p>
          ) : null}
        </div>
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
    <article className="moments-card relative mb-4 w-full break-inside-avoid overflow-visible rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div
        className="moments-card-media relative overflow-hidden rounded-t-2xl bg-muted"
        style={{ aspectRatio: `${moment.width} / ${moment.height}` }}
      >
        {moment.imageUrl && !imageError ? (
          <img
            alt={momentImageAlt(moment)}
            className="h-full w-full object-cover"
            decoding="async"
            height={moment.height}
            loading="lazy"
            src={moment.imageUrl}
            width={moment.width}
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
          className="absolute bottom-3 right-3 rounded-full bg-card/90 px-3 py-2 text-sm font-semibold text-card-foreground shadow-sm backdrop-blur hover:bg-card disabled:cursor-wait disabled:opacity-70"
          disabled={likePending}
          type="button"
          onClick={() => void toggleLike()}
        >
          <span aria-hidden="true">{moment.likedByMe ? "♥" : "♡"}</span>{" "}
          {moment.likeCount}
        </button>
      </div>
      <div className="absolute right-3 top-3 z-10">
        <MomentActions isOwn={isOwn} moment={moment} onDelete={onDelete} />
      </div>
      <div className="grid gap-2 p-4">
        {moment.caption.trim() ? (
          <p className="break-words text-sm leading-5">{moment.caption}</p>
        ) : null}
        {location || product ? (
          <div className="grid gap-1 text-xs text-muted-foreground">
            {location ? (
              moment.location.id &&
              moment.location.slug &&
              moment.location.name ? (
                <Link
                  className="w-fit font-semibold text-primary hover:underline"
                  to={`/stores/${encodeURIComponent(moment.location.slug)}`}
                >
                  {location}
                </Link>
              ) : (
                <span>{location}</span>
              )
            ) : null}
            {product ? <span>{product}</span> : null}
          </div>
        ) : null}
        {moment.displayName?.trim() ? (
          <p className="text-xs font-medium text-muted-foreground">
            {moment.displayName}
          </p>
        ) : null}
        {likeError ? (
          <p className="text-xs text-destructive" role="alert">
            {likeError}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function MomentsSkeleton() {
  return (
    <div
      aria-label="Loading Moments"
      className="moments-grid columns-2 gap-4"
      role="status"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          aria-hidden="true"
          className="moments-card mb-4 inline-block w-full break-inside-avoid rounded-2xl border border-border bg-card"
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
  const generationRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadInitial = useCallback(async () => {
    const generation = ++generationRef.current;
    setStatus("loading");
    setLoadMoreStatus("idle");
    setMoments([]);
    setCursor(null);
    setHasMore(false);

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
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") {
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
  }, [hasMore, loadMore]);

  const updateLike = (postId: string, liked: boolean) => {
    setMoments((current) =>
      current.map((moment) =>
        moment.id === postId
          ? {
              ...moment,
              likeCount: Math.max(0, moment.likeCount + (liked ? 1 : -1)),
              likedByMe: liked
            }
          : moment
      )
    );
  };

  const removeMoment = (postId: string) => {
    setMoments((current) => current.filter((moment) => moment.id !== postId));
    setOwnMomentIds((current) => {
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
  };

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
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-10 pt-6 sm:px-8 md:pt-8">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary">
              MILK TEA MOMENTS
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-9 md:text-[40px] md:leading-[48px]">
              A little joy, shared.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-5 text-muted-foreground">
              Discover the cups and places the WeMilktea community is enjoying.
            </p>
          </div>
          <div className="flex items-center gap-2" aria-label="Moments views">
            <span className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
              Gallery
            </span>
            <span
              aria-disabled="true"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
            >
              Sip Mode · soon
            </span>
            <button
              aria-disabled="true"
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
              disabled
              type="button"
            >
              Share your moment · soon
            </button>
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
        {status === "ready" && moments.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary">
              THE GALLERY IS QUIET
            </p>
            <h2 className="mt-3 text-2xl font-semibold">No Moments yet.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Check back soon for community cups and discoveries.
            </p>
          </section>
        ) : null}
        {status === "ready" && moments.length > 0 ? (
          <section aria-label="Public Moments Gallery" className="mt-8">
            <div className="moments-grid columns-2 gap-4 md:columns-3 lg:columns-4 lg:gap-5">
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
    </div>
  );
}
