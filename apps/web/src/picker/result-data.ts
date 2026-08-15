import {
  normalizePublicDrinkDetail,
  type PublicDrinkAvailableStore,
  type PublicDrinkDetail
} from "../drinks/detail-data";
import { publicProductQueryRowSchema } from "../drinks/data";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import {
  cravingOption,
  filterPickerCandidates,
  parseCravingKey,
  type CravingKey,
  type PickerCandidate
} from "./data";

export type PickerResultCraving = {
  key: CravingKey | null;
  label: string | null;
  fortune: string;
};

export type PickerResult = {
  drink: PublicDrinkDetail;
  store: PublicDrinkAvailableStore;
  craving: PickerResultCraving;
};

export type PickerResultLoad =
  | { data: PickerResult; error: null }
  | {
      data: null;
      error: "stale" | "not_found" | "query_failed" | "invalid_data" | string;
    };

const fortuneByCraving: Record<CravingKey, string> = {
  matcha: "Today feels like a matcha kind of day.",
  "milk-tea": "A classic milk tea feels right today.",
  "fruit-tea": "Something bright and fruity found you today.",
  creamy: "The sign says: go creamy today.",
  refreshing: "Today's sign is something light and refreshing.",
  surprise: "The sign picked this one for you."
};

function cravingForProduct(
  detail: PublicDrinkDetail,
  rawCraving: string | null
): PickerResultCraving {
  const parsed = cravingOptionKey(rawCraving);
  if (!parsed) {
    return {
      key: null,
      label: null,
      fortune: "The sign picked this one for you."
    };
  }

  const candidate: PickerCandidate = {
    ...detail,
    availableStores: detail.availableStores
  };
  const matches = filterPickerCandidates([candidate], parsed).length > 0;
  return {
    key: parsed,
    label: matches ? cravingOption(parsed).label : null,
    fortune: matches
      ? fortuneByCraving[parsed]
      : "The sign picked this one for you."
  };
}

export function cravingOptionKey(value: string | null): CravingKey | null {
  return parseCravingKey(value);
}

export function pickerResultCraving(
  detail: PublicDrinkDetail,
  rawCraving: string | null
) {
  return cravingForProduct(detail, rawCraving);
}

export function normalizePickerResult(
  detail: PublicDrinkDetail,
  storeSlug: string | null,
  rawCraving: string | null
): PickerResultLoad {
  if (!storeSlug) return { data: null, error: "stale" };
  const store = detail.availableStores.find((item) => item.slug === storeSlug);
  if (!store) return { data: null, error: "stale" };

  return {
    data: {
      drink: detail,
      store,
      craving: cravingForProduct(detail, rawCraving)
    },
    error: null
  };
}

export function pickerResultDrinkPath(result: PickerResult) {
  return `/drinks/${encodeURIComponent(result.drink.brandSlug)}/${encodeURIComponent(result.drink.slug)}`;
}

export function pickerResultStorePath(result: PickerResult) {
  return `/stores/${encodeURIComponent(result.store.slug)}`;
}

export async function loadPublicPickerResult(
  brandSlug: string,
  productSlug: string,
  storeSlug: string | null,
  rawCraving: string | null
): Promise<PickerResultLoad> {
  if (!storeSlug) return { data: null, error: "stale" };
  if (!supabase) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const productResult = await supabase
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

  const availabilityResult = await supabase
    .from("location_products")
    .select(
      "price_cents, currency, availability_status, locations!location_products_location_brand_id_fkey!inner(id, slug, display_name, suburb, address, coordinates, brands!inner(id, name, slug))"
    )
    .eq("product_id", parsedProduct.data.id)
    .eq("availability_status", "available")
    .eq("locations.slug", storeSlug);

  if (availabilityResult.error) return { data: null, error: "query_failed" };
  const detail = normalizePublicDrinkDetail(
    parsedProduct.data,
    availabilityResult.data ?? []
  );
  if (!detail) return { data: null, error: "invalid_data" };
  return normalizePickerResult(detail, storeSlug, rawCraving);
}
