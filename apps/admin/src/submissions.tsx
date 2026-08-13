import {
  storeSubmissionRowSchema,
  type StoreSubmissionRow
} from "@wemilktea/validation";
import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigurationError } from "./lib/supabase";

const submissionFilters = ["all", "pending", "reviewed"] as const;
type SubmissionFilter = (typeof submissionFilters)[number];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusLabel(status: StoreSubmissionRow["moderation_status"]) {
  return status.replaceAll("_", " ");
}

function isHttpUrl(value: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function SubmissionsPage() {
  const [filter, setFilter] = useState<SubmissionFilter>("pending");
  const [submissions, setSubmissions] = useState<StoreSubmissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }

    const loadSubmissions = async () => {
      const { data, error } = await client
        .from("store_submissions")
        .select(
          "id, store_name, suburb, google_maps_url, official_url, notes, submitter_email, moderation_status, created_at, reviewed_at, reviewed_by"
        )
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage("Submissions could not be loaded. Please try again.");
      } else {
        const parsed = storeSubmissionRowSchema.array().safeParse(data);
        if (!parsed.success) {
          setErrorMessage("Submissions returned an invalid response.");
        } else {
          setSubmissions(parsed.data);
          setErrorMessage(null);
        }
      }
      setIsLoading(false);
    };

    void loadSubmissions();
  }, []);

  const visibleSubmissions = useMemo(
    () =>
      submissions.filter((submission) => {
        if (filter === "all") return true;
        if (filter === "pending")
          return submission.moderation_status === "pending";
        return submission.moderation_status !== "pending";
      }),
    [filter, submissions]
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold">Submissions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Review community suggestions before they enter the canonical store
        workflow.
      </p>

      <div
        className="mt-6 flex flex-wrap gap-2"
        role="group"
        aria-label="Submission filters"
      >
        {submissionFilters.map((value) => (
          <button
            aria-pressed={filter === value}
            className={`rounded-md border border-border px-3 py-2 text-sm font-medium ${filter === value ? "bg-accent text-accent-foreground" : "bg-card"}`}
            key={value}
            type="button"
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? "All"
              : value === "pending"
                ? "Pending"
                : "Reviewed"}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">
            Loading submissions…
          </p>
        ) : null}
        {errorMessage ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleSubmissions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No submissions in this view.
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleSubmissions.length > 0 ? (
          <table className="w-full min-w-[58rem] text-left text-sm">
            <caption className="sr-only">
              Store suggestions submitted by the public
            </caption>
            <thead className="border-b border-border bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">
                  Store
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Reference
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Submitted by
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Status
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Received
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleSubmissions.map((submission) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={submission.id}
                >
                  <td className="max-w-[20rem] px-4 py-3 align-top">
                    <p className="font-semibold">{submission.store_name}</p>
                    <p className="text-muted-foreground">{submission.suburb}</p>
                    {submission.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        {submission.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      {isHttpUrl(submission.google_maps_url) ? (
                        <a
                          className="text-primary underline"
                          href={submission.google_maps_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Maps link
                        </a>
                      ) : null}
                      {isHttpUrl(submission.official_url) ? (
                        <a
                          className="text-primary underline"
                          href={submission.official_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Website / social
                        </a>
                      ) : null}
                      {!submission.google_maps_url && !submission.official_url
                        ? "—"
                        : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {submission.submitter_email ?? "Not provided"}
                  </td>
                  <td className="px-4 py-3 align-top capitalize">
                    {statusLabel(submission.moderation_status)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
                    {formatDate(submission.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
