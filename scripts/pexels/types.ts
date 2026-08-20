import { z } from "zod";

export const showcaseCategoryConfigs = [
  {
    slug: "milk-tea",
    name: "Milk Tea",
    searchTerms: ["milk tea", "bubble tea", "brown sugar boba"]
  },
  {
    slug: "fruit-tea",
    name: "Fruit Tea",
    searchTerms: ["fruit tea", "peach tea", "passionfruit tea"]
  },
  {
    slug: "matcha",
    name: "Matcha",
    searchTerms: ["matcha latte", "iced matcha", "matcha boba"]
  },
  {
    slug: "fresh-milk",
    name: "Fresh Milk",
    searchTerms: ["fresh milk boba", "brown sugar fresh milk"]
  },
  {
    slug: "yogurt",
    name: "Yogurt",
    searchTerms: ["yogurt drink", "yogurt smoothie"]
  },
  {
    slug: "other",
    name: "Other",
    searchTerms: ["tea drink", "smoothie"]
  }
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
