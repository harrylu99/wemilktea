import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useSearchParams } from "react-router-dom";
import { managedImageUrl } from "./image-storage";
import { ConfirmDialog } from "./confirm-dialog";
import {
  fetchMoments,
  moderateMoment,
  normalizeMomentView,
  resolveMomentReport,
  UNRESOLVED_REPORT_COUNT_CHANGED_EVENT,
  type AdminMoment,
  type MomentReport,
  type MomentStatus,
  type MomentView
} from "./moments-data";
import { LoadingRegion, Skeleton } from "./loading";

const reportReasonLabels: Record<MomentReport["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  copyright: "Copyright",
  unsafe: "Unsafe",
  other: "Other"
};

const statusLabels: Record<MomentStatus, string> = {
  draft: "Draft",
  active: "Active",
  hidden: "Hidden",
  removed: "Removed"
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRelativeDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function displayName(moment: AdminMoment) {
  return moment.displayName?.trim() || "Anonymous";
}

function metadataLine(moment: AdminMoment) {
  const store = moment.locationName ?? moment.locationText;
  const drink = moment.productName ?? moment.productText;
  return (
    [store, drink].filter(Boolean).join(" · ") || "No Store or Drink supplied"
  );
}

function statusClass(status: MomentStatus) {
  if (status === "removed") return "border-destructive text-destructive";
  if (status === "hidden") return "border-amber-600 text-amber-700";
  if (status === "draft") return "border-border text-muted-foreground";
  return "border-emerald-700 text-emerald-700";
}

function MomentImage({
  moment,
  large = false
}: {
  moment: AdminMoment;
  large?: boolean;
}) {
  const imageUrl = moment.image
    ? managedImageUrl({
        id: moment.image.id,
        storageKey: moment.image.storageKey,
        altText: null,
        contentType: moment.image.contentType,
        byteSize: moment.image.byteSize
      })
    : null;
  const className = large
    ? "h-56 w-full rounded-lg object-cover"
    : "h-20 w-20 rounded-md object-cover";

  return imageUrl ? (
    <img
      alt={`${displayName(moment)} Moment photo`}
      className={className}
      src={imageUrl}
    />
  ) : (
    <div
      aria-label="Moment image unavailable"
      className={`${className} grid place-items-center bg-muted text-center text-xs text-muted-foreground`}
      role="img"
    >
      Image unavailable
    </div>
  );
}

function LoadingState() {
  return (
    <LoadingRegion
      label="Loading Moments"
      className="space-y-3"
      data-testid="moments-loading"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="flex gap-4 rounded-lg border border-border bg-card p-4"
          key={index}
        >
          <Skeleton className="h-20 w-20 shrink-0 rounded-md" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

function MomentRow({
  moment,
  view,
  onInspect,
  onModerate
}: {
  moment: AdminMoment;
  view: MomentView;
  onInspect: (button: HTMLButtonElement) => void;
  onModerate: (
    moment: AdminMoment,
    status: "active" | "hidden" | "removed"
  ) => void;
}) {
  const isReported = view === "reported";
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center">
      <MomentImage moment={moment} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-semibold">{displayName(moment)}</h2>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(moment.status)}`}
          >
            {statusLabels[moment.status]}
          </span>
        </div>
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {moment.caption || "No caption"}
        </p>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {metadataLine(moment)} ·{" "}
          {formatRelativeDate(moment.submittedAt ?? moment.createdAt)}
        </p>
      </div>
      {isReported ? (
        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          <span className="text-xs font-medium text-destructive">
            {moment.reports.length} unresolved{" "}
            {moment.reports.length === 1 ? "report" : "reports"}
          </span>
          <button
            className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            type="button"
            onClick={(event) => onInspect(event.currentTarget)}
          >
            Inspect <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
          <button
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium"
            type="button"
            onClick={(event) => onInspect(event.currentTarget)}
          >
            Inspect
          </button>
          {view === "recent" ? (
            <button
              className="min-h-11 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
              type="button"
              onClick={() => onModerate(moment, "hidden")}
            >
              Hide
            </button>
          ) : (
            <button
              className="min-h-11 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
              type="button"
              onClick={() => onModerate(moment, "active")}
            >
              Restore
            </button>
          )}
          <button
            className="min-h-11 rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive"
            type="button"
            onClick={() => onModerate(moment, "removed")}
          >
            Remove
          </button>
        </div>
      )}
    </article>
  );
}

function DetailDrawer({
  moment,
  sourceView,
  isPending,
  onClose,
  onModerate,
  onResolveReport
}: {
  moment: AdminMoment;
  sourceView: MomentView;
  isPending: boolean;
  onClose: () => void;
  onModerate: (
    moment: AdminMoment,
    status: "active" | "hidden" | "removed"
  ) => void;
  onResolveReport: (
    report: MomentReport,
    status: "actioned" | "dismissed"
  ) => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerTitleId = `moment-drawer-title-${moment.id}`;

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.key === "Escape" &&
        !isPending &&
        drawerRef.current &&
        event.target instanceof Node &&
        drawerRef.current.contains(event.target)
      ) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isPending) onClose();
      return;
    }

    if (event.key !== "Tab" || !drawerRef.current) return;

    const elements = focusableElements(drawerRef.current);
    if (elements.length === 0) {
      event.preventDefault();
      drawerRef.current.focus();
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const showReportControls = sourceView === "reported";
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        aria-labelledby={drawerTitleId}
        aria-modal="true"
        className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card p-6 shadow-xl"
        role="dialog"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              {showReportControls
                ? `${moment.reports.length} unresolved reports`
                : `${statusLabels[moment.status]} Moment`}
            </p>
            <h2 className="mt-2 text-2xl font-semibold" id={drawerTitleId}>
              Moment details
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Close Moment details"
            className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            disabled={isPending}
            type="button"
            onClick={onClose}
          >
            Close <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <MomentImage large moment={moment} />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold">{displayName(moment)}</h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(moment.status)}`}
              >
                {statusLabels[moment.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Posted {formatDate(moment.submittedAt ?? moment.createdAt)}
            </p>
            <p className="mt-4 whitespace-pre-wrap break-words font-medium">
              {moment.caption || "No caption"}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              Store:{" "}
              {moment.locationName ?? moment.locationText ?? "Not supplied"}
              <br />
              Drink:{" "}
              {moment.productName ?? moment.productText ?? "Not supplied"}
            </p>
          </div>

          {showReportControls ? (
            <section
              aria-labelledby="moment-report-details"
              className="rounded-lg border border-destructive bg-red-50 p-4"
            >
              <h3
                className="text-sm font-semibold text-destructive"
                id="moment-report-details"
              >
                Report details
              </h3>
              <p className="mt-2 text-sm font-semibold">
                {moment.reports.length} unresolved{" "}
                {moment.reports.length === 1 ? "report" : "reports"}
              </p>
              <div className="mt-3 space-y-3">
                {moment.reports.map((report) => (
                  <div
                    className="rounded-md border border-border bg-card p-3"
                    key={report.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {reportReasonLabels[report.reason]} ·{" "}
                          {formatDate(report.created_at)}
                        </p>
                        {report.details ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                            {report.details}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          className="min-h-11 rounded-md border border-border px-3 py-2 text-xs font-medium"
                          disabled={isPending}
                          type="button"
                          onClick={() => onResolveReport(report, "dismissed")}
                        >
                          Dismiss
                        </button>
                        <button
                          className="min-h-11 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground"
                          disabled={isPending}
                          type="button"
                          onClick={() => onResolveReport(report, "actioned")}
                        >
                          Mark actioned
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Report actions target one report ID. Hide and Remove do not
                resolve other reports.
              </p>
            </section>
          ) : null}

          <section
            aria-labelledby="moment-moderation-actions"
            className="rounded-lg border border-border p-4"
          >
            <h3
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              id="moment-moderation-actions"
            >
              Moderation actions
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {moment.status === "active" ? (
                <button
                  className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                  disabled={isPending}
                  type="button"
                  onClick={() => onModerate(moment, "hidden")}
                >
                  Hide
                </button>
              ) : null}
              {moment.status === "hidden" ? (
                <button
                  className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                  disabled={isPending}
                  type="button"
                  onClick={() => onModerate(moment, "active")}
                >
                  Restore
                </button>
              ) : null}
              {moment.status !== "removed" && moment.status !== "draft" ? (
                <button
                  className="min-h-11 rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive"
                  disabled={isPending}
                  type="button"
                  onClick={() => onModerate(moment, "removed")}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Hide is reversible. Remove ends public availability and does not
              offer normal restore.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function MomentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = normalizeMomentView(searchParams.get("view"));
  const [moments, setMoments] = useState<AdminMoment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<AdminMoment | null>(
    null
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminMoment | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const inspectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setIsLoading(true);
    try {
      const nextMoments = await fetchMoments(view);
      if (generation !== loadGenerationRef.current) return;
      setMoments(nextMoments);
      setErrorMessage(null);
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      setErrorMessage(
        error instanceof Error ? error.message : "Moments could not be loaded."
      );
    } finally {
      if (generation === loadGenerationRef.current) setIsLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeView = (nextView: MomentView) => {
    if (nextView === "reported") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ view: nextView }, { replace: true });
    }
  };

  const closeDrawer = useCallback(() => {
    setSelectedMoment(null);
    requestAnimationFrame(() => inspectTriggerRef.current?.focus());
  }, []);

  const refreshAfterMutation = useCallback(async () => {
    await load();
  }, [load]);

  const runModeration = useCallback(
    async (
      moment: AdminMoment,
      status: "active" | "hidden" | "removed",
      reason: string | null = null
    ) => {
      const actionKey = `${moment.id}:${status}`;
      setPendingAction(actionKey);
      setFeedbackMessage(null);
      try {
        await moderateMoment(moment.id, status, reason);
        if (selectedMoment?.id === moment.id) {
          closeDrawer();
        } else {
          setSelectedMoment(null);
        }
        setRemoveTarget(null);
        setRemoveReason("");
        setFeedbackMessage(
          `${status === "active" ? "Moment restored" : status === "hidden" ? "Moment hidden" : "Moment removed"}.`
        );
        await refreshAfterMutation();
      } catch (error) {
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "The Moment could not be updated."
        );
      } finally {
        setPendingAction(null);
      }
    },
    [closeDrawer, refreshAfterMutation, selectedMoment]
  );

  const handleModerate = useCallback(
    (moment: AdminMoment, status: "active" | "hidden" | "removed") => {
      if (status === "removed") {
        setRemoveTarget(moment);
        setRemoveReason("");
        return;
      }
      void runModeration(moment, status);
    },
    [runModeration]
  );

  const handleResolveReport = useCallback(
    async (report: MomentReport, status: "actioned" | "dismissed") => {
      setPendingAction(`report:${report.id}`);
      setFeedbackMessage(null);
      try {
        await resolveMomentReport(report.id, status);
        closeDrawer();
        window.dispatchEvent(new Event(UNRESOLVED_REPORT_COUNT_CHANGED_EVENT));
        setFeedbackMessage(
          status === "actioned"
            ? "Report marked actioned."
            : "Report dismissed."
        );
        await refreshAfterMutation();
      } catch (error) {
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "The report could not be updated."
        );
      } finally {
        setPendingAction(null);
      }
    },
    [closeDrawer, refreshAfterMutation]
  );

  const selectedIsPending = useMemo(
    () =>
      Boolean(
        selectedMoment && pendingAction?.startsWith(`${selectedMoment.id}:`)
      ),
    [pendingAction, selectedMoment]
  );

  const viewTitle =
    view === "reported"
      ? "Reported Moments"
      : view === "recent"
        ? "Recent Moments"
        : "Hidden Moments";
  const viewDescription =
    view === "reported"
      ? "Review community reports, inspect the evidence, then resolve a report or take moderation action."
      : view === "recent"
        ? "Newest active Moments for proactive review."
        : "Hidden Moments remain available for reversible moderation.";

  return (
    <section>
      <p className="text-sm font-medium text-primary">Moments</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{viewTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {viewDescription}
          </p>
        </div>
        {view === "reported" ? (
          <span
            className="text-sm font-semibold text-destructive"
            aria-label="Unresolved report count is shown in the queue"
          >
            {moments.reduce(
              (count, moment) => count + moment.reports.length,
              0
            )}{" "}
            unresolved
          </span>
        ) : null}
      </div>

      <div
        aria-label="Moments views"
        className="mt-6 flex flex-wrap gap-2"
        role="tablist"
      >
        {(["reported", "recent", "hidden"] as const).map((tab) => (
          <button
            aria-selected={view === tab}
            className={`min-h-11 rounded-md border px-4 py-2 text-sm font-medium ${view === tab ? "bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"}`}
            key={tab}
            role="tab"
            type="button"
            onClick={() => changeView(tab)}
          >
            {tab === "reported"
              ? "Reported"
              : tab === "recent"
                ? "Recent"
                : "Hidden"}
          </button>
        ))}
      </div>

      {feedbackMessage ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {feedbackMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <div className="mt-6 rounded-lg border border-destructive bg-card p-4">
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
          <button
            className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
            type="button"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {isLoading ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : null}
      {!isLoading && !errorMessage && moments.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {view === "reported"
            ? "No unresolved reports."
            : view === "recent"
              ? "No recent Moments."
              : "No hidden Moments."}
        </p>
      ) : null}
      {!isLoading && !errorMessage && moments.length > 0 ? (
        <div className="mt-6 space-y-3">
          {moments.map((moment) => (
            <MomentRow
              key={moment.id}
              moment={moment}
              view={view}
              onInspect={(button) => {
                inspectTriggerRef.current = button;
                setSelectedMoment(moment);
              }}
              onModerate={handleModerate}
            />
          ))}
        </div>
      ) : null}

      {selectedMoment ? (
        <DetailDrawer
          isPending={
            selectedIsPending || pendingAction?.startsWith("report:") === true
          }
          moment={selectedMoment}
          onClose={closeDrawer}
          onModerate={handleModerate}
          onResolveReport={(report, status) =>
            void handleResolveReport(report, status)
          }
          sourceView={view}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Remove"
        description="Public availability ends. Remove is stronger than Hide and cannot be restored normally."
        isPending={Boolean(
          removeTarget &&
          pendingAction?.startsWith(`${removeTarget.id}:removed`)
        )}
        pendingLabel="Removing…"
        reason={removeReason}
        reasonLabel="Optional moderation reason"
        reasonPlaceholder="Explain why this Moment is being removed"
        title="Remove this Moment?"
        open={removeTarget !== null}
        onCancel={() => {
          if (!pendingAction) {
            setRemoveTarget(null);
            setRemoveReason("");
          }
        }}
        onConfirm={() => {
          if (removeTarget)
            void runModeration(
              removeTarget,
              "removed",
              removeReason.trim() || null
            );
        }}
        onReasonChange={setRemoveReason}
      />
    </section>
  );
}
