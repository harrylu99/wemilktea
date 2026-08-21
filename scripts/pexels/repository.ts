import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  AssignableProduct,
  ShowcaseCategory,
  ShowcasePoolImage
} from "./types";

const categoryRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1)
});

const productRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  category_id: z.string().uuid(),
  categories: z.union([categoryRowSchema, categoryRowSchema.array().min(1)])
});

const poolRowSchema = z.object({
  image_id: z.string().uuid(),
  category_id: z.string().uuid(),
  sort_order: z.number().int().nonnegative(),
  is_active: z.boolean()
});

const poolIdentityRowSchema = z.object({
  category_id: z.string().uuid(),
  provider: z.string().min(1),
  external_photo_id: z.string().min(1)
});

function first<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

function assertDatabaseSuccess(
  operation: string,
  error: { message?: string; code?: string } | null
) {
  if (error) {
    throw new Error(
      `${operation} failed: ${error.message ?? "database error"}`
    );
  }
}

export function showcaseImageIdentityKey(
  categoryId: string,
  provider: string,
  externalPhotoId: string
) {
  return `${categoryId}:${provider}:${externalPhotoId}`;
}

export type ShowcaseRepository = ReturnType<typeof createShowcaseRepository>;

export function createSupabaseClient(environment: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  return createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function createShowcaseRepository(client: SupabaseClient) {
  return {
    async loadCategories(slugs: string[]): Promise<ShowcaseCategory[]> {
      const result = await client
        .from("categories")
        .select("id, slug, name")
        .in("slug", slugs);
      assertDatabaseSuccess("category lookup", result.error);
      const parsed = z.array(categoryRowSchema).safeParse(result.data ?? []);
      if (!parsed.success)
        throw new Error("Category lookup returned invalid data.");
      return parsed.data;
    },

    async upsertShowcaseImage(input: {
      categoryId: string;
      provider: string;
      externalPhotoId: string;
      storageKey: string;
      sourceReference: string;
      attributionText: string;
      altText: string;
      contentType: string;
      byteSize: number;
      width: number;
      height: number;
      searchTerm: string;
      sortOrder: number;
    }) {
      const result = await client.rpc("upsert_showcase_image", {
        p_category_id: input.categoryId,
        p_provider: input.provider,
        p_external_photo_id: input.externalPhotoId,
        p_storage_key: input.storageKey,
        p_source_reference: input.sourceReference,
        p_attribution_text: input.attributionText,
        p_alt_text: input.altText,
        p_content_type: input.contentType,
        p_byte_size: input.byteSize,
        p_width: input.width,
        p_height: input.height,
        p_search_term: input.searchTerm,
        p_sort_order: input.sortOrder
      });
      assertDatabaseSuccess("showcase image upsert", result.error);
      const row = Array.isArray(result.data) ? result.data[0] : null;
      if (
        !row ||
        typeof row.pool_id !== "string" ||
        typeof row.image_id !== "string" ||
        typeof row.created !== "boolean"
      ) {
        throw new Error("Showcase image upsert returned invalid data.");
      }
      return row as { pool_id: string; image_id: string; created: boolean };
    },

    async loadShowcaseImageIdentities(
      categoryIds: string[]
    ): Promise<Set<string>> {
      if (categoryIds.length === 0) return new Set();
      const result = await client
        .from("showcase_image_pool")
        .select("category_id, provider, external_photo_id")
        .in("category_id", categoryIds);
      assertDatabaseSuccess("showcase image identity lookup", result.error);
      const parsed = z
        .array(poolIdentityRowSchema)
        .safeParse(result.data ?? []);
      if (!parsed.success)
        throw new Error(
          "Showcase image identity lookup returned invalid data."
        );
      return new Set(
        parsed.data.map((row) =>
          showcaseImageIdentityKey(
            row.category_id,
            row.provider,
            row.external_photo_id
          )
        )
      );
    },

    async loadAssignableProducts(): Promise<AssignableProduct[]> {
      const [productsResult, imagesResult] = await Promise.all([
        client
          .from("products")
          .select("id, name, category_id, categories!inner(id, slug, name)")
          .order("id"),
        client
          .from("product_images")
          .select("product_id")
          .eq("is_primary", true)
      ]);
      assertDatabaseSuccess("product lookup", productsResult.error);
      assertDatabaseSuccess("product image lookup", imagesResult.error);

      const products = z
        .array(productRowSchema)
        .safeParse(productsResult.data ?? []);
      if (!products.success)
        throw new Error("Product lookup returned invalid data.");
      const primaryProductIds = new Set(
        (imagesResult.data ?? [])
          .map((row) =>
            typeof row.product_id === "string" ? row.product_id : null
          )
          .filter((id): id is string => id !== null)
      );

      return products.data
        .filter((product) => !primaryProductIds.has(product.id))
        .map((product) => {
          const category = first(product.categories);
          return {
            id: product.id,
            name: product.name,
            categoryId: product.category_id,
            categorySlug: category.slug
          };
        });
    },

    async loadActivePoolImages(): Promise<ShowcasePoolImage[]> {
      const result = await client
        .from("showcase_image_pool")
        .select("image_id, category_id, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order")
        .order("id");
      assertDatabaseSuccess("showcase pool lookup", result.error);
      const parsed = z.array(poolRowSchema).safeParse(result.data ?? []);
      if (!parsed.success)
        throw new Error("Showcase pool lookup returned invalid data.");
      return parsed.data.map(({ image_id, category_id, sort_order }) => ({
        imageId: image_id,
        categoryId: category_id,
        sortOrder: sort_order
      }));
    },

    async assignShowcaseImage(productId: string, imageId: string) {
      const result = await client.rpc("assign_showcase_image_to_product", {
        p_product_id: productId,
        p_image_id: imageId
      });
      assertDatabaseSuccess("showcase image assignment", result.error);
      const row = Array.isArray(result.data) ? result.data[0] : null;
      if (
        !row ||
        typeof row.image_id !== "string" ||
        typeof row.assigned !== "boolean"
      ) {
        throw new Error("Showcase image assignment returned invalid data.");
      }
      return row as { image_id: string; assigned: boolean };
    }
  };
}
