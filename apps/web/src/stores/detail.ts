import { z } from "zod";
import { publicImageUrl } from "@wemilktea/config";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { primaryProductImage, productImageSchema } from "../drinks/data";
import { coordinatePair, type PublicStore } from "./data";

const brandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1)
});

const imageAssetSchema = z.object({
  id: z.string().uuid(),
  provenance: z.enum(["wemilktea", "merchant", "user", "google"]),
  storage_key: z.string().nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  attribution_text: z.string().nullable().optional()
});

const r2PublicBaseUrl =
  typeof import.meta.env.VITE_R2_PUBLIC_BASE_URL === "string"
    ? import.meta.env.VITE_R2_PUBLIC_BASE_URL
    : "";

const locationImageSchema = z.object({
  image_assets: z.union([imageAssetSchema, z.array(imageAssetSchema)])
});

const locationDetailRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  display_name: z.string().min(1),
  suburb: z.string().min(1),
  address: z.string().min(1),
  coordinates: z.unknown(),
  brands: z.union([brandSchema, z.array(brandSchema)]),
  location_images: z.array(locationImageSchema).optional().default([])
});

const locationProductRowSchema = z.object({
  price_cents: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  availability_status: z.literal("available"),
  products: z.union([
    z.object({
      id: z.string().uuid(),
      slug: z.string().min(1),
      name: z.string().min(1),
      description: z.string().nullable(),
      product_images: z.array(productImageSchema).optional().default([])
    }),
    z.array(
      z.object({
        id: z.string().uuid(),
        slug: z.string().min(1),
        name: z.string().min(1),
        description: z.string().nullable(),
        product_images: z.array(productImageSchema).optional().default([])
      })
    )
  ])
});

export type PublicStoreImage = {
  id: string;
  url: string | null;
  altText: string | null;
  attributionText: string | null;
};

export type PublicStoreDrink = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  imageAltText: string | null;
};

export type PublicStoreDetail = PublicStore & {
  brandId: string;
  images: PublicStoreImage[];
  drinks: PublicStoreDrink[];
  drinksUnavailable: boolean;
};

export type PublicStoreDetailResult =
  | { data: PublicStoreDetail; error: null }
  | {
      data: null;
      error: "not_found" | "query_failed" | "invalid_data" | string;
    };

function firstRelation<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

function publicImageFromAsset(value: z.infer<typeof imageAssetSchema>) {
  if (value.provenance === "google") return null;
  const url = value.storage_key
    ? publicImageUrl(r2PublicBaseUrl, value.storage_key)
    : (value.external_url ?? null);
  return {
    id: value.id,
    url,
    altText: value.alt_text ?? null,
    attributionText: value.attribution_text ?? null
  } satisfies PublicStoreImage;
}

export function normalizePublicStoreDetail(
  value: unknown
): PublicStoreDetail | null {
  const parsed = locationDetailRowSchema.safeParse(value);
  if (!parsed.success) return null;

  const coordinates = coordinatePair(parsed.data.coordinates);
  const brand = firstRelation(parsed.data.brands);
  if (!coordinates || !brand) return null;

  const images = parsed.data.location_images
    .map((link) => firstRelation(link.image_assets))
    .map(publicImageFromAsset)
    .filter((image): image is PublicStoreImage => image !== null);

  return {
    id: parsed.data.id,
    slug: parsed.data.slug,
    displayName: parsed.data.display_name,
    brandId: brand.id,
    brandName: brand.name,
    brandSlug: brand.slug,
    suburb: parsed.data.suburb,
    address: parsed.data.address,
    latitude: coordinates[0],
    longitude: coordinates[1],
    imageUrl: images[0]?.url ?? null,
    imageAltText: images[0]?.altText ?? null,
    images,
    drinks: [],
    drinksUnavailable: false
  };
}

export function normalizePublicStoreDrinks(
  value: unknown,
  imageBaseUrl = r2PublicBaseUrl
): PublicStoreDrink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rowValue) => {
    const parsed = locationProductRowSchema.safeParse(rowValue);
    if (!parsed.success) return [];
    const product = firstRelation(parsed.data.products);
    if (!product) return [];
    const image = primaryProductImage(product.product_images, imageBaseUrl);
    return [
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        priceCents: parsed.data.price_cents,
        currency: parsed.data.currency,
        imageUrl: image.url,
        imageAltText: image.altText
      }
    ];
  });
}

export async function loadPublicStoreDetail(
  slug: string
): Promise<PublicStoreDetailResult> {
  const client = supabase;
  if (!client) {
    return {
      data: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const locationResult = await client
    .from("locations")
    .select(
      "id, slug, display_name, suburb, address, coordinates, brands!inner(id, name, slug), location_images(image_assets(id, provenance, storage_key, external_url, alt_text, attribution_text, content_type, byte_size, width, height))"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (locationResult.error) return { data: null, error: "query_failed" };
  if (!locationResult.data) return { data: null, error: "not_found" };

  const store = normalizePublicStoreDetail(locationResult.data);
  if (!store) return { data: null, error: "invalid_data" };

  const productsResult = await client
    .from("location_products")
    .select(
      "price_cents, currency, availability_status, products!location_products_product_brand_id_fkey!inner(id, slug, name, description, product_images(is_primary, image_assets(id, provenance, storage_key, external_url, alt_text)))"
    )
    .eq("location_id", store.id)
    .eq("availability_status", "available")
    .order("product_id");

  if (productsResult.error) {
    return {
      data: { ...store, drinksUnavailable: true },
      error: null
    };
  }

  return {
    data: { ...store, drinks: normalizePublicStoreDrinks(productsResult.data) },
    error: null
  };
}

export function directionsUrl(
  store: Pick<PublicStore, "latitude" | "longitude">
) {
  return `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`;
}
