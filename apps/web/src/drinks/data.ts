import { publicImageUrl } from "@wemilktea/config";
import { z } from "zod";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

const uuidSchema = z.string().uuid();

const relation = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]);

const brandSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1)
});

const categorySchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1)
});

const imageAssetSchema = z.object({
  id: uuidSchema,
  provenance: z.enum(["wemilktea", "merchant", "user", "google", "stock"]),
  storage_key: z.string().nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  alt_text: z.string().nullable().optional()
});

export const productImageSchema = z.object({
  is_primary: z.boolean(),
  image_assets: relation(imageAssetSchema)
});

export const publicProductQueryRowSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  is_seasonal: z.boolean(),
  discovery_tags: z.array(z.string()),
  brands: relation(brandSchema),
  categories: relation(categorySchema),
  product_images: z.array(productImageSchema).optional().default([])
});

export const publicDrinkCategorySchema = categorySchema;

export type PublicDrinkCategory = z.infer<typeof publicDrinkCategorySchema>;

export type PublicDrink = {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  categorySlug: string;
  description: string | null;
  discoveryTags: string[];
  isSeasonal: boolean;
  imageUrl: string | null;
  imageAltText: string | null;
  availableStoreCount: number;
};

export type PublicDrinkQueryResult =
  | { data: PublicDrink[]; categories: PublicDrinkCategory[]; error: null }
  | {
      data: null;
      categories: null;
      error: "query_failed" | "invalid_data" | string;
    };

const r2PublicBaseUrl =
  typeof import.meta.env.VITE_R2_PUBLIC_BASE_URL === "string"
    ? import.meta.env.VITE_R2_PUBLIC_BASE_URL
    : "";

function firstRelation<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

function imageUrlFromAsset(
  asset: z.infer<typeof imageAssetSchema>,
  imageBaseUrl = r2PublicBaseUrl
) {
  if (asset.provenance === "google") return null;
  return asset.storage_key
    ? publicImageUrl(imageBaseUrl, asset.storage_key)
    : (asset.external_url ?? null);
}

export function primaryProductImage(
  links: z.infer<typeof productImageSchema>[],
  imageBaseUrl = r2PublicBaseUrl
): {
  url: string | null;
  altText: string | null;
} {
  const link = links.find((item) => item.is_primary) ?? links[0];
  if (!link) return { url: null, altText: null };
  const asset = firstRelation(link.image_assets);
  if (!asset) return { url: null, altText: null };
  return {
    url: imageUrlFromAsset(asset, imageBaseUrl),
    altText: asset.alt_text ?? null
  };
}

export function normalizePublicDrink(
  value: unknown,
  availableStoreCount = 0,
  imageBaseUrl = r2PublicBaseUrl
): PublicDrink | null {
  const parsed = publicProductQueryRowSchema.safeParse(value);
  if (!parsed.success) return null;

  const brand = firstRelation(parsed.data.brands);
  const category = firstRelation(parsed.data.categories);
  if (!brand || !category) return null;

  const image = primaryProductImage(parsed.data.product_images, imageBaseUrl);
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    brandName: brand.name,
    brandSlug: brand.slug,
    categoryName: category.name,
    categorySlug: category.slug,
    description: parsed.data.description,
    discoveryTags: parsed.data.discovery_tags,
    isSeasonal: parsed.data.is_seasonal,
    imageUrl: image.url,
    imageAltText: image.altText,
    availableStoreCount
  };
}

export function filterPublicDrinks(
  drinks: PublicDrink[],
  options: { query: string; categorySlug: string }
) {
  const query = options.query.trim().toLowerCase();
  return drinks.filter((drink) => {
    const searchable = [
      drink.name,
      drink.brandName,
      drink.categoryName,
      drink.description ?? "",
      ...drink.discoveryTags
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (!options.categorySlug || drink.categorySlug === options.categorySlug)
    );
  });
}

export function drinkDetailPath(
  drink: Pick<PublicDrink, "brandSlug" | "slug">
) {
  return `/drinks/${encodeURIComponent(drink.brandSlug)}/${encodeURIComponent(drink.slug)}`;
}

export async function loadPublicDrinks(): Promise<PublicDrinkQueryResult> {
  const client = supabase;
  if (!client) {
    return {
      data: null,
      categories: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const [productsResult, categoriesResult, availabilityResult] =
    await Promise.all([
      client
        .from("products")
        .select(
          "id, name, slug, description, is_seasonal, discovery_tags, brands!inner(id, name, slug), categories!inner(id, name, slug), product_images(is_primary, image_assets(id, provenance, storage_key, external_url, alt_text))"
        )
        .order("name"),
      client.from("categories").select("id, name, slug").order("sort_order"),
      client
        .from("location_products")
        .select("product_id, location_id")
        .eq("availability_status", "available")
    ]);

  if (
    productsResult.error ||
    categoriesResult.error ||
    availabilityResult.error
  ) {
    return { data: null, categories: null, error: "query_failed" };
  }

  const productRows = publicProductQueryRowSchema
    .array()
    .safeParse(productsResult.data);
  const categories = publicDrinkCategorySchema
    .array()
    .safeParse(categoriesResult.data);
  if (!productRows.success || !categories.success) {
    return { data: null, categories: null, error: "invalid_data" };
  }

  const locationRows = z
    .object({ product_id: uuidSchema, location_id: uuidSchema })
    .array()
    .safeParse(availabilityResult.data);
  if (!locationRows.success) {
    return { data: null, categories: null, error: "invalid_data" };
  }

  const counts = new Map<string, Set<string>>();
  locationRows.data.forEach(({ product_id, location_id }) => {
    const locations = counts.get(product_id) ?? new Set<string>();
    locations.add(location_id);
    counts.set(product_id, locations);
  });

  const drinks = productRows.data
    .map((row) => normalizePublicDrink(row, counts.get(row.id)?.size ?? 0))
    .filter(
      (drink): drink is PublicDrink =>
        drink !== null && drink.availableStoreCount > 0
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return { data: drinks, categories: categories.data, error: null };
}
