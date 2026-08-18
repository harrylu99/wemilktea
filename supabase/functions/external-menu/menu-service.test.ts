import { expect, test } from "bun:test";
import {
  fetchMenuForLocation,
  ExternalMenuServiceError
} from "./menu-service.ts";
import type { ExternalStoreMappingRepository } from "./repository.ts";
import type { ExternalMenuProviderClient } from "./menu-service.ts";

const locationId = "11111111-1111-4111-8111-111111111111";

function dependencies(mapping: string | null = "uber-store-1") {
  let requestedStoreId: string | null = null;
  const mappingRepository: ExternalStoreMappingRepository = {
    async findUberStoreId() {
      return mapping;
    }
  };
  const providerClient: ExternalMenuProviderClient = {
    async fetchMenu(storeId) {
      requestedStoreId = storeId;
      return { items: [], categories: [], modifier_groups: {} };
    }
  };
  return {
    mappingRepository,
    providerClient,
    get requestedStoreId() {
      return requestedStoreId;
    }
  };
}

test("resolves locationId through the provider-neutral mapping", async () => {
  const fake = dependencies();
  const result = await fetchMenuForLocation({
    locationId,
    mappingRepository: fake.mappingRepository,
    providerClient: fake.providerClient
  });

  expect(fake.requestedStoreId).toBe("uber-store-1");
  expect(result).toEqual({
    locationId,
    provider: "uber_eats",
    items: [],
    warnings: []
  });
});

test("returns a safe missing-mapping error", async () => {
  const fake = dependencies(null);

  await expect(
    fetchMenuForLocation({
      locationId,
      mappingRepository: fake.mappingRepository,
      providerClient: fake.providerClient
    })
  ).rejects.toMatchObject({ code: "mapping_not_found" });
});

test("returns a safe mapping lookup error", async () => {
  const fake = dependencies();
  const repository: ExternalStoreMappingRepository = {
    async findUberStoreId() {
      throw new Error("database details must not escape");
    }
  };

  await expect(
    fetchMenuForLocation({
      locationId,
      mappingRepository: repository,
      providerClient: fake.providerClient
    })
  ).rejects.toBeInstanceOf(ExternalMenuServiceError);
});
