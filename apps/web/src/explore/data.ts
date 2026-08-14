import { z } from "zod";
import {
  filterPublicDrinks,
  loadPublicDrinks,
  type PublicDrink,
  type PublicDrinkCategory
} from "../drinks/data";
import {
  normalizePublicStore,
  publicStoreQueryRowSchema,
  type PublicStore
} from "../stores/data";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

export type ExploreFilter = "" | "seasonal";

export type ExploreData = {
  drinks: PublicDrink[];
  stores: PublicStore[];
  categories: PublicDrinkCategory[];
};

export type ExploreQueryResult =
  { data: ExploreData; error: null } | { data: null; error: string };

export function filterExploreDrinks(
  drinks: PublicDrink[],
  options: { query: string; filter: ExploreFilter }
) {
  const filtered = filterPublicDrinks(drinks, {
    query: options.query,
    categorySlug: ""
  });

  return filtered.filter((drink) =>
    options.filter === "seasonal" ? drink.isSeasonal : true
  );
}

export function filterExploreStores(stores: PublicStore[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return stores.filter((store) => {
    if (!normalizedQuery) return true;
    return `${store.displayName} ${store.brandName} ${store.suburb} ${store.address}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function sortExploreStores(stores: PublicStore[]) {
  return [...stores].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

export async function loadPublicExploreData(): Promise<ExploreQueryResult> {
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
      stores: sortExploreStores(stores),
      categories: drinksResult.categories
    },
    error: null
  };
}

export function exploreSearchMatches(
  drinks: PublicDrink[],
  stores: PublicStore[],
  query: string,
  filter: ExploreFilter
) {
  return {
    drinks: filterExploreDrinks(drinks, { query, filter }),
    stores: filterExploreStores(stores, query)
  };
}

export const exploreFilterSchema = z.enum(["", "seasonal"]);
