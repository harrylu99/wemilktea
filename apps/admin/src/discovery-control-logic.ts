import {
  storeDiscoveryResultSchema,
  type StoreDiscoveryResult
} from "@wemilktea/validation";

export type DiscoveryFeedbackState = "idle" | "running" | "success" | "failure";

export type DiscoveryResponse =
  | { kind: "error"; message: string }
  | { kind: "success"; result: StoreDiscoveryResult };

export function resultHeading(result: StoreDiscoveryResult) {
  if (result.status === "failed") {
    return "Discovery failed";
  }

  return result.errorSummary
    ? "Discovery completed with partial errors"
    : "Discovery complete";
}

export function discoveryFeedbackState(
  isRunning: boolean,
  errorMessage: string | null,
  result: StoreDiscoveryResult | null
): DiscoveryFeedbackState {
  if (isRunning) return "running";
  if (errorMessage || result?.status === "failed") return "failure";
  if (result) return "success";
  return "idle";
}

export function shouldRefreshCandidates(result: StoreDiscoveryResult) {
  return result.status === "succeeded";
}

export function parseDiscoveryResponse(
  data: unknown,
  error: unknown
): DiscoveryResponse {
  if (error) {
    return {
      kind: "error",
      message:
        "The discovery request could not be completed. Please try again or check the server logs."
    };
  }

  const parsed = storeDiscoveryResultSchema.safeParse(data);
  if (!parsed.success) {
    return {
      kind: "error",
      message: "The discovery service returned an invalid response."
    };
  }

  return { kind: "success", result: parsed.data };
}

export async function resolveDiscoveryResponse(
  data: unknown,
  error: unknown,
  onSuccess: () => boolean | Promise<boolean>
) {
  const response = parseDiscoveryResponse(data, error);

  if (response.kind === "success") {
    return {
      ...response,
      candidatesRefreshed: shouldRefreshCandidates(response.result)
        ? await onSuccess()
        : false
    };
  }

  return response;
}
