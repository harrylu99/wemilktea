import { normalizeUberMenu, MenuPayloadError } from "./uber-menu-adapter.ts";
import type { ExternalStoreMappingRepository } from "./repository.ts";
import type { ExternalMenuResponse } from "./types.ts";

export interface ExternalMenuProviderClient {
  fetchMenu(externalStoreId: string): Promise<unknown>;
}

export class ExternalMenuServiceError extends Error {
  constructor(
    readonly code:
      "mapping_not_found" | "mapping_lookup_failed" | "invalid_menu"
  ) {
    super("External menu request could not be completed.");
    this.name = "ExternalMenuServiceError";
  }
}

export async function fetchMenuForLocation(input: {
  locationId: string;
  mappingRepository: ExternalStoreMappingRepository;
  providerClient: ExternalMenuProviderClient;
}): Promise<ExternalMenuResponse> {
  let externalStoreId: string | null;
  try {
    externalStoreId = await input.mappingRepository.findUberStoreId(
      input.locationId
    );
  } catch {
    throw new ExternalMenuServiceError("mapping_lookup_failed");
  }

  if (!externalStoreId) {
    throw new ExternalMenuServiceError("mapping_not_found");
  }

  const payload = await input.providerClient.fetchMenu(externalStoreId);
  try {
    const normalized = normalizeUberMenu(payload);
    return { locationId: input.locationId, ...normalized };
  } catch (error) {
    if (error instanceof MenuPayloadError) {
      throw new ExternalMenuServiceError("invalid_menu");
    }
    throw error;
  }
}
