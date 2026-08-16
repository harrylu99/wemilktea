import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ImportSnapshot,
  ReferenceBrand,
  ReferenceCategory,
  ReferenceLocation,
  ReferenceProduct
} from "./types";

export type ProductCreateInput = {
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[];
  seasonal: boolean;
  isPublished: false;
};

export type ProductUpdateInput = ProductCreateInput & {
  productId: string;
};

export interface ProductImportRepository {
  loadSnapshot(): Promise<ImportSnapshot>;
  createProduct(input: ProductCreateInput): Promise<string>;
  updateProduct(input: ProductUpdateInput): Promise<void>;
  createLocationProduct(input: {
    brandId: string;
    productId: string;
    locationId: string;
    sourceReference?: string;
  }): Promise<void>;
}

function assertDatabaseSuccess(
  operation: string,
  error: { message?: string } | null
): void {
  if (error) {
    throw new Error(
      `${operation} failed: ${error.message ?? "database error"}`
    );
  }
}

function mapBrand(value: {
  id: string;
  slug: string;
  name: string;
}): ReferenceBrand {
  return value;
}

function mapCategory(value: {
  id: string;
  slug: string;
  name: string;
}): ReferenceCategory {
  return value;
}

function mapLocation(value: {
  id: string;
  brand_id: string;
  slug: string;
  display_name: string;
  publication_status: ReferenceLocation["publicationStatus"];
}): ReferenceLocation {
  return {
    id: value.id,
    brandId: value.brand_id,
    slug: value.slug,
    displayName: value.display_name,
    publicationStatus: value.publication_status
  };
}

function mapProduct(value: {
  id: string;
  brand_id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  discovery_tags: string[];
  is_seasonal: boolean;
  is_published: boolean;
}): ReferenceProduct {
  return {
    id: value.id,
    brandId: value.brand_id,
    categoryId: value.category_id,
    name: value.name,
    slug: value.slug,
    description: value.description,
    tags: value.discovery_tags,
    seasonal: value.is_seasonal,
    isPublished: value.is_published
  };
}

export function createSupabaseProductImportRepository(
  client: SupabaseClient
): ProductImportRepository {
  return {
    async loadSnapshot() {
      const [
        brandsResult,
        categoriesResult,
        locationsResult,
        productsResult,
        linksResult
      ] = await Promise.all([
        client.from("brands").select("id, slug, name").order("slug"),
        client.from("categories").select("id, slug, name").order("slug"),
        client
          .from("locations")
          .select("id, brand_id, slug, display_name, publication_status")
          .order("slug"),
        client
          .from("products")
          .select(
            "id, brand_id, category_id, name, slug, description, discovery_tags, is_seasonal, is_published"
          )
          .order("slug"),
        client.from("location_products").select("location_id, product_id")
      ]);

      assertDatabaseSuccess("brand lookup", brandsResult.error);
      assertDatabaseSuccess("category lookup", categoriesResult.error);
      assertDatabaseSuccess("location lookup", locationsResult.error);
      assertDatabaseSuccess("product lookup", productsResult.error);
      assertDatabaseSuccess("location relationship lookup", linksResult.error);

      return {
        brands: (brandsResult.data ?? []).map(mapBrand),
        categories: (categoriesResult.data ?? []).map(mapCategory),
        locations: (locationsResult.data ?? []).map(mapLocation),
        products: (productsResult.data ?? []).map(mapProduct),
        locationProducts: (linksResult.data ?? []).map((value) => ({
          locationId: value.location_id,
          productId: value.product_id
        }))
      };
    },

    async createProduct(input) {
      const { data, error } = await client
        .from("products")
        .insert({
          brand_id: input.brandId,
          category_id: input.categoryId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          discovery_tags: input.tags,
          is_seasonal: input.seasonal,
          is_published: input.isPublished
        })
        .select("id")
        .single();
      assertDatabaseSuccess("product create", error);

      if (!data || typeof data.id !== "string") {
        throw new Error("product create did not return an ID");
      }
      return data.id;
    },

    async updateProduct(input) {
      const { data, error } = await client
        .from("products")
        .update({
          brand_id: input.brandId,
          category_id: input.categoryId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          discovery_tags: input.tags,
          is_seasonal: input.seasonal
        })
        .eq("id", input.productId)
        .eq("brand_id", input.brandId)
        .select("id")
        .single();
      assertDatabaseSuccess("product update", error);

      if (!data || typeof data.id !== "string") {
        throw new Error("product update did not return an ID");
      }
    },

    async createLocationProduct(input) {
      const { error } = await client.from("location_products").insert({
        location_id: input.locationId,
        product_id: input.productId,
        brand_id: input.brandId,
        availability_status: "unknown",
        source_provenance: "wemilktea",
        ...(input.sourceReference
          ? { source_reference: input.sourceReference }
          : {})
      });
      assertDatabaseSuccess("location relationship create", error);
    }
  };
}

export function createSupabaseClient(environment: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  return createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
