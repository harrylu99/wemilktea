import { z } from "zod";

export const showcaseCategoryConfigs = [
  {
    slug: "milk-tea",
    name: "Milk Tea",
    searchTerms: ["milk tea", "boba milk tea", "boba tea"]
  },
  {
    slug: "fruit-tea",
    name: "Fruit Tea",
    searchTerms: ["fruit milktea", "fruit smooth brand", "fresh fruit smoothie"]
  },
  {
    slug: "matcha",
    name: "Matcha",
    searchTerms: [
      "matcha bubble tea",
      "matcha milktea",
      "matcha strawberry drink"
    ]
  },
  {
    slug: "fresh-milk",
    name: "Fresh Milk",
    searchTerms: ["fresh milk tea", "fresh milktea boba"]
  },
  {
    slug: "yogurt",
    name: "Yogurt",
    searchTerms: ["yogurt boba drink", "yogurt milktea"]
  },
  {
    slug: "other",
    name: "Other",
    searchTerms: ["juice boba", "milkshake"]
  }
] as const;

export const storeShowcaseSearchTerms = [
  "bubble tea shop",
  "bubble tea shop interior",
  "boba tea shop",
  "boba cafe",
  "milk tea shop",
  "tea shop interior",
  "bubble tea counter"
] as const;

export type ShowcaseCategoryConfig = (typeof showcaseCategoryConfigs)[number];

const urlSchema = z
  .string()
  .url()
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "URL must use http:// or https://"
  );

export const showcaseManifestEntrySchema = z.object({
  approved: z.boolean().default(false),
  categorySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  searchTerm: z.string().trim().min(1).max(160),
  provider: z.literal("pexels"),
  externalPhotoId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  photoUrl: urlSchema,
  imageUrl: urlSchema,
  photographer: z.string().trim().min(1).max(160),
  photographerUrl: urlSchema,
  attributionText: z.string().trim().min(1).max(500),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000)
});

export type ShowcaseManifestEntry = z.infer<typeof showcaseManifestEntrySchema>;

export const showcaseManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  entries: z.array(showcaseManifestEntrySchema)
});

export type ShowcaseManifest = z.infer<typeof showcaseManifestSchema>;

export const storeShowcaseManifestEntrySchema = z.object({
  approved: z.boolean().default(false),
  searchTerm: z.string().trim().min(1).max(160),
  provider: z.literal("pexels"),
  externalPhotoId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  photoUrl: urlSchema,
  imageUrl: urlSchema,
  photographer: z.string().trim().min(1).max(160),
  photographerUrl: urlSchema,
  attributionText: z.string().trim().min(1).max(500),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000)
});

export type StoreShowcaseManifestEntry = z.infer<
  typeof storeShowcaseManifestEntrySchema
>;

export const storeShowcaseManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  entries: z.array(storeShowcaseManifestEntrySchema)
});

export type StoreShowcaseManifest = z.infer<typeof storeShowcaseManifestSchema>;

export type ShowcaseCategory = {
  id: string;
  slug: string;
  name: string;
};

export type ShowcasePoolImage = {
  imageId: string;
  categoryId: string;
  sortOrder: number;
};

export type AssignableProduct = {
  id: string;
  name: string;
  categoryId: string;
  categorySlug: string;
};

export type ShowcaseImageSource = {
  provider: string;
  externalPhotoId: string;
  imageId: string;
  storageKey: string;
  sourceReference: string | null;
  attributionText: string | null;
  altText: string | null;
  contentType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
};

export type AssignableLocation = {
  id: string;
  displayName: string;
  slug: string;
};

export type StoreShowcasePoolImage = {
  imageId: string;
  sortOrder: number;
};
