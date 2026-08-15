import { z } from "zod";
import {
  normalizePublicDrinkDetail,
  type PublicDrinkAvailableStore
} from "../drinks/detail-data";
import { publicProductQueryRowSchema, type PublicDrink } from "../drinks/data";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

export type CravingKey =
  "matcha" | "milk-tea" | "fruit-tea" | "creamy" | "refreshing" | "surprise";

export type CravingOption = {
  key: CravingKey;
  label: string;
  icon: string;
};

export const CRAVING_OPTIONS: CravingOption[] = [
  { key: "matcha", label: "Matcha", icon: "🍵" },
  { key: "milk-tea", label: "Milk Tea", icon: "🥛" },
  { key: "fruit-tea", label: "Fruit Tea", icon: "🍓" },
  { key: "creamy", label: "Creamy", icon: "🧋" },
  { key: "refreshing", label: "Refreshing", icon: "💧" },
  { key: "surprise", label: "Surprise Me", icon: "✦" }
];

const cravingKeySchema = z.enum([
  "matcha",
  "milk-tea",
  "fruit-tea",
  "creamy",
  "refreshing",
  "surprise"
]);

const pickerAvailabilityRowSchema = z.object({
  product_id: z.string().uuid(),
  price_cents: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  availability_status: z.literal("available"),
  locations: z.unknown()
});

export type PickerCandidate = PublicDrink & {
  availableStores: PublicDrinkAvailableStore[];
};

export type PickerRecommendation = {
  candidate: PickerCandidate;
  store: PublicDrinkAvailableStore;
  craving: CravingKey;
};

export type PickerQueryResult =
  { data: PickerCandidate[]; error: null } | { data: null; error: string };

export function cravingOption(key: CravingKey) {
  return (
    CRAVING_OPTIONS.find((option) => option.key === key) ?? CRAVING_OPTIONS[0]
  );
}

export function parseCravingKey(value: string | null): CravingKey | null {
  const parsed = cravingKeySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function filterPickerCandidates(
  candidates: PickerCandidate[],
  craving: CravingKey
) {
  if (craving === "surprise") return candidates;

  return candidates.filter((candidate) => {
    if (["matcha", "milk-tea", "fruit-tea"].includes(craving)) {
      return candidate.categorySlug === craving;
    }

    const tags = new Set(
      candidate.discoveryTags.map((tag) => tag.trim().toLowerCase())
    );
    return tags.has(craving);
  });
}

function randomIndex(length: number, random: number) {
  if (length <= 0) return -1;
  if (!Number.isFinite(random) || random <= 0) return 0;
  if (random >= 1) return length - 1;
  return Math.floor(random * length);
}

export function randomUnit() {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0] / 2 ** 32;
  }
  return Math.random();
}

export function pickRecommendation(
  candidates: PickerCandidate[],
  craving: CravingKey,
  random: () => number = randomUnit
): PickerRecommendation | null {
  const eligible = filterPickerCandidates(candidates, craving);
  const candidateIndex = randomIndex(eligible.length, random());
  const candidate = candidateIndex >= 0 ? eligible[candidateIndex] : undefined;
  if (!candidate || candidate.availableStores.length === 0) return null;

  const storeIndex = randomIndex(candidate.availableStores.length, random());
  const store = candidate.availableStores[storeIndex];
  if (!store) return null;

  return { candidate, store, craving };
}

export function pickerResultPath(recommendation: PickerRecommendation) {
  const product = recommendation.candidate;
  const query = new URLSearchParams({
    store: recommendation.store.slug,
    craving: recommendation.craving
  });
  return `/picker/result/${encodeURIComponent(product.brandSlug)}/${encodeURIComponent(product.slug)}?${query.toString()}`;
}

export function normalizePickerCandidate(
  productValue: unknown,
  availabilityValues: unknown[]
): PickerCandidate | null {
  const parsedProduct = publicProductQueryRowSchema.safeParse(productValue);
  if (!parsedProduct.success) return null;

  const detail = normalizePublicDrinkDetail(
    parsedProduct.data,
    availabilityValues
  );
  if (!detail || detail.availableStores.length === 0) return null;
  return detail;
}

export async function loadPublicPickerCandidates(): Promise<PickerQueryResult> {
  if (!supabase) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const [productsResult, availabilityResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, description, is_seasonal, discovery_tags, brands!inner(id, name, slug), categories!inner(id, name, slug), product_images(is_primary, image_assets(id, provenance, storage_key, external_url, alt_text))"
      )
      .order("name"),
    supabase
      .from("location_products")
      .select(
        "product_id, price_cents, currency, availability_status, locations!location_products_location_brand_id_fkey!inner(id, slug, display_name, suburb, address, coordinates, brands!inner(id, name, slug), location_images(image_assets(id, provenance, storage_key, external_url, alt_text)))"
      )
      .eq("availability_status", "available")
  ]);

  if (productsResult.error || availabilityResult.error) {
    return { data: null, error: "query_failed" };
  }

  const products = publicProductQueryRowSchema
    .array()
    .safeParse(productsResult.data);
  const availability = pickerAvailabilityRowSchema
    .array()
    .safeParse(availabilityResult.data);
  if (!products.success || !availability.success) {
    return { data: null, error: "invalid_data" };
  }

  const availabilityByProduct = new Map<string, unknown[]>();
  availability.data.forEach((row) => {
    const rows = availabilityByProduct.get(row.product_id) ?? [];
    rows.push(row);
    availabilityByProduct.set(row.product_id, rows);
  });

  const candidates = products.data
    .map((product) =>
      normalizePickerCandidate(
        product,
        availabilityByProduct.get(product.id) ?? []
      )
    )
    .filter((candidate): candidate is PickerCandidate => candidate !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { data: candidates, error: null };
}

export { cravingKeySchema };
