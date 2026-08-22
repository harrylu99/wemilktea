import { expect, test } from "bun:test";
import {
  applyApprovedStoreEntries,
  validateApprovedStoreEntries
} from "./import-store-showcase";
import {
  discoverStoreShowcaseManifest,
  MAX_STORE_SHOWCASE_CANDIDATES,
  perPageForLimit
} from "./pexels-api";
import { storeShowcaseImageIdentityKey } from "./repository";
import { buildShowcaseStorageKey } from "./storage";
import {
  storeShowcaseManifestSchema,
  storeShowcaseSearchTerms,
  type StoreShowcaseManifestEntry
} from "./types";
import { chooseStoreImage } from "./assign-store-showcase";

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

const entry: StoreShowcaseManifestEntry = {
  approved: true,
  searchTerm: "bubble tea shop",
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

test("Store manifest discovery is bounded, deduplicated, and unapproved", async () => {
  let calls = 0;
  const manifest = await discoverStoreShowcaseManifest("test-key", async () => {
    calls += 1;
    return response({ photos: [photo(1), photo(1), photo(calls + 1)] });
  });

  expect(calls).toBe(storeShowcaseSearchTerms.length);
  expect(manifest.entries.length).toBeLessThanOrEqual(
    MAX_STORE_SHOWCASE_CANDIDATES
  );
  expect(
    new Set(manifest.entries.map((candidate) => candidate.externalPhotoId)).size
  ).toBe(manifest.entries.length);
  expect(manifest.entries.every((candidate) => !candidate.approved)).toBe(true);
  expect(storeShowcaseManifestSchema.parse(manifest).entries.length).toBe(
    manifest.entries.length
  );
  expect(perPageForLimit(MAX_STORE_SHOWCASE_CANDIDATES, calls)).toBe(9);
});

test("Store approved validation rejects duplicate provider/photo identities", () => {
  const manifest = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    entries: [entry, { ...entry, approved: false }]
  };
  expect(validateApprovedStoreEntries(manifest)).toEqual([entry]);
  expect(() =>
    validateApprovedStoreEntries({
      ...manifest,
      entries: [entry, entry]
    })
  ).toThrow("Duplicate store manifest photo");
});

test("Store image chooser prefers minimum use and does not mutate input", () => {
  const images = [
    { imageId: "image-a", sortOrder: 0 },
    { imageId: "image-b", sortOrder: 1 },
    { imageId: "image-c", sortOrder: 2 }
  ];
  const original = structuredClone(images);
  expect(chooseStoreImage([], new Map())).toBeNull();
  expect(
    chooseStoreImage([{ imageId: "only", sortOrder: 0 }], new Map())?.imageId
  ).toBe("only");
  expect(
    chooseStoreImage(
      images,
      new Map([
        ["image-a", 2],
        ["image-b", 1],
        ["image-c", 1]
      ]),
      () => 0.99
    )?.imageId
  ).toBe("image-c");
  expect(images).toEqual(original);
});

test("Store chooser uses injected randomness among equal minimum-use images", () => {
  const images = [
    { imageId: "image-a", sortOrder: 0 },
    { imageId: "image-b", sortOrder: 1 }
  ];
  expect(chooseStoreImage(images, new Map(), () => 0)?.imageId).toBe("image-a");
  expect(chooseStoreImage(images, new Map(), () => 0.99)?.imageId).toBe(
    "image-b"
  );
});

test("Store apply reuses a Product-pool stock asset without downloading or uploading", async () => {
  const identity = storeShowcaseImageIdentityKey(
    entry.provider,
    entry.externalPhotoId
  );
  let upsertInput: Record<string, unknown> | null = null;
  const result = await applyApprovedStoreEntries({
    approved: [entry],
    existingIdentities: new Set(),
    existingSources: new Map([
      [
        entry.externalPhotoId,
        {
          storageKey: buildShowcaseStorageKey("pexels", "123", "image/jpeg"),
          sourceReference: entry.photoUrl,
          attributionText: entry.attributionText,
          altText: "Bubble tea shop interior",
          contentType: "image/jpeg",
          byteSize: 1024,
          width: entry.width,
          height: entry.height
        }
      ]
    ]),
    repository: {
      upsertStoreShowcaseImage: async (input) => {
        upsertInput = input as unknown as Record<string, unknown>;
        return { pool_id: "pool", image_id: "image", created: true };
      }
    },
    storage: {
      objectExists: async () => {
        throw new Error("reused stock asset must not inspect R2");
      },
      putObject: async () => {
        throw new Error("reused stock asset must not upload to R2");
      },
      deleteObject: async () => undefined
    },
    download: async () => {
      throw new Error("reused stock asset must not download from Pexels");
    }
  });

  expect(result).toEqual({ imported: 1, reused: 1, skipped: 0 });
  expect(upsertInput?.externalPhotoId).toBe(entry.externalPhotoId);
  expect(identity).toBe("pexels:123");
});
