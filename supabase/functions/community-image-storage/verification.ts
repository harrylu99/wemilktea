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

const terminalVerifierErrors = new Set([
  "source_not_found",
  "source_changed",
  "image_too_large",
  "invalid_webp_container",
  "invalid_webp_chunk",
  "unsupported_webp_chunk",
  "forbidden_webp_metadata",
  "image_decode_failed",
  "normalized_webp_required",
  "invalid_image_dimensions",
  "final_object_exists"
]);

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
    return {
      kind:
        typeof body?.error === "string" &&
        terminalVerifierErrors.has(body.error)
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
