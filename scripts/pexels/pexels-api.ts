import { z } from "zod";
import {
  showcaseCategoryConfigs,
  type ShowcaseManifest,
  type ShowcaseManifestEntry
} from "./types";

const pexelsPhotoSchema = z.object({
  id: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  url: z.string().url(),
  photographer: z.string().min(1),
  photographer_url: z.string().url(),
  src: z.object({
    large: z.string().url()
  })
});

export const pexelsSearchResponseSchema = z.object({
  photos: z.array(pexelsPhotoSchema),
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().optional(),
  total_results: z.number().int().nonnegative().optional()
});

export type PexelsFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export const MAX_SHOWCASE_IMAGES_PER_CATEGORY = 40;

export function perPageForSearchTerms(searchTermCount: number) {
  if (!Number.isInteger(searchTermCount) || searchTermCount < 1) {
    throw new Error("At least one Pexels search term is required.");
  }
  return Math.ceil(MAX_SHOWCASE_IMAGES_PER_CATEGORY / searchTermCount);
}

export async function searchPexels(
  query: string,
  apiKey: string,
  fetcher: PexelsFetcher = fetch,
  perPage = 10
) {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(perPage));

  const response = await fetcher(url, {
    headers: { Authorization: apiKey }
  });
  if (!response.ok) {
    throw new Error(`Pexels search failed with HTTP ${response.status}.`);
  }

  const parsed = pexelsSearchResponseSchema.safeParse(
    await response.json().catch(() => null)
  );
  if (!parsed.success) {
    throw new Error("Pexels returned an invalid search response.");
  }
  return parsed.data.photos;
}

export async function discoverShowcaseManifest(
  apiKey: string,
  fetcher: PexelsFetcher = fetch
): Promise<ShowcaseManifest> {
  const entries: ShowcaseManifestEntry[] = [];

  for (const category of showcaseCategoryConfigs) {
    const seen = new Set<string>();
    const perPage = perPageForSearchTerms(category.searchTerms.length);
    for (const searchTerm of category.searchTerms) {
      const photos = await searchPexels(searchTerm, apiKey, fetcher, perPage);
      for (const photo of photos.slice(0, perPage)) {
        const externalPhotoId = String(photo.id);
        if (
          seen.has(externalPhotoId) ||
          seen.size >= MAX_SHOWCASE_IMAGES_PER_CATEGORY
        )
          continue;
        seen.add(externalPhotoId);
        entries.push({
          approved: false,
          categorySlug: category.slug,
          searchTerm,
          provider: "pexels",
          externalPhotoId,
          photoUrl: photo.url,
          imageUrl: photo.src.large,
          photographer: photo.photographer,
          photographerUrl: photo.photographer_url,
          attributionText: `Photo by ${photo.photographer} via Pexels`,
          width: photo.width,
          height: photo.height
        });
      }
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries
  };
}
