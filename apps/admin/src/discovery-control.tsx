import { FunctionRegion } from "@supabase/supabase-js";
import type { StoreDiscoveryResult } from "@wemilktea/validation";
import { useState } from "react";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import {
  discoveryFeedbackState,
  resolveDiscoveryResponse,
  resultHeading
} from "./discovery-control-logic";

export function DiscoveryControl({
  onDiscoverySuccess
}: {
  onDiscoverySuccess: () => boolean | Promise<boolean>;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<StoreDiscoveryResult | null>(null);
  const [candidatesRefreshed, setCandidatesRefreshed] = useState(false);

  const runDiscovery = async () => {
    setErrorMessage(null);
    setResult(null);
    setCandidatesRefreshed(false);

    if (!supabase) {
      setErrorMessage(supabaseConfigurationError);
      return;
    }

    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "store-discovery",
        {
          body: {},
          region: FunctionRegion.ApSouth1
        }
      );
      const response = await resolveDiscoveryResponse(
        data,
        error,
        onDiscoverySuccess
      );
      if (response.kind === "error") {
        setErrorMessage(response.message);
        return;
      }

      setCandidatesRefreshed(response.candidatesRefreshed);
      setResult(response.result);
    } catch {
      setErrorMessage(
        "The discovery request could not be completed. Please try again or check the server logs."
      );
    } finally {
      setIsRunning(false);
    }
  };

  const feedbackState = discoveryFeedbackState(isRunning, errorMessage, result);

  return (
    <section
      className="mt-6 max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-busy={feedbackState === "running"}
    >
      <h2 className="text-lg font-semibold">Run store discovery</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Searches Auckland businesses through the server-side Google Places
        integration. Results remain candidates for review and are never
        published automatically.
      </p>
      <button
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={feedbackState === "running"}
        onClick={runDiscovery}
      >
        {isRunning ? "Running discovery…" : "Run store discovery"}
      </button>
      {feedbackState === "running" ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Discovery is running. Candidates will refresh when it finishes.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {result ? (
        <div
          className="mt-5 rounded-md bg-muted p-4"
          aria-live="polite"
          role={result.status === "failed" ? "alert" : "status"}
        >
          <p className="text-sm font-medium">{resultHeading(result)}</p>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li>{result.resultCount} unique results processed</li>
            <li>{result.newCandidateCount} new candidates</li>
            <li>{result.knownCount} known locations</li>
            <li>{result.possibleDuplicateCount} possible duplicates</li>
          </ul>
          {result.status === "succeeded" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {candidatesRefreshed
                ? "Candidates list refreshed."
                : "Candidates list could not be refreshed automatically."}
            </p>
          ) : null}
          {result.errorSummary ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {result.errorSummary}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
