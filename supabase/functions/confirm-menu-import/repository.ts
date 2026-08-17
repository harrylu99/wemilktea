import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfirmMenuRequest } from "./handler.ts";

export type ConfirmMenuRepositoryErrorCode =
  "external_identity_conflict" | "location_not_found" | "database_error";

export class ConfirmMenuRepositoryError extends Error {
  constructor(readonly code: ConfirmMenuRepositoryErrorCode) {
    super("The menu import could not be completed.");
    this.name = "ConfirmMenuRepositoryError";
  }
}

export interface ConfirmMenuRepository {
  confirmImport(input: ConfirmMenuRequest): Promise<unknown>;
}

function mapDatabaseError(error: { code?: string; message?: string }) {
  const safeMessage = error.message?.trim();
  if (safeMessage === "external_identity_conflict") {
    return new ConfirmMenuRepositoryError("external_identity_conflict");
  }
  if (safeMessage === "location_not_found") {
    return new ConfirmMenuRepositoryError("location_not_found");
  }
  return new ConfirmMenuRepositoryError("database_error");
}

export function createConfirmMenuRepository(
  client: SupabaseClient
): ConfirmMenuRepository {
  return {
    async confirmImport(input) {
      const { data, error } = await client.rpc("confirm_external_menu_import", {
        p_location_id: input.locationId,
        p_provider: input.provider,
        p_items: input.items
      });
      if (error) throw mapDatabaseError(error);
      return data;
    }
  };
}
