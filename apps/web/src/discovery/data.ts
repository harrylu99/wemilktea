import {
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

export type DiscoveryData = {
  drinks: PublicDrink[];
  stores: PublicStore[];
  categories: PublicDrinkCategory[];
};

export type DiscoveryQueryResult =
  { data: DiscoveryData; error: null } | { data: null; error: string };

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
