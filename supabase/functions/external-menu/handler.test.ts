import { expect, test } from "bun:test";
import {
  createExternalMenuHandler,
  type ExternalMenuEnvironment
} from "./handler.ts";
import type { ExternalStoreMappingRepository } from "./repository.ts";
import type { ExternalMenuProviderClient } from "./menu-service.ts";

const environment: ExternalMenuEnvironment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  ADMIN_APP_ORIGIN: "https://admin.example.test",
  UBER_EATS_CLIENT_ID: "test-client-id",
  UBER_EATS_CLIENT_SECRET: "test-client-secret",
  UBER_EATS_ENV: "sandbox"
};

const locationId = "11111111-1111-4111-8111-111111111111";

function request(body: unknown, origin = environment.ADMIN_APP_ORIGIN) {
  return new Request("https://function.example.test/external-menu", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

test("rejects malformed location requests before provider access", async () => {
  let providerCalls = 0;
  const response = await createExternalMenuHandler(environment, {
    authorizeAdmin: async () => {
      throw new Error("authorization should not run");
    },
    providerClient: {
      async fetchMenu() {
        providerCalls += 1;
        return null;
      }
    }
  })(request({ locationId: "not-a-uuid" }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid request." });
  expect(providerCalls).toBe(0);
});

test("preserves the existing 401 and 403 admin boundary", async () => {
  const unauthorized = await createExternalMenuHandler(environment, {
    authorizeAdmin: async (_request, _environment, headers) =>
      new Response(JSON.stringify({ error: "Authentication is required." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...headers }
      })
  })(request({ locationId }));
  expect(unauthorized.status).toBe(401);

  const forbidden = await createExternalMenuHandler(environment, {
    authorizeAdmin: async (_request, _environment, headers) =>
      new Response(
        JSON.stringify({ error: "Administrator access is required." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...headers }
        }
      )
  })(request({ locationId }));
  expect(forbidden.status).toBe(403);
});

test("returns normalized provider-neutral menu data for an admin", async () => {
  const mappingRepository: ExternalStoreMappingRepository = {
    async findUberStoreId(requestedLocationId) {
      expect(requestedLocationId).toBe(locationId);
      return "uber-store-1";
    }
  };
  const providerClient: ExternalMenuProviderClient = {
    async fetchMenu(storeId) {
      expect(storeId).toBe("uber-store-1");
      return { items: {}, categories: {}, modifier_groups: {} };
    }
  };
  const handler = createExternalMenuHandler(environment, {
    authorizeAdmin: async () => ({ client: {} as never, userId: "admin-1" }),
    mappingRepository,
    providerClient
  });

  const response = await handler(request({ locationId }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    locationId,
    provider: "uber_eats",
    items: [],
    warnings: []
  });
});

test("rejects an origin outside the configured Admin origin", async () => {
  const response = await createExternalMenuHandler(environment, {
    authorizeAdmin: async () => ({ client: {} as never, userId: "admin-1" })
  })(request({ locationId }, "https://evil.example.test"));

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Origin is not allowed." });
});
