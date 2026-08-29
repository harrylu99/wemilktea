import { z } from "zod";
import { publicImageUrl } from "@wemilktea/config";
import { firstRelation } from "../lib/relations";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

const uuidSchema = z.string().uuid();
const imageAssetSchema = z.object({
  id: uuidSchema,
  provenance: z.enum(["wemilktea", "merchant", "user", "google", "stock"]),
  storage_key: z.string().nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  alt_text: z.string().nullable().optional()
});

const locationImageSchema = z.object({
  image_assets: z.union([imageAssetSchema, z.array(imageAssetSchema)])
});

export const publicStoreQueryRowSchema = z.object({
  id: uuidSchema,
  slug: z.string().min(1),
  display_name: z.string().min(1),
  suburb: z.string().min(1),
  address: z.string().min(1),
  coordinates: z.unknown(),
  location_images: z.array(locationImageSchema).optional().default([]),
  brands: z.union([
    z.object({ name: z.string().min(1), slug: z.string().min(1) }),
    z.array(z.object({ name: z.string().min(1), slug: z.string().min(1) }))
  ])
});

export type PublicStoreQueryRow = z.infer<typeof publicStoreQueryRowSchema>;

export type PublicStore = {
  id: string;
  slug: string;
  displayName: string;
  brandName: string;
  brandSlug: string;
  suburb: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  imageAltText: string | null;
};

export type PublicStoresQuery = {
  query: string;
  brandSlug: string;
  suburb: string;
};

export type PublicStoresQueryResult =
  { data: PublicStore[]; error: null } | { data: null; error: string };

export type PublicStoreFacets = {
  brands: Array<[string, string]>;
  areas: string[];
};

export type PublicStoreFacetsResult =
  { data: PublicStoreFacets; error: null } | { data: null; error: string };

const storeFacetRowSchema = z.object({
  suburb: z.string().min(1),
  brands: z.union([
    z.object({ name: z.string().min(1), slug: z.string().min(1) }),
    z.object({ name: z.string().min(1), slug: z.string().min(1) }).array()
  ])
});

const r2PublicBaseUrl =
  typeof import.meta.env.VITE_R2_PUBLIC_BASE_URL === "string"
    ? import.meta.env.VITE_R2_PUBLIC_BASE_URL
    : "";

export function coordinatePair(value: unknown): [number, number] | null {
  if (typeof value === "string") {
    const match = value.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (match) {
      const longitude = Number(match[1]);
      const latitude = Number(match[2]);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [latitude, longitude]
        : null;
    }

    const hex = value.trim();
    if (/^[\da-f]+$/i.test(hex) && hex.length >= 42 && hex.length % 2 === 0) {
      const bytes = new Uint8Array(hex.length / 2);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
      }
      const view = new DataView(bytes.buffer);
      const littleEndian = view.getUint8(0) === 1;
      const type = view.getUint32(1, littleEndian);
      let offset = 5;
      if ((type & 0x20000000) !== 0) offset += 4;
      if ((type & 0xff) === 1 && offset + 16 <= view.byteLength) {
        const longitude = view.getFloat64(offset, littleEndian);
        const latitude = view.getFloat64(offset + 8, littleEndian);
        return Number.isFinite(latitude) && Number.isFinite(longitude)
          ? [latitude, longitude]
          : null;
      }
    }
  }

  if (Array.isArray(value) && value.length >= 2) {
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
      : null;
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as {
      coordinates?: unknown;
      lat?: unknown;
      latitude?: unknown;
      lng?: unknown;
      longitude?: unknown;
    };
    if (Array.isArray(candidate.coordinates)) {
      return coordinatePair(candidate.coordinates);
    }
    const latitude = Number(candidate.lat ?? candidate.latitude);
    const longitude = Number(candidate.lng ?? candidate.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
      : null;
  }

  return null;
}

export function normalizePublicStore(
  value: unknown,
  imageBaseUrl = r2PublicBaseUrl
): PublicStore | null {
  const parsed = publicStoreQueryRowSchema.safeParse(value);
  if (!parsed.success) return null;

  const coordinates = coordinatePair(parsed.data.coordinates);
  if (!coordinates) return null;

  const brand = Array.isArray(parsed.data.brands)
    ? parsed.data.brands[0]
    : parsed.data.brands;
  if (!brand) return null;

  const image = parsed.data.location_images
    .map((link) => firstRelation(link.image_assets))
    .find((asset) => asset.provenance !== "google");
  const imageUrl = image
    ? image.storage_key
      ? publicImageUrl(imageBaseUrl, image.storage_key)
      : (image.external_url ?? null)
    : null;

  return {
    id: parsed.data.id,
    slug: parsed.data.slug,
    displayName: parsed.data.display_name,
    brandName: brand.name,
    brandSlug: brand.slug,
    suburb: parsed.data.suburb,
    address: parsed.data.address,
    latitude: coordinates[0],
    longitude: coordinates[1],
    imageUrl,
    imageAltText: image?.alt_text ?? null
  };
}

export function filterPublicStores(
  stores: PublicStore[],
  options: {
    query: string;
    brandSlug: string;
    suburb: string;
    nearMe: boolean;
    userLocation: Coordinates | null;
  }
) {
  const query = options.query.trim().toLowerCase();
  const filtered = stores.filter((store) => {
    const matchesQuery =
      !query ||
      `${store.displayName} ${store.brandName} ${store.suburb} ${store.address}`
        .toLowerCase()
        .includes(query);
    return (
      matchesQuery &&
      (!options.brandSlug || store.brandSlug === options.brandSlug) &&
      (!options.suburb || store.suburb === options.suburb)
    );
  });

  if (!options.nearMe || !options.userLocation) return filtered;

  return filtered
    .map((store) => ({
      store,
      distance: distanceKm(
        options.userLocation!.latitude,
        options.userLocation!.longitude,
        store.latitude,
        store.longitude
      )
    }))
    .filter(({ distance }) => distance <= 40)
    .sort((a, b) => a.distance - b.distance)
    .map(({ store }) => store);
}

export async function loadPublicStores(
  options: PublicStoresQuery,
  client = supabase
): Promise<PublicStoresQueryResult> {
  if (!client) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const { data, error } = await client.rpc("search_public_stores", {
    p_brand_slug: options.brandSlug,
    p_query: options.query,
    p_suburb: options.suburb
  });
  if (error) return { data: null, error: "query_failed" };

  const rows = publicStoreQueryRowSchema.array().safeParse(data);
  if (!rows.success) return { data: null, error: "invalid_data" };

  return {
    data: rows.data
      .map((row) => normalizePublicStore(row))
      .filter((store): store is PublicStore => store !== null),
    error: null
  };
}

export async function loadPublicStoreFacets(
  client = supabase
): Promise<PublicStoreFacetsResult> {
  if (!client) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const { data, error } = await client
    .from("locations")
    .select("suburb, brands!inner(name, slug)")
    .order("suburb");
  if (error) return { data: null, error: "query_failed" };

  const rows = storeFacetRowSchema.array().safeParse(data);
  if (!rows.success) return { data: null, error: "invalid_data" };

  const brands = new Map<string, string>();
  const areas = new Set<string>();
  rows.data.forEach((row) => {
    const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands;
    if (brand) brands.set(brand.slug, brand.name);
    areas.add(row.suburb);
  });

  return {
    data: {
      areas: [...areas].sort(),
      brands: [...brands.entries()].sort(([, nameA], [, nameB]) =>
        nameA.localeCompare(nameB)
      )
    },
    error: null
  };
}

export function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function markerPosition(stores: PublicStore[], store: PublicStore) {
  const longitudes = stores.map((item) => item.longitude);
  const latitudes = stores.map((item) => item.latitude);
  const longitudeRange = Math.max(...longitudes) - Math.min(...longitudes);
  const latitudeRange = Math.max(...latitudes) - Math.min(...latitudes);
  const x = longitudeRange
    ? ((store.longitude - Math.min(...longitudes)) / longitudeRange) * 84 + 8
    : 50;
  const y = latitudeRange
    ? (1 - (store.latitude - Math.min(...latitudes)) / latitudeRange) * 84 + 8
    : 50;
  return { left: `${x}%`, top: `${y}%` };
}

export type Coordinates = { latitude: number; longitude: number };
