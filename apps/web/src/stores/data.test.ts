import { expect, test } from "bun:test";
import {
  filterPublicStores,
  loadPublicStoreFacets,
  markerPosition,
  normalizePublicStore,
  STORE_FACET_BATCH_SIZE,
  type PublicStore
} from "./data";
import type { PublicSupabaseClient } from "../discovery/data";

type FacetResponse = { data: unknown; error: null | string };

function facetClient(responses: FacetResponse[]) {
  const ranges: Array<{ from: number; to: number }> = [];
  const orders: string[] = [];
  let responseIndex = 0;
  const client = {
    from(table: string) {
      if (table !== "locations") throw new Error(`Unexpected table: ${table}`);
      const builder = {
        select() {
          return builder;
        },
        order(column: string) {
          orders.push(column);
          return builder;
        },
        range(from: number, to: number) {
          ranges.push({ from, to });
          return Promise.resolve(
            responses[responseIndex++] ?? { data: [], error: null }
          );
        }
      };
      return builder;
    }
  } as unknown as PublicSupabaseClient;

  return { client, orders, ranges };
}

function facetRow(suburb: string, name: string, slug: string) {
  return { suburb, brands: { name, slug } };
}

const stores: PublicStore[] = [
  {
    id: "05c6f9e6-b940-4121-a365-01324ecb9fd8",
    slug: "gong-cha-albany",
    displayName: "Gong cha Albany",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    suburb: "Albany",
    address: "219 Don McKinnon Drive, Albany, Auckland",
    latitude: -36.726,
    longitude: 174.7023,
    imageUrl: null,
    imageAltText: null
  },
  {
    id: "e802eb8f-1eb7-493f-b1f0-eba35a10151b",
    slug: "chatime-auckland-cbd",
    displayName: "Chatime Auckland CBD",
    brandName: "Chatime",
    brandSlug: "chatime",
    suburb: "Auckland CBD",
    address: "280 Queen Street, Auckland CBD, Auckland",
    latitude: -36.8485,
    longitude: 174.7633,
    imageUrl: null,
    imageAltText: null
  }
];

test("loads Store facets in one deterministic range below the batch size", async () => {
  const { client, orders, ranges } = facetClient([
    {
      data: [
        facetRow("Albany", "Gong cha", "gong-cha"),
        facetRow("Auckland CBD", "Chatime", "chatime")
      ],
      error: null
    }
  ]);

  const result = await loadPublicStoreFacets(client);

  expect(result).toEqual({
    data: {
      areas: ["Albany", "Auckland CBD"],
      brands: [
        ["chatime", "Chatime"],
        ["gong-cha", "Gong cha"]
      ]
    },
    error: null
  });
  expect(ranges).toEqual([{ from: 0, to: STORE_FACET_BATCH_SIZE - 1 }]);
  expect(orders).toEqual(["id"]);
});

test("includes later Store facet batches and deduplicates across ranges", async () => {
  const firstBatch = Array.from(
    { length: STORE_FACET_BATCH_SIZE },
    (_, index) =>
      facetRow(`Area ${String(index).padStart(4, "0")}`, "Common", "common")
  );
  firstBatch[0] = facetRow("Common Area", "Common", "common");
  firstBatch[STORE_FACET_BATCH_SIZE - 1] = facetRow(
    "Common Area",
    "Common",
    "common"
  );

  const { client, orders, ranges } = facetClient([
    { data: firstBatch, error: null },
    {
      data: [
        facetRow("Late Area", "Late Brand", "late-brand"),
        facetRow("Common Area", "Common", "common")
      ],
      error: null
    }
  ]);

  const result = await loadPublicStoreFacets(client);

  expect(result.error).toBeNull();
  expect(result.data?.areas).toContain("Late Area");
  expect(result.data?.brands).toContainEqual(["late-brand", "Late Brand"]);
  expect(
    result.data?.areas.filter((area) => area === "Common Area")
  ).toHaveLength(1);
  expect(
    result.data?.brands.filter(([slug]) => slug === "common")
  ).toHaveLength(1);
  expect(ranges).toEqual([
    { from: 0, to: STORE_FACET_BATCH_SIZE - 1 },
    { from: STORE_FACET_BATCH_SIZE, to: STORE_FACET_BATCH_SIZE * 2 - 1 }
  ]);
  expect(orders).toEqual(["id", "id"]);
});

test("does not return partial Store facets when a later batch fails", async () => {
  const firstBatch = Array.from({ length: STORE_FACET_BATCH_SIZE }, () =>
    facetRow("Albany", "Gong cha", "gong-cha")
  );
  const { client, ranges } = facetClient([
    { data: firstBatch, error: null },
    { data: null, error: "timeout" }
  ]);

  const result = await loadPublicStoreFacets(client);

  expect(result).toEqual({ data: null, error: "query_failed" });
  expect(ranges).toEqual([
    { from: 0, to: STORE_FACET_BATCH_SIZE - 1 },
    { from: STORE_FACET_BATCH_SIZE, to: STORE_FACET_BATCH_SIZE * 2 - 1 }
  ]);
});

test("normalizes canonical PostGIS point data", () => {
  expect(
    normalizePublicStore({
      id: stores[0].id,
      slug: stores[0].slug,
      display_name: stores[0].displayName,
      suburb: stores[0].suburb,
      address: stores[0].address,
      coordinates: "POINT(174.7023 -36.726)",
      brands: { name: "Gong cha", slug: "gong-cha" }
    })
  ).toEqual(stores[0]);
});

test("normalizes the EWKB geography returned by Supabase REST", () => {
  const store = normalizePublicStore({
    id: "11111111-1111-4111-8111-111111111111",
    slug: "chatime-auckland-cbd",
    display_name: "Chatime Auckland CBD",
    suburb: "Auckland CBD",
    address: "280 Queen Street, Auckland CBD, Auckland",
    coordinates: "0101000020E61000002D211FF46CD86540F853E3A59B6C42C0",
    brands: { name: "Chatime", slug: "chatime" }
  });

  expect(store?.latitude).toBeCloseTo(-36.8485, 4);
  expect(store?.longitude).toBeCloseTo(174.7633, 4);
});

test("normalizes a Store with a stock location image", () => {
  const store = normalizePublicStore(
    {
      id: stores[0].id,
      slug: stores[0].slug,
      display_name: stores[0].displayName,
      suburb: stores[0].suburb,
      address: stores[0].address,
      coordinates: "POINT(174.7023 -36.726)",
      brands: { name: stores[0].brandName, slug: stores[0].brandSlug },
      location_images: [
        {
          image_assets: {
            id: "6ebec59b-e16e-4be4-a8cb-647c29fd81c0",
            provenance: "stock",
            storage_key: "showcase/pexels/31578571.jpg",
            external_url: null,
            alt_text: "Bubble tea shop interior"
          }
        }
      ]
    },
    "https://images.example.test"
  );

  expect(store).toMatchObject({
    imageUrl: "https://images.example.test/showcase/pexels/31578571.jpg",
    imageAltText: "Bubble tea shop interior"
  });
});

test("skips public stores with invalid coordinates", () => {
  expect(
    normalizePublicStore({
      id: stores[0].id,
      slug: stores[0].slug,
      display_name: stores[0].displayName,
      suburb: stores[0].suburb,
      address: stores[0].address,
      coordinates: "POINT(not-a-coordinate)",
      brands: { name: stores[0].brandName, slug: stores[0].brandSlug }
    })
  ).toBeNull();
});

test("returns no marker candidates when filters have no matches", () => {
  expect(
    filterPublicStores(stores, {
      query: "not a real store",
      brandSlug: "",
      suburb: "",
      nearMe: false,
      userLocation: null
    })
  ).toEqual([]);
});

test("filters stores by canonical search and brand/area", () => {
  expect(
    filterPublicStores(stores, {
      query: "queen",
      brandSlug: "chatime",
      suburb: "Auckland CBD",
      nearMe: false,
      userLocation: null
    })
  ).toEqual([stores[1]]);
  expect(
    filterPublicStores(stores, {
      query: "",
      brandSlug: "gong-cha",
      suburb: "",
      nearMe: false,
      userLocation: null
    })
  ).toEqual([stores[0]]);
});

test("near-me filtering sorts nearby canonical locations", () => {
  expect(
    filterPublicStores(stores, {
      query: "",
      brandSlug: "",
      suburb: "",
      nearMe: true,
      userLocation: { latitude: -36.849, longitude: 174.764 }
    })
  ).toEqual([stores[1], stores[0]]);
});

test("projects canonical coordinates into stable map marker positions", () => {
  expect(markerPosition(stores, stores[0])).toEqual({ left: "8%", top: "8%" });
  expect(markerPosition(stores, stores[1])).toEqual({
    left: "92%",
    top: "92%"
  });
});
