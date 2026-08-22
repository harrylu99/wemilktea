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
  // Bubble tea / tea shop
  "modern bubble tea shop",
  "modern bubble tea shop interior",
  "bubble tea cafe interior",
  "bubble tea store interior",
  "bubble tea counter",
  "bubble tea drinks counter",
  "boba shop interior",
  "boba cafe interior",
  "boba shop counter",
  "boba bar interior",
  "milk tea shop interior",
  "milk tea cafe interior",
  "tea bar interior",
  "tea shop counter",
  "modern tea shop",
  "minimalist tea shop",
  "Asian tea cafe",

  // Drink / beverage shops
  "beverage shop interior",
  "modern beverage shop",
  "drink shop interior",
  "modern drink shop",
  "drink shop counter",
  "takeaway drink shop",
  "beverage counter",
  "juice bar interior",
  "smoothie bar interior",

  // Cafe interiors
  "small cafe interior",
  "cozy cafe interior",
  "modern cafe interior",
  "minimalist cafe interior",
  "pastel cafe interior",
  "colorful cafe interior",
  "cute cafe interior",
  "Asian cafe interior",
  "Japanese cafe interior",
  "Korean cafe interior",
  "dessert cafe interior",

  // Counters / kiosks
  "modern cafe counter",
  "minimalist cafe counter",
  "dessert shop counter",
  "takeaway counter",
  "mall drink kiosk",
  "beverage kiosk",
  "tea kiosk",

  // Detail / atmosphere
  "bubble tea cups counter",
  "boba drinks display",
  "milk tea drinks counter",
  "colorful drinks cafe",
  "drink preparation counter",
  "neon cafe interior",
  "warm cafe interior",
  "plant cafe interior",
  "modern Asian cafe",
  "contemporary tea house"
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
  width: z.number().int().positive(),
  height: z.number().int().positive()
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
  width: z.number().int().positive(),
  height: z.number().int().positive()
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

export function formatManifestValidationIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.reduce((result, segment) => {
        if (typeof segment === "number") return `${result}[${segment}]`;
        return result ? `${result}.${segment}` : segment;
      }, "");
      return `${path || "manifest"}: ${issue.message}`;
    })
    .join("; ");
}

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
