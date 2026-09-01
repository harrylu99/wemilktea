import { afterEach, describe, expect, test } from "bun:test";
import { shouldDeleteQuarantine, verifyAndPromote } from "./verification";

const input = {
  verifierUrl: "https://verifier.example",
  verifierToken: "test-token",
  sourceKey: "community-quarantine/owner/post/upload.webp",
  finalKey: "community/owner/post/upload.webp",
  expectedEtag: "etag"
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Moments verifier failure handling", () => {
  test("keeps quarantine for a verifier 5xx", async () => {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });

    const result = await verifyAndPromote(input);

    expect(result).toEqual({ kind: "retryable_failure" });
    expect(shouldDeleteQuarantine(result)).toBe(false);
  });

  test("keeps quarantine when a 5xx carries a terminal-looking error", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "invalid_image_dimensions" }), {
        status: 503
      });

    const result = await verifyAndPromote(input);

    expect(result).toEqual({ kind: "retryable_failure" });
    expect(shouldDeleteQuarantine(result)).toBe(false);
  });

  test("keeps quarantine for an ambiguous successful response", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ finalKey: input.finalKey }), {
        status: 200
      });

    const result = await verifyAndPromote(input);

    expect(result).toEqual({ kind: "retryable_failure" });
    expect(shouldDeleteQuarantine(result)).toBe(false);
  });

  test("cleans terminal verifier rejection", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "invalid_image_dimensions" }), {
        status: 400
      });

    const result = await verifyAndPromote(input);

    expect(result).toEqual({ kind: "terminal_failure" });
    expect(shouldDeleteQuarantine(result)).toBe(true);
  });

  test("keeps quarantine for verifier authentication failures", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "source_changed" }), {
        status: 401
      });

    const result = await verifyAndPromote(input);

    expect(result).toEqual({ kind: "retryable_failure" });
    expect(shouldDeleteQuarantine(result)).toBe(false);
  });

  test("keeps quarantine for unknown client errors", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "unexpected_protocol_error" }), {
        status: 422
      });

    const result = await verifyAndPromote(input);

    expect(result).toEqual({ kind: "retryable_failure" });
    expect(shouldDeleteQuarantine(result)).toBe(false);
  });

  test("returns verified metadata on success", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          sourceKey: input.sourceKey,
          finalKey: input.finalKey,
          contentType: "image/webp",
          finalEtag: "final-etag",
          byteSize: 123,
          width: 640,
          height: 480
        }),
        { status: 200 }
      );

    const result = await verifyAndPromote(input);

    expect(result).toEqual({
      kind: "success",
      image: {
        contentType: "image/webp",
        etag: "final-etag",
        byteSize: 123,
        width: 640,
        height: 480
      }
    });
    expect(shouldDeleteQuarantine(result)).toBe(false);
  });
});
