import { expect, test } from "bun:test";
import { chooseImage } from "./assign-showcase";
import { operatorEnvironmentSchema } from "./config";
import { validateApprovedEntries } from "./import-showcase";
import { discoverShowcaseManifest, searchPexels } from "./pexels-api";
import {
  buildShowcaseStorageKey,
  contentTypeFromResponse,
  isShowcaseStorageKey
} from "./storage";
import { showcaseManifestSchema, type ShowcaseManifestEntry } from "./types";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

const photo = (id: number) => ({
  id,
  width: 1200,
  height: 800,
  url: `https://www.pexels.com/photo/${id}/`,
  photographer: "Example Photographer",
  photographer_url: "https://www.pexels.com/@example",
  src: { large: `https://images.pexels.com/photos/${id}/large.jpeg` }
});

test("validates Pexels search responses and does not expose the API key", async () => {
  let request: RequestInfo | URL | null = null;
  let authorization = "";
  const photos = await searchPexels(
    "milk tea",
    "test-key",
    async (input, init) => {
      request = input;
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return response({ photos: [photo(1)] });
    }
  );

  expect(new URL(String(request)).searchParams.get("query")).toBe("milk tea");
  expect(authorization).toBe("test-key");
  expect(photos[0]?.id).toBe(1);
});

test("rejects invalid Pexels API responses and HTTP failures safely", async () => {
  await expect(
    searchPexels("milk tea", "test-key", async () => response({ nope: true }))
  ).rejects.toThrow("invalid search response");
  await expect(
    searchPexels("milk tea", "test-key", async () =>
      response({}, { status: 429 })
    )
  ).rejects.toThrow("HTTP 429");
});

test("discover creates a bounded review manifest without database or R2 calls", async () => {
  let calls = 0;
  const manifest = await discoverShowcaseManifest("test-key", async () => {
    calls += 1;
    return response({ photos: [photo(1), photo(1), photo(2)] });
  });

  expect(calls).toBeGreaterThan(0);
  expect(showcaseManifestSchema.parse(manifest).entries.length).toBeGreaterThan(
    0
  );
  expect(
    new Set(
      manifest.entries.map(
        (entry) => `${entry.categorySlug}:${entry.externalPhotoId}`
      )
    ).size
  ).toBe(manifest.entries.length);
  expect(manifest.entries.every((entry) => entry.approved === false)).toBe(
    true
  );
});

test("showcase storage keys use the shared namespace and safe extensions", () => {
  const key = buildShowcaseStorageKey("pexels", "12345", "image/jpeg");
  expect(key).toBe("showcase/pexels/12345.jpg");
  expect(isShowcaseStorageKey(key)).toBe(true);
  expect(isShowcaseStorageKey("products/product-id/123.jpg")).toBe(false);
});

test("rejects unsupported downloaded image types", () => {
  const imageResponse = new Response(new Uint8Array([1]), {
    headers: { "content-type": "text/html" }
  });
  expect(() => contentTypeFromResponse(imageResponse)).toThrow(
    "unsupported image content type"
  );
});

test("requires complete server-only configuration", () => {
  expect(
    operatorEnvironmentSchema.safeParse({ PEXELS_API_KEY: "test-key" }).success
  ).toBe(false);
  expect(
    operatorEnvironmentSchema.safeParse({
      PEXELS_API_KEY: "test-key",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "images"
    }).success
  ).toBe(true);
});

test("apply validation keeps only approved entries and rejects duplicate identities", () => {
  const entry: ShowcaseManifestEntry = {
    approved: true,
    categorySlug: "milk-tea",
    searchTerm: "milk tea",
    provider: "pexels",
    externalPhotoId: "123",
    photoUrl: "https://www.pexels.com/photo/123/",
    imageUrl: "https://images.pexels.com/photos/123/large.jpeg",
    photographer: "Example Photographer",
    photographerUrl: "https://www.pexels.com/@example",
    attributionText: "Photo by Example Photographer via Pexels",
    width: 1200,
    height: 800
  };
  const unapproved = { ...entry, approved: false, externalPhotoId: "456" };
  expect(
    validateApprovedEntries(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        entries: [entry, unapproved]
      },
      new Set(["milk-tea"])
    )
  ).toEqual([entry]);
  expect(() =>
    validateApprovedEntries(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        entries: [entry, entry]
      },
      new Set(["milk-tea"])
    )
  ).toThrow("Duplicate manifest photo");
});

test("assignment selection is stable for existing usage and balances new links", () => {
  const images = [
    { imageId: "image-a", categoryId: "category", sortOrder: 0 },
    { imageId: "image-b", categoryId: "category", sortOrder: 1 }
  ];
  expect(chooseImage([], new Map())).toBeNull();
  expect(chooseImage(images, new Map([["image-a", 1]]), () => 0)?.imageId).toBe(
    "image-b"
  );
});
