import { expect, test } from "bun:test";
import { chooseImage } from "./assign-showcase";
import { operatorEnvironmentSchema } from "./config";
import {
  applyApprovedEntries,
  validateApprovedEntries
} from "./import-showcase";
import {
  discoverShowcaseManifest,
  MAX_SHOWCASE_IMAGES_PER_CATEGORY,
  perPageForSearchTerms,
  searchPexels
} from "./pexels-api";
import { showcaseImageIdentityKey } from "./repository";
import {
  buildShowcaseStorageKey,
  contentTypeFromResponse,
  isShowcaseStorageKey
} from "./storage";
import {
  showcaseCategoryConfigs,
  showcaseManifestSchema,
  type ShowcaseManifestEntry
} from "./types";

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
  expect(new URL(String(request)).searchParams.get("per_page")).toBe("10");
  expect(authorization).toBe("test-key");
  expect(photos[0]?.id).toBe(1);
});

test("searchPexels accepts a configurable per-term result size", async () => {
  let request: RequestInfo | URL | null = null;
  await searchPexels(
    "milk tea",
    "test-key",
    async (input) => {
      request = input;
      return response({ photos: [photo(1)] });
    },
    22
  );

  expect(new URL(String(request)).searchParams.get("per_page")).toBe("22");
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

test("discovery spreads requests and caps each category at 40 candidates", async () => {
  const requests: Array<{ query: string; perPage: number }> = [];
  const manifest = await discoverShowcaseManifest("test-key", async (input) => {
    const url = new URL(String(input));
    const perPage = Number(url.searchParams.get("per_page"));
    requests.push({
      query: url.searchParams.get("query") ?? "",
      perPage
    });
    return response({
      photos: Array.from({ length: 100 }, (_, index) =>
        photo(requests.length * 1000 + index)
      )
    });
  });

  for (const category of showcaseCategoryConfigs) {
    const entries = manifest.entries.filter(
      (entry) => entry.categorySlug === category.slug
    );
    expect(entries.length).toBeLessThanOrEqual(
      MAX_SHOWCASE_IMAGES_PER_CATEGORY
    );
    expect(entries.every((entry) => entry.approved === false)).toBe(true);

    const categoryRequests = requests.filter(({ query }) =>
      new Set<string>(category.searchTerms).has(query)
    );
    expect(categoryRequests).toHaveLength(category.searchTerms.length);
    expect(
      categoryRequests.every(
        ({ perPage }) =>
          perPage === perPageForSearchTerms(category.searchTerms.length)
      )
    ).toBe(true);
  }
  expect(
    manifest.entries.filter((entry) => entry.categorySlug === "milk-tea")
  ).toHaveLength(MAX_SHOWCASE_IMAGES_PER_CATEGORY);
});

test("discovery deduplicates Pexels IDs across search terms within a category", async () => {
  const photosBySearchTerm = new Map<string, ReturnType<typeof photo>[]>([
    ["milk tea", [photo(1), photo(2)]],
    ["bubble tea", [photo(2), photo(3)]],
    ["brown sugar boba", [photo(3), photo(4)]]
  ]);
  const manifest = await discoverShowcaseManifest("test-key", async (input) => {
    const query = new URL(String(input)).searchParams.get("query") ?? "";
    return response({ photos: photosBySearchTerm.get(query) ?? [] });
  });

  const milkTeaIds = manifest.entries
    .filter((entry) => entry.categorySlug === "milk-tea")
    .map((entry) => entry.externalPhotoId);
  expect(milkTeaIds).toEqual(["1", "2", "3", "4"]);
  expect(new Set(milkTeaIds).size).toBe(milkTeaIds.length);
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

test("apply skips existing pool identities before downloading an image", async () => {
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
  let downloaded = false;
  const category = {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "milk-tea",
    name: "Milk Tea"
  };
  const result = await applyApprovedEntries({
    approved: [entry],
    categoriesBySlug: new Map([["milk-tea", category]]),
    existingIdentities: new Set([
      showcaseImageIdentityKey(
        category.id,
        entry.provider,
        entry.externalPhotoId
      )
    ]),
    repository: {
      upsertShowcaseImage: async () => {
        throw new Error("existing pool identity should be skipped");
      }
    },
    storage: {
      objectExists: async () => {
        throw new Error("existing pool identity should not touch R2");
      },
      putObject: async () => undefined,
      deleteObject: async () => undefined
    },
    download: async () => {
      downloaded = true;
      throw new Error("existing pool identity should not download");
    }
  });

  expect(result).toEqual({ imported: 0, skipped: 1 });
  expect(downloaded).toBe(false);
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
