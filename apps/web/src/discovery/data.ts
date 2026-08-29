import {
  loadPublicDrinks,
  normalizePublicDrink,
  publicProductQueryRowSchema,
  type PublicDrink,
  type PublicDrinkCategory
} from "../drinks/data";
import {
  normalizePublicStore,
  publicStoreQueryRowSchema,
  type PublicStore
} from "../stores/data";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { containsPattern } from "../lib/query";
import { z } from "zod";

export type DiscoveryData = {
  drinks: PublicDrink[];
  stores: PublicStore[];
  categories: PublicDrinkCategory[];
};

export type DiscoveryQueryResult =
  { data: DiscoveryData; error: null } | { data: null; error: string };

export type PublicSearchResult = {
  drinks: PublicDrink[];
  stores: PublicStore[];
};

export type PublicSearchQueryResult =
  { data: PublicSearchResult; error: null } | { data: null; error: string };

const searchProductRowSchema = publicProductQueryRowSchema.extend({
  location_products: z
    .object({ location_id: z.string().uuid() })
    .array()
    .optional()
    .default([])
});

const searchProductSelect =
  "id, name, slug, description, is_seasonal, discovery_tags, brands!inner(id, name, slug), categories!inner(id, name, slug), product_images(is_primary, image_assets(id, provenance, storage_key, external_url, alt_text)), location_products!location_products_product_id_fkey!inner(location_id)";

const searchStoreSelect =
  "id, slug, display_name, suburb, address, coordinates, location_images(image_assets(id, provenance, storage_key, external_url, alt_text)), brands!inner(name, slug)";

export type PublicSupabaseClient = NonNullable<typeof supabase>;

export function filterPublicDiscoveryDrinks(
  drinks: PublicDrink[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  return drinks.filter((drink) => {
    if (!normalizedQuery) return true;
    return drink.name.toLowerCase().includes(normalizedQuery);
  });
}

export function filterPublicDiscoveryStores(
  stores: PublicStore[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  return stores.filter((store) => {
    if (!normalizedQuery) return true;
    return store.displayName.toLowerCase().includes(normalizedQuery);
  });
}

export function sortPublicDiscoveryStores(stores: PublicStore[]) {
  return [...stores].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

export async function loadPublicDiscoveryData(): Promise<DiscoveryQueryResult> {
  if (!supabase) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const [drinksResult, storesResult] = await Promise.all([
    loadPublicDrinks(),
    supabase
      .from("locations")
      .select(
        "id, slug, display_name, suburb, address, coordinates, location_images(image_assets(id, provenance, storage_key, external_url, alt_text)), brands!inner(name, slug)"
      )
      .order("display_name")
  ]);

  if (drinksResult.error || storesResult.error) {
    return { data: null, error: "query_failed" };
  }

  const storeRows = publicStoreQueryRowSchema
    .array()
    .safeParse(storesResult.data);
  if (!storeRows.success || !drinksResult.data || !drinksResult.categories) {
    return { data: null, error: "invalid_data" };
  }

  const stores = storeRows.data
    .map((row) => normalizePublicStore(row))
    .filter((store): store is PublicStore => store !== null);

  return {
    data: {
      drinks: drinksResult.data,
      stores: sortPublicDiscoveryStores(stores),
      categories: drinksResult.categories
    },
    error: null
  };
}

export async function loadPublicSearchResults(
  query: string,
  client = supabase
): Promise<PublicSearchQueryResult> {
  const normalizedQuery = query.trim();
  if (!client) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }
  if (!normalizedQuery) {
    return { data: { drinks: [], stores: [] }, error: null };
  }

  const pattern = containsPattern(normalizedQuery);
  const [productsResult, storesResult] = await Promise.all([
    client
      .from("products")
      .select(searchProductSelect)
      .ilike("name", pattern)
      .eq("location_products.availability_status", "available")
      .order("name")
      .limit(20),
    client
      .from("locations")
      .select(searchStoreSelect)
      .ilike("display_name", pattern)
      .order("display_name")
      .limit(20)
  ]);

  if (productsResult.error || storesResult.error) {
    return { data: null, error: "query_failed" };
  }

  const products = searchProductRowSchema
    .array()
    .safeParse(productsResult.data);
  const stores = publicStoreQueryRowSchema.array().safeParse(storesResult.data);
  if (!products.success || !stores.success) {
    return { data: null, error: "invalid_data" };
  }

  return {
    data: {
      drinks: products.data
        .map((row) =>
          normalizePublicDrink(
            row,
            new Set(row.location_products.map((item) => item.location_id)).size
          )
        )
        .filter((drink): drink is PublicDrink => drink !== null),
      stores: stores.data
        .map((row) => normalizePublicStore(row))
        .filter((store): store is PublicStore => store !== null)
    },
    error: null
  };
}

export function searchPublicDiscovery(
  drinks: PublicDrink[],
  stores: PublicStore[],
  query: string
) {
  if (!query.trim()) return { drinks: [], stores: [] };

  return {
    drinks: filterPublicDiscoveryDrinks(drinks, query),
    stores: filterPublicDiscoveryStores(stores, query)
  };
}
