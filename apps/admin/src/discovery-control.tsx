import {
  storeDiscoveryResultSchema,
  type StoreDiscoveryResult
} from "@wemilktea/validation";
import { useState } from "react";
import { supabase, supabaseConfigurationError } from "./lib/supabase";

function resultHeading(result: StoreDiscoveryResult) {
  if (result.status === "failed") {
    return "Discovery failed";
  }

  return result.errorSummary
    ? "Discovery completed with partial errors"
    : "Discovery complete";
}

export function DiscoveryControl() {
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<StoreDiscoveryResult | null>(null);

  const runDiscovery = async () => {
    setErrorMessage(null);
    setResult(null);

    if (!supabase) {
      setErrorMessage(supabaseConfigurationError);
      return;
    }

    setIsRunning(true);
    const { data, error } = await supabase.functions.invoke("store-discovery", {
      body: {}
    });
    setIsRunning(false);

    if (error) {
      setErrorMessage(
        "The discovery request could not be completed. Please try again or check the server logs."
      );
      return;
    }

    const parsed = storeDiscoveryResultSchema.safeParse(data);

    if (!parsed.success) {
      setErrorMessage("The discovery service returned an invalid response.");
      return;
    }

    setResult(parsed.data);
  };

  return (
    <section className="mt-6 max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Run store discovery</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Searches Auckland businesses through the server-side Google Places
        integration. Results remain candidates for review and are never
        published automatically.
      </p>
      <button
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={isRunning}
        onClick={runDiscovery}
      >
        {isRunning ? "Running discovery…" : "Run store discovery"}
      </button>
      {errorMessage ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {result ? (
        <div className="mt-5 rounded-md bg-muted p-4" aria-live="polite">
          <p className="text-sm font-medium">{resultHeading(result)}</p>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li>{result.resultCount} unique results processed</li>
            <li>{result.newCandidateCount} new candidates</li>
            <li>{result.knownCount} known locations</li>
            <li>{result.possibleDuplicateCount} possible duplicates</li>
          </ul>
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
