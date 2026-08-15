import { z } from "zod";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import {
  normalizePublicDrink,
  publicProductQueryRowSchema,
  type PublicDrink
} from "./data";
import {
  normalizePublicStore,
  publicStoreQueryRowSchema,
  type PublicStore
} from "../stores/data";

const availabilityRowSchema = z.object({
  price_cents: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  availability_status: z.literal("available"),
  locations: z.union([
    publicStoreQueryRowSchema,
    publicStoreQueryRowSchema.array()
  ])
});

export type PublicDrinkAvailableStore = PublicStore & {
  priceCents: number | null;
  currency: string;
};

export type PublicDrinkDetail = PublicDrink & {
  availableStores: PublicDrinkAvailableStore[];
};

export type PublicDrinkDetailResult =
  | { data: PublicDrinkDetail; error: null }
  | {
      data: null;
      error: "not_found" | "query_failed" | "invalid_data" | string;
    };

function firstRelation<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizePublicDrinkAvailableStore(
  value: unknown
): PublicDrinkAvailableStore | null {
  const parsed = availabilityRowSchema.safeParse(value);
  if (!parsed.success) return null;

  const location = normalizePublicStore(firstRelation(parsed.data.locations));
  if (!location) return null;

  return {
    ...location,
    priceCents: parsed.data.price_cents,
    currency: parsed.data.currency
  };
}

export function normalizePublicDrinkDetail(
  productValue: unknown,
  availabilityValues: unknown[]
): PublicDrinkDetail | null {
  const product = publicProductQueryRowSchema.safeParse(productValue);
  if (!product.success) return null;

  const drink = normalizePublicDrink(product.data, 0);
  if (!drink) return null;

  const availableStores = availabilityValues
    .map(normalizePublicDrinkAvailableStore)
    .filter((store): store is PublicDrinkAvailableStore => store !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    ...drink,
    availableStoreCount: availableStores.length,
    availableStores
  };
}

export async function loadPublicDrinkDetail(
  brandSlug: string,
  productSlug: string
): Promise<PublicDrinkDetailResult> {
  const client = supabase;
  if (!client) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const productResult = await client
    .from("products")
    .select(
      "id, name, slug, description, is_seasonal, discovery_tags, brands!inner(id, name, slug), categories!inner(id, name, slug), product_images(is_primary, image_assets(id, provenance, storage_key, external_url, alt_text))"
    )
    .eq("slug", productSlug)
    .eq("brands.slug", brandSlug)
    .maybeSingle();

  if (productResult.error) return { data: null, error: "query_failed" };
  if (!productResult.data) return { data: null, error: "not_found" };

  const parsedProduct = publicProductQueryRowSchema.safeParse(
    productResult.data
  );
  if (!parsedProduct.success) return { data: null, error: "invalid_data" };

  const drink = normalizePublicDrink(parsedProduct.data, 0);
  if (!drink || drink.brandSlug !== brandSlug) {
    return { data: null, error: "not_found" };
  }

  const availabilityResult = await client
    .from("location_products")
    .select(
      "price_cents, currency, availability_status, locations!location_products_location_brand_id_fkey!inner(id, slug, display_name, suburb, address, coordinates, brands!inner(id, name, slug), location_images(image_assets(id, provenance, storage_key, external_url, alt_text)))"
    )
    .eq("product_id", drink.id)
    .eq("availability_status", "available");

  if (availabilityResult.error) return { data: null, error: "query_failed" };

  const normalized = normalizePublicDrinkDetail(
    parsedProduct.data,
    availabilityResult.data ?? []
  );
  return normalized
    ? { data: normalized, error: null }
    : { data: null, error: "invalid_data" };
}
