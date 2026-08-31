import { describe, expect, test } from "bun:test";
import worker, { inspectWebp } from "./index";

const ownerId = "11111111-1111-4111-8111-111111111111";
const postId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const sourceKey = `community/${ownerId}/${postId}/quarantine/${uploadId}.webp`;
const finalKey = `community/${ownerId}/${postId}/${uploadId}.webp`;
const token = "test-token";

function webpBytes(extraChunk?: string) {
  const chunk = (name: string, bytes: number[]) => [
    ...name.split("").map((character) => character.charCodeAt(0)),
    bytes.length & 0xff,
    (bytes.length >> 8) & 0xff,
    (bytes.length >> 16) & 0xff,
    (bytes.length >> 24) & 0xff,
    ...bytes,
    ...(bytes.length % 2 ? [0] : [])
  ];
  const chunks = [chunk("VP8 ", [1, 2, 3, 4])];
  if (extraChunk) chunks.push(chunk(extraChunk, [1, 2, 3, 4]));
  const payload = [..."WEBP"]
    .map((character) => character.charCodeAt(0))
    .concat(...chunks);
  return new Uint8Array([
    ..."RIFF".split("").map((character) => character.charCodeAt(0)),
    payload.length & 0xff,
    (payload.length >> 8) & 0xff,
    (payload.length >> 16) & 0xff,
    (payload.length >> 24) & 0xff,
    ...payload
  ]);
}

function createEnvironment(
  bytes = webpBytes(),
  infoOverrides: Record<string, unknown> = {}
) {
  const objects = new Map([[sourceKey, { bytes, etag: "source-etag" }]]);
  const bucket = {
    async get(key: string, options?: { onlyIf?: { etagMatches?: string } }) {
      const object = objects.get(key);
      if (!object) return null;
      if (
        options?.onlyIf?.etagMatches &&
        options.onlyIf.etagMatches !== object.etag
      ) {
        return { key, size: object.bytes.byteLength, etag: object.etag };
      }
      return {
        key,
        size: object.bytes.byteLength,
        etag: object.etag,
        body: new Response(object.bytes).body,
        arrayBuffer: async () => object.bytes.buffer
      };
    },
    async head(key: string) {
      const object = objects.get(key);
      return object
        ? {
            key,
            size: object.bytes.byteLength,
            etag: object.etag,
            httpMetadata: objects.has(finalKey)
              ? { contentType: "image/webp" }
              : undefined,
            customMetadata: objects.has(finalKey)
              ? { sourceEtag: "source-etag" }
              : undefined
          }
        : null;
    },
    async put(key: string, value: ArrayBuffer) {
      if (objects.has(key)) return null;
      const stored = new Uint8Array(value);
      objects.set(key, { bytes: stored, etag: "final-etag" });
      return { key, size: stored.byteLength, etag: "final-etag" };
    }
  };
  return {
    BUCKET: bucket,
    VERIFY_TOKEN: token,
    IMAGES: {
      info: async () => ({
        format: "webp",
        fileSize: bytes.byteLength,
        width: 1200,
        height: 800,
        ...infoOverrides
      })
    }
  };
}

async function invoke(
  body: Record<string, unknown>,
  environment = createEnvironment()
) {
  return worker.fetch(
    new Request("https://verifier.example/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }),
    environment as never
  );
}

describe("Moments image verifier", () => {
  test("rejects malformed WebP metadata and preserves the key boundary", async () => {
    expect(inspectWebp(new Uint8Array([1, 2, 3]).buffer).valid).toBe(false);
    const metadataResponse = await invoke(
      {
        sourceKey,
        finalKey,
        expectedEtag: "source-etag"
      },
      createEnvironment(webpBytes("EXIF"))
    );
    expect(metadataResponse.status).toBe(400);

    const wrongKeyResponse = await invoke({
      sourceKey: "community/other/post/quarantine/upload.webp",
      finalKey,
      expectedEtag: "source-etag"
    });
    expect(wrongKeyResponse.status).toBe(400);
  });

  test("rejects decode failures, oversized dimensions, and MIME mismatches", async () => {
    const decodeFailure = await invoke(
      { sourceKey, finalKey, expectedEtag: "source-etag" },
      {
        ...createEnvironment(),
        IMAGES: {
          info: async () => {
            throw new Error("decode failed");
          }
        }
      } as never
    );
    expect(decodeFailure.status).toBe(400);

    const oversized = await invoke(
      { sourceKey, finalKey, expectedEtag: "source-etag" },
      createEnvironment(webpBytes(), { width: 4096, height: 3000 })
    );
    expect(oversized.status).toBe(400);

    const wrongFormat = await invoke(
      { sourceKey, finalKey, expectedEtag: "source-etag" },
      createEnvironment(webpBytes(), { format: "jpeg" })
    );
    expect(wrongFormat.status).toBe(400);
  });

  test("promotes a valid object once and binds reads to its ETag", async () => {
    const environment = createEnvironment();
    const body = { sourceKey, finalKey, expectedEtag: "source-etag" };
    const result = await invoke(body, environment);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      finalKey,
      finalEtag: "final-etag",
      width: 1200,
      height: 800
    });

    const duplicate = await invoke(body, environment);
    expect(duplicate.status).toBe(200);
    const changed = await invoke(
      { ...body, expectedEtag: "new-etag" },
      createEnvironment()
    );
    expect(changed.status).toBe(412);
  });
});
