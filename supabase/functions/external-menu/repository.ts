import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExternalStoreMappingRepository {
  findUberStoreId(locationId: string): Promise<string | null>;
}

export function createExternalStoreMappingRepository(
  client: SupabaseClient
): ExternalStoreMappingRepository {
  return {
    async findUberStoreId(locationId) {
      const { data, error } = await client
        .from("location_external_sources")
        .select("external_store_id")
        .eq("location_id", locationId)
        .eq("provider", "uber_eats")
        .maybeSingle();

      if (error) {
        throw new Error("External store mapping lookup failed.");
      }

      return data && typeof data.external_store_id === "string"
        ? data.external_store_id
        : null;
    }
  };
}
