import { expect, test } from "bun:test";
import {
  listAuthorizedStores,
  retrieveMenu,
  retrieveStoreDetails,
  summarizeMenu
} from "./client";
import type { Fetcher } from "./auth";

const sandboxApiBaseUrl = "https://test-api.uber.com";

test("enumerates all authorized stores across API pages", async () => {
  const requests: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("start_key")) {
      return Response.json({
        stores: [{ store_id: "store-2", name: "Second Test Store" }]
      });
    }

    return Response.json({
      next_key: "next-page",
      stores: [{ store_id: "store-1", name: "First Test Store" }]
    });
  };

  await expect(
    listAuthorizedStores("mock-access-token", sandboxApiBaseUrl, fetcher)
  ).resolves.toEqual([
    { storeId: "store-1", name: "First Test Store" },
    { storeId: "store-2", name: "Second Test Store" }
  ]);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toContain("start_key=next-page");
});

test("retrieves the complete menu response without assuming its root shape", async () => {
  const requestHolder: { value?: Request } = {};
  const fetcher: Fetcher = async (input, init) => {
    requestHolder.value = new Request(input, init);
    return Response.json({
      menus: [{ id: "menu-1" }],
      categories: [{ id: "category-1" }],
      items: [{ id: "item-1" }],
      modifier_groups: [{ id: "modifier-group-1" }]
    });
  };

  await expect(
    retrieveMenu("store/1", "mock-access-token", sandboxApiBaseUrl, fetcher)
  ).resolves.toMatchObject({
    menus: [{ id: "menu-1" }]
  });
  expect(requestHolder.value?.url).toBe(
    "https://test-api.uber.com/v2/eats/stores/store%2F1/menus"
  );
  expect(requestHolder.value?.headers.get("Authorization")).toBe(
    "Bearer mock-access-token"
  );
});

test("summarizes nested menu structures without exposing values", async () => {
  expect(
    summarizeMenu({
      menus: [{ id: "menu-1" }],
      data: {
        categories: [{ id: "category-1", title: "Tea" }],
        items: [{ id: "item-1", title: "Milk Tea", price: 500 }],
        modifier_groups: [{ id: "modifier-1" }]
      }
    })
  ).toMatchObject({
    counts: { menus: 1, categories: 1, items: 1, modifierGroups: 1 }
  });
});

test("retrieves sanitized Store Details fields", async () => {
  const requestHolder: { value?: Request } = {};
  const fetcher: Fetcher = async (input, init) => {
    requestHolder.value = new Request(input, init);
    return Response.json({
      store_id: "store-1",
      name: "Test Store",
      status: "ONLINE",
      location: {
        address: "1 Test Street",
        city: "Auckland",
        state: "Auckland",
        country: "NZ",
        postal_code: "1010",
        phone: "+64 00 000 0000"
      },
      contact_email: "private@example.com"
    });
  };

  await expect(
    retrieveStoreDetails(
      "store-1",
      "mock-access-token",
      sandboxApiBaseUrl,
      fetcher
    )
  ).resolves.toMatchObject({
    storeId: "store-1",
    name: "Test Store",
    status: "ONLINE",
    location: { city: "Auckland", postalCode: "1010" }
  });
  expect(requestHolder.value?.url).toBe(
    "https://test-api.uber.com/v1/eats/stores/store-1"
  );
  expect(requestHolder.value?.url).not.toContain("private@example.com");
});

test("returns safe API error fields without exposing a response payload", async () => {
  const response = new Response(
    JSON.stringify({
      code: "insufficient_scope",
      message: "The token does not have eats.store"
    }),
    { status: 403, statusText: "Forbidden" }
  );

  await expect(
    retrieveMenu(
      "store-1",
      "mock-access-token",
      sandboxApiBaseUrl,
      (async () => response) satisfies Fetcher
    )
  ).rejects.toMatchObject({
    stage: "menu",
    status: 403,
    code: "insufficient_scope",
    message: "The token does not have eats.store"
  });
});
