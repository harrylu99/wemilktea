import { describe, expect, test } from "bun:test";
import { createMomentsUploadToken } from "../../supabase/functions/_shared/moments-upload-token";
import worker, { inspectWebp, maxImageBytes, readBoundedBody } from "./index";

const ownerId = "11111111-1111-4111-8111-111111111111";
const postId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const sourceKey = `community-quarantine/${ownerId}/${postId}/${uploadId}.webp`;
const finalKey = `community/${ownerId}/${postId}/${uploadId}.webp`;
const token = "test-token";
const uploadTokenSecret = "upload-token-secret";

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

function webpVp8xBytes(flags: number) {
  const bytes = new Uint8Array(42);
  bytes.set(
    [..."RIFF"].map((character) => character.charCodeAt(0)),
    0
  );
  bytes.set(
    [..."WEBP"].map((character) => character.charCodeAt(0)),
    8
  );
  bytes.set(
    [..."VP8X"].map((character) => character.charCodeAt(0)),
    12
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 34, true);
  view.setUint32(16, 10, true);
  bytes[20] = flags;
  bytes.set(
    [..."VP8 "].map((character) => character.charCodeAt(0)),
    30
  );
  view.setUint32(34, 4, true);
  bytes.set([1, 2, 3, 4], 38);
  return bytes;
}

function jpegBytes() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
}

function createEnvironment(
  bytes = webpBytes(),
  infoOverrides: Record<string, unknown> = {},
  withSource = true
) {
  const objects = withSource
    ? new Map([[sourceKey, { bytes, etag: "source-etag" }]])
    : new Map<string, { bytes: Uint8Array; etag: string }>();
  const puts: string[] = [];
  const putValues: ArrayBuffer[] = [];
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
      puts.push(key);
      putValues.push(value);
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
    },
    MOMENTS_APP_ORIGIN: "https://moments.example",
    MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET: uploadTokenSecret,
    puts,
    putValues
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

async function uploadToken(expiresAt = Math.floor(Date.now() / 1000) + 60) {
  return createMomentsUploadToken(
    {
      v: 1,
      purpose: "moments-image-upload",
      ownerUserId: ownerId,
      postId,
      uploadId,
      quarantineKey: sourceKey,
      expiresAt
    },
    uploadTokenSecret
  );
}

async function serverNormalizationToken(
  sourceContentType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
) {
  return createMomentsUploadToken(
    {
      v: 2,
      purpose: "moments-image-upload",
      ownerUserId: ownerId,
      postId,
      uploadId,
      quarantineKey: sourceKey,
      sourceContentType,
      normalization: "server",
      expiresAt: Math.floor(Date.now() / 1000) + 60
    },
    uploadTokenSecret
  );
}

function serverNormalizationEnvironment(
  sourceInfoOverrides: Record<string, unknown> = {}
) {
  const environment = createEnvironment(webpBytes(), {}, false);
  const transformCalls: Array<{
    transform: Record<string, unknown>;
    output: Record<string, unknown>;
  }> = [];
  let infoCalls = 0;
  environment.IMAGES = {
    info: async () => {
      infoCalls += 1;
      if (infoCalls === 1)
        return {
          format: "jpeg",
          fileSize: jpegBytes().byteLength,
          width: 4032,
          height: 3024,
          ...sourceInfoOverrides
        };
      return {
        format: "webp",
        fileSize: webpBytes().byteLength,
        width: 2048,
        height: 1536
      };
    },
    input: () => ({
      transform: (transform: Record<string, unknown>) => ({
        output: async (output: Record<string, unknown>) => {
          transformCalls.push({ transform, output });
          return {
            response: async () =>
              new Response(webpBytes(), {
                headers: { "Content-Type": "image/webp" }
              })
          };
        }
      })
    })
  };
  return { environment, transformCalls };
}

async function invokeUpload(
  body: BodyInit | null,
  authorization?: string,
  headers: Record<string, string> = {},
  environment = createEnvironment(webpBytes(), {}, false)
) {
  return worker.fetch(
    new Request("https://verifier.example/upload", {
      method: "PUT",
      headers: {
        Authorization: authorization ?? `Bearer ${await uploadToken()}`,
        "Content-Type": "image/webp",
        Origin: "https://moments.example",
        ...headers
      },
      body,
      duplex: "half"
    } as RequestInit & { duplex: "half" }),
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
    expect(inspectWebp(webpVp8xBytes(0x30).buffer).valid).toBe(true);
    expect(inspectWebp(webpVp8xBytes(0x08).buffer).valid).toBe(false);
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

  test("accepts a legacy v1 capability as browser-normalized WebP", async () => {
    const environment = createEnvironment(webpBytes(), {}, false);
    const valid = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await uploadToken()}`,
          "Content-Type": "image/webp",
          Origin: "https://moments.example"
        },
        body: webpBytes()
      }),
      environment as never
    );
    expect(valid.status).toBe(200);
    expect(environment.puts).toEqual([sourceKey]);

    const oversized = await invokeUpload(
      new Uint8Array(maxImageBytes + 1),
      undefined,
      { "Content-Length": String(maxImageBytes + 1) },
      environment
    );
    expect(oversized.status).toBe(413);
    expect((oversized as Response).headers.get("Content-Type")).toContain(
      "application/json"
    );
    expect(environment.puts).toEqual([sourceKey]);

    const wrongMime = await invokeUpload(webpBytes(), undefined, {
      "Content-Type": "image/jpeg"
    });
    expect(wrongMime.status).toBe(415);
  });

  test("normalizes a valid fallback source before the WebP quarantine boundary", async () => {
    const { environment, transformCalls } = serverNormalizationEnvironment();
    const upload = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await serverNormalizationToken()}`,
          "Content-Type": "image/jpeg",
          Origin: "https://moments.example"
        },
        body: jpegBytes()
      }),
      environment as never
    );

    expect(upload.status).toBe(200);
    expect(environment.puts).toEqual([sourceKey]);
    expect(Array.from(new Uint8Array(environment.putValues[0]))).toEqual(
      Array.from(webpBytes())
    );
    expect(transformCalls).toEqual([
      {
        transform: { width: 2048, height: 2048, fit: "scale-down" },
        output: { format: "image/webp", quality: 85, anim: false }
      }
    ]);

    const verified = await invoke(
      { sourceKey, finalKey, expectedEtag: "final-etag" },
      environment
    );
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({
      finalKey,
      contentType: "image/webp",
      width: 2048,
      height: 1536
    });
  });

  test("rejects a v2 browser capability for a non-WebP source", async () => {
    const environment = createEnvironment(webpBytes(), {}, false);
    const invalidMode = await createMomentsUploadToken(
      {
        v: 2,
        purpose: "moments-image-upload",
        ownerUserId: ownerId,
        postId,
        uploadId,
        quarantineKey: sourceKey,
        sourceContentType: "image/jpeg",
        normalization: "browser",
        expiresAt: Math.floor(Date.now() / 1000) + 60
      },
      uploadTokenSecret
    );
    const response = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${invalidMode}`,
          "Content-Type": "image/jpeg",
          Origin: "https://moments.example"
        },
        body: jpegBytes()
      }),
      environment as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_upload_mode" });
    expect(environment.puts).toEqual([]);
  });

  test("rejects corrupt, mismatched, and oversized fallback sources before quarantine", async () => {
    const corruptedEnvironment = serverNormalizationEnvironment();
    const corrupted = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await serverNormalizationToken()}`,
          "Content-Type": "image/jpeg",
          Origin: "https://moments.example"
        },
        body: new Uint8Array([1, 2, 3])
      }),
      corruptedEnvironment.environment as never
    );
    expect(corrupted.status).toBe(400);
    expect(corruptedEnvironment.environment.puts).toEqual([]);

    const { environment } = serverNormalizationEnvironment({ width: 8001 });
    const oversized = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await serverNormalizationToken()}`,
          "Content-Type": "image/jpeg",
          Origin: "https://moments.example"
        },
        body: jpegBytes()
      }),
      environment as never
    );
    expect(oversized.status).toBe(400);
    expect(environment.puts).toEqual([]);

    const mismatchedSource = serverNormalizationEnvironment({ format: "png" });
    const mismatchedSourceResponse = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await serverNormalizationToken()}`,
          "Content-Type": "image/jpeg",
          Origin: "https://moments.example"
        },
        body: jpegBytes()
      }),
      mismatchedSource.environment as never
    );
    expect(mismatchedSourceResponse.status).toBe(400);
    expect(mismatchedSource.environment.puts).toEqual([]);
  });

  test("accepts bounded bodies and rejects actual oversized streams", async () => {
    const belowLimit = await readBoundedBody(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        body: new Uint8Array(maxImageBytes - 1)
      })
    );
    expect("bytes" in belowLimit && belowLimit.bytes.byteLength).toBe(
      maxImageBytes - 1
    );

    const atLimit = await readBoundedBody(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        body: new Uint8Array(maxImageBytes)
      })
    );
    expect("bytes" in atLimit && atLimit.bytes.byteLength).toBe(maxImageBytes);

    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(maxImageBytes));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      }
    });
    const oversized = await readBoundedBody(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        body: oversizedStream,
        headers: { "Content-Length": "1" },
        duplex: "half"
      } as RequestInit & { duplex: "half" })
    );
    expect(oversized).toEqual({ status: 413, error: "payload_too_large" });
  });

  test("rejects expired or tampered upload capabilities without writing", async () => {
    const environment = createEnvironment(webpBytes(), {}, false);
    const expired = await createMomentsUploadToken(
      {
        v: 1,
        purpose: "moments-image-upload",
        ownerUserId: ownerId,
        postId,
        uploadId,
        quarantineKey: sourceKey,
        expiresAt: Math.floor(Date.now() / 1000) - 1
      },
      uploadTokenSecret
    );
    const response = await worker.fetch(
      new Request("https://verifier.example/upload", {
        method: "PUT",
        headers: { Authorization: `Bearer ${expired}` },
        body: webpBytes()
      }),
      environment as never
    );
    expect(response.status).toBe(401);
    expect(environment.puts).toEqual([]);

    const invalidKey = await createMomentsUploadToken(
      {
        v: 1,
        purpose: "moments-image-upload",
        ownerUserId: ownerId,
        postId,
        uploadId,
        quarantineKey: `community/${ownerId}/${postId}/${uploadId}.webp`,
        expiresAt: Math.floor(Date.now() / 1000) + 60
      },
      uploadTokenSecret
    );
    const invalidKeyResponse = await invokeUpload(
      webpBytes(),
      `Bearer ${invalidKey}`,
      {},
      environment
    );
    expect(invalidKeyResponse.status).toBe(400);
    expect(environment.puts).toEqual([]);
  });
});
