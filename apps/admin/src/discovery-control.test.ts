import { expect, test } from "bun:test";
import {
  discoveryFeedbackState,
  parseDiscoveryResponse,
  resolveDiscoveryResponse,
  resultHeading
} from "./discovery-control-logic";

const succeededResult = {
  runId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
  status: "succeeded" as const,
  queryCount: 8,
  resultCount: 112,
  newCandidateCount: 8,
  knownCount: 101,
  possibleDuplicateCount: 3,
  errorSummary: null
};

test("distinguishes idle, running, success, and failure feedback", () => {
  expect(discoveryFeedbackState(false, null, null)).toBe("idle");
  expect(discoveryFeedbackState(true, null, null)).toBe("running");
  expect(discoveryFeedbackState(false, null, succeededResult)).toBe("success");
  expect(discoveryFeedbackState(false, "request failed", null)).toBe("failure");
});

test("parses successful discovery feedback without inventing counts", () => {
  const response = parseDiscoveryResponse(succeededResult, null);

  expect(response).toEqual({ kind: "success", result: succeededResult });
  if (response.kind === "success") {
    expect(response.result.newCandidateCount).toBe(8);
    expect(resultHeading(response.result)).toBe("Discovery complete");
  }
});

test("refreshes Candidates after success but not after failure", async () => {
  let refreshCount = 0;
  const refreshCandidates = () => {
    refreshCount += 1;
    return true;
  };

  const success = await resolveDiscoveryResponse(
    succeededResult,
    null,
    refreshCandidates
  );
  await resolveDiscoveryResponse(
    null,
    new Error("request failed"),
    refreshCandidates
  );

  expect(refreshCount).toBe(1);
  expect(success).toMatchObject({
    kind: "success",
    candidatesRefreshed: true
  });
});

test("preserves failed discovery feedback", () => {
  const response = parseDiscoveryResponse(null, new Error("request failed"));

  expect(response).toEqual({
    kind: "error",
    message:
      "The discovery request could not be completed. Please try again or check the server logs."
  });
});

test("failed result feedback is distinct from successful feedback", () => {
  const failedResult = { ...succeededResult, status: "failed" as const };

  expect(discoveryFeedbackState(false, null, failedResult)).toBe("failure");
  expect(resultHeading(failedResult)).toBe("Discovery failed");
});
