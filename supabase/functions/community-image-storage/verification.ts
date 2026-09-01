export type VerifiedImage = {
  contentType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
  etag: string;
};

export type VerificationResult =
  | { kind: "success"; image: VerifiedImage }
  | { kind: "terminal_failure" }
  | { kind: "retryable_failure" };

const terminalImageErrors = new Set([
  "image_too_large",
  "invalid_webp_container",
  "invalid_webp_chunk",
  "unsupported_webp_chunk",
  "forbidden_webp_metadata",
  "image_decode_failed",
  "normalized_webp_required",
  "invalid_image_dimensions"
]);

function isTerminalVerifierFailure(status: number, error: unknown) {
  if (typeof error !== "string") return false;
  if (status === 400) return terminalImageErrors.has(error);
  if (status === 404) return error === "source_not_found";
  if (status === 409) return error === "final_object_exists";
  if (status === 412) return error === "source_changed";
  return false;
}

export function shouldDeleteQuarantine(result: VerificationResult) {
  return result.kind === "terminal_failure";
}

export async function verifyAndPromote(input: {
  verifierUrl: string;
  verifierToken: string;
  sourceKey: string;
  finalKey: string;
  expectedEtag: string;
}): Promise<VerificationResult> {
  let verifierResponse: Response;
  try {
    verifierResponse = await fetch(
      `${input.verifierUrl.replace(/\/+$/, "")}/verify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.verifierToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceKey: input.sourceKey,
          finalKey: input.finalKey,
          expectedEtag: input.expectedEtag
        })
      }
    );
  } catch {
    return { kind: "retryable_failure" };
  }

  const body = (await verifierResponse.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!verifierResponse.ok) {
    if (
      verifierResponse.status >= 500 ||
      verifierResponse.status === 408 ||
      verifierResponse.status === 429
    )
      return { kind: "retryable_failure" };
    return {
      kind: isTerminalVerifierFailure(verifierResponse.status, body?.error)
        ? "terminal_failure"
        : "retryable_failure"
    };
  }
  if (
    !body ||
    body.finalKey !== input.finalKey ||
    body.sourceKey !== input.sourceKey ||
    body.contentType !== "image/webp" ||
    typeof body.finalEtag !== "string" ||
    typeof body.byteSize !== "number" ||
    typeof body.width !== "number" ||
    typeof body.height !== "number"
  ) {
    return { kind: "retryable_failure" };
  }
  return {
    kind: "success",
    image: {
      contentType: "image/webp",
      byteSize: body.byteSize,
      width: body.width,
      height: body.height,
      etag: body.finalEtag
    }
  };
}
