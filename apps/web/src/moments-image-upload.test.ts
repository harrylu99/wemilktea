import { afterEach, expect, mock, test } from "bun:test";
import type { NormalizedMomentImage } from "./moments-image-normalization";

const postId = "11111111-1111-4111-8111-111111111111";
const authorizationCalls: Array<Record<string, unknown>> = [];
const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
const originalFetch = globalThis.fetch;
let authorizationOverrides: Record<string, unknown> = {};
let omitAuthorizationNormalization = false;

const supabaseMock = {
  functions: {
    invoke: mock(
      async (_name: string, options: { body: Record<string, unknown> }) => {
        authorizationCalls.push(options.body);
        if (options.body.action === "authorize") {
          const data: Record<string, unknown> = {
            uploadUrl: "https://upload.example/upload",
            uploadToken: "upload-token",
            quarantineKey: "community-quarantine/owner/post/upload.webp",
            contentType: options.body.sourceContentType,
            normalization: options.body.normalization,
            expiresIn: 600,
            maxBytes: 10 * 1024 * 1024,
            ...authorizationOverrides
          };
          if (omitAuthorizationNormalization) {
            delete data.normalization;
          }
          return {
            data,
            error: null
          };
        }
        return {
          data: {
            postId,
            imageAssetId: "22222222-2222-4222-8222-222222222222",
            storageKey: "community/owner/post/upload.webp",
            contentType: "image/webp",
            byteSize: 123,
            width: 300,
            height: 400
          },
          error: null
        };
      }
    )
  }
};

mock.module("./lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));

const { MomentImageUploadError, uploadMomentImage } =
  await import("./moments-image-upload");

afterEach(() => {
  authorizationCalls.splice(0);
  fetchCalls.splice(0);
  authorizationOverrides = {};
  omitAuthorizationNormalization = false;
  globalThis.fetch = originalFetch;
  supabaseMock.functions.invoke.mockClear();
});

function installUploadFetch() {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
}

test("keeps browser-normalized uploads on the exact WebP contract", async () => {
  installUploadFetch();
  const file = new File(["webp"], "moment.webp", { type: "image/webp" });
  const normalized: NormalizedMomentImage = {
    normalization: "browser",
    file,
    width: 300,
    height: 400,
    byteSize: file.size,
    contentType: "image/webp"
  };

  await expect(uploadMomentImage(postId, normalized)).resolves.toMatchObject({
    contentType: "image/webp",
    width: 300,
    height: 400
  });

  expect(authorizationCalls[0]).toEqual({
    action: "authorize",
    postId,
    sourceContentType: "image/webp",
    normalization: "browser"
  });
  expect(fetchCalls[0]).toMatchObject({
    url: "https://upload.example/upload",
    init: {
      method: "PUT",
      body: file,
      headers: {
        Authorization: "Bearer upload-token",
        "Content-Type": "image/webp"
      }
    }
  });
});

test("accepts a legacy WebP authorization response without normalization", async () => {
  installUploadFetch();
  omitAuthorizationNormalization = true;
  const file = new File(["webp"], "moment.webp", { type: "image/webp" });
  const normalized: NormalizedMomentImage = {
    normalization: "browser",
    file,
    width: 300,
    height: 400,
    byteSize: file.size,
    contentType: "image/webp"
  };

  await expect(uploadMomentImage(postId, normalized)).resolves.toMatchObject({
    contentType: "image/webp"
  });
  expect(authorizationCalls[0]).toEqual({
    action: "authorize",
    postId,
    sourceContentType: "image/webp",
    normalization: "browser"
  });
  expect(fetchCalls[0]?.init?.headers).toEqual({
    Authorization: "Bearer upload-token",
    "Content-Type": "image/webp"
  });
});

test("uploads a server-normalization fallback with its detected source MIME", async () => {
  installUploadFetch();
  const file = new File(["jpeg bytes"], "moment.jpg", { type: "image/jpeg" });
  const normalized: NormalizedMomentImage = {
    normalization: "server",
    file,
    width: 300,
    height: 400,
    byteSize: file.size,
    contentType: "image/jpeg"
  };

  await expect(uploadMomentImage(postId, normalized)).resolves.toMatchObject({
    contentType: "image/webp"
  });

  expect(authorizationCalls[0]).toEqual({
    action: "authorize",
    postId,
    sourceContentType: "image/jpeg",
    normalization: "server"
  });
  expect(fetchCalls[0]?.init?.headers).toEqual({
    Authorization: "Bearer upload-token",
    "Content-Type": "image/jpeg"
  });
  expect(fetchCalls[0]?.init?.body).toBe(file);
});

test("does not upload when authorization changes the signed source contract", async () => {
  installUploadFetch();
  authorizationOverrides = { contentType: "image/webp" };
  const file = new File(["jpeg bytes"], "moment.jpg", { type: "image/jpeg" });
  const normalized: NormalizedMomentImage = {
    normalization: "server",
    file,
    width: 300,
    height: 400,
    byteSize: file.size,
    contentType: "image/jpeg"
  };

  await expect(uploadMomentImage(postId, normalized)).rejects.toBeInstanceOf(
    MomentImageUploadError
  );
  expect(fetchCalls).toEqual([]);
});

test("does not infer browser normalization for a fallback source", async () => {
  installUploadFetch();
  omitAuthorizationNormalization = true;
  const file = new File(["jpeg bytes"], "moment.jpg", { type: "image/jpeg" });
  const normalized: NormalizedMomentImage = {
    normalization: "server",
    file,
    width: 300,
    height: 400,
    byteSize: file.size,
    contentType: "image/jpeg"
  };

  await expect(uploadMomentImage(postId, normalized)).rejects.toBeInstanceOf(
    MomentImageUploadError
  );
  expect(fetchCalls).toEqual([]);
});
