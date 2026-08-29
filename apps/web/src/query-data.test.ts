import { expect, test } from "bun:test";
import {
  loadPublicSearchResults,
  type PublicSupabaseClient
} from "./discovery/data";
import { loadPublicDrinksPage } from "./drinks/data";
import { loadPublicStores } from "./stores/data";

type QueryResponse = {
  data: unknown[];
  error: null | string;
  count?: number;
};

type QueryCall = {
  table: string;
  operations: string[];
  select: string;
};

function fakeClient(responses: Record<string, QueryResponse[]>) {
  const calls: QueryCall[] = [];
  const client = {
    from(table: string) {
      const call: QueryCall = { table, operations: [], select: "" };
      calls.push(call);
      const response = responses[table]?.shift() ?? {
        data: [],
        error: null
      };
      const builder = {
        select(columns: string) {
          call.select = columns;
          return builder;
        },
        ilike(column: string, value: string) {
          call.operations.push(`ilike:${column}:${value}`);
          return builder;
        },
        eq(column: string, value: string) {
          call.operations.push(`eq:${column}:${value}`);
          return builder;
        },
        order(column: string) {
          call.operations.push(`order:${column}`);
          return builder;
        },
        limit(value: number) {
          call.operations.push(`limit:${value}`);
          return builder;
        },
        contains(column: string, value: string[]) {
          call.operations.push(`contains:${column}:${value.join(",")}`);
          return builder;
        },
        in(column: string, value: string[]) {
          call.operations.push(`in:${column}:${value.join(",")}`);
          return builder;
        },
        range(from: number, to: number) {
          call.operations.push(`range:${from}:${to}`);
          return builder;
        },
        then(
          resolve: (value: QueryResponse) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return builder;
    }
  } as unknown as PublicSupabaseClient;

  return { calls, client };
}

const productId = "9de804a5-511a-4b17-829a-694634fa993d";
const brandId = "3ff27baa-8375-448d-ac76-9bb0edbb6a2f";
const categoryId = "6ebec59b-e16e-4be4-a8cb-647c29fd81c0";
const locationId = "05c6f9e6-b940-4121-a365-01324ecb9fd8";

const product = {
  id: productId,
  name: "Matcha Milk Tea",
  slug: "matcha-milk-tea",
  description: "Creamy green tea.",
  is_seasonal: false,
  discovery_tags: ["matcha"],
  brands: { id: brandId, name: "Gong cha", slug: "gong-cha" },
  categories: { id: categoryId, name: "Milk Tea", slug: "milk-tea" },
  product_images: [],
  location_products: [{ location_id: locationId }]
};

const store = {
  id: locationId,
  slug: "gong-cha-albany",
  display_name: "Gong cha Albany",
  suburb: "Albany",
  address: "219 Don McKinnon Drive, Albany, Auckland",
  coordinates: "POINT(174.7023 -36.726)",
  brands: { name: "Gong cha", slug: "gong-cha" },
  location_images: []
};

test("global search uses bounded server queries and the explicit product relation", async () => {
  const { calls, client } = fakeClient({
    products: [{ data: [product], error: null }],
    locations: [{ data: [store], error: null }]
  });

  const result = await loadPublicSearchResults("  matcha ", client);

  expect(result.error).toBeNull();
  expect(result.data?.drinks[0]?.name).toBe("Matcha Milk Tea");
  expect(result.data?.stores[0]?.displayName).toBe("Gong cha Albany");
  expect(calls[0]?.select).toContain(
    "location_products!location_products_product_id_fkey!inner(location_id)"
  );
  expect(calls[0]?.operations).toContain("ilike:name:%matcha%");
  expect(calls[0]?.operations).toContain("limit:20");
  expect(calls[1]?.operations).toContain("ilike:display_name:%matcha%");
  expect(calls[1]?.operations).toContain("limit:20");
});

test("Drinks applies rich matching and server-side pagination", async () => {
  const { calls, client } = fakeClient({
    categories: [
      {
        data: [{ id: categoryId, name: "Milk Tea", slug: "milk-tea" }],
        error: null
      }
    ],
    products: [
      { data: [product], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [product], error: null, count: 1 }
    ]
  });

  const result = await loadPublicDrinksPage(
    {
      categorySlug: "milk-tea",
      page: 2,
      pageSize: 24,
      query: "matcha"
    },
    client
  );

  expect(result.error).toBeNull();
  expect(result.totalResults).toBe(1);
  expect(result.data?.[0]?.availableStoreCount).toBe(1);
  const pageCall = calls.at(-1);
  expect(pageCall?.operations).toContain(
    "eq:location_products.availability_status:available"
  );
  expect(pageCall?.operations).toContain("eq:categories.slug:milk-tea");
  expect(pageCall?.operations).toContain("range:24:47");
});

test("Stores applies text filters on the server while returning all matching map rows", async () => {
  const { calls, client } = fakeClient({
    locations: [
      { data: [store], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [store], error: null }
    ]
  });

  const result = await loadPublicStores(
    { brandSlug: "gong-cha", query: "Albany", suburb: "Albany" },
    client
  );

  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(1);
  const pageCall = calls.at(-1);
  expect(pageCall?.operations).toContain("in:id:" + locationId);
  expect(pageCall?.operations).toContain("eq:brands.slug:gong-cha");
  expect(pageCall?.operations).toContain("eq:suburb:Albany");
});
