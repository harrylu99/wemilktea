import { expect, test } from "bun:test";
import {
  normalizePublicDrinkAvailableStore,
  normalizePublicDrinkDetail
} from "./detail-data";

const productId = "9de804a5-511a-4b17-829a-694634fa993d";
const brandId = "3ff27baa-8375-448d-ac76-9bb0edbb6a2f";
const categoryId = "6ebec59b-e16e-4be4-a8cb-647c29fd81c0";
const locationId = "c5d5cf65-0d5b-4b1f-a56f-2671a2e9a5b0";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea",
    description: "Black tea, milk and brown sugar pearls.",
    is_seasonal: false,
    discovery_tags: ["brown-sugar", "pearls"],
    brands: { id: brandId, name: "Gong cha", slug: "gong-cha" },
    categories: { id: categoryId, name: "Milk Tea", slug: "milk-tea" },
    product_images: [],
    ...overrides
  };
}

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: locationId,
    slug: "gong-cha-albany",
    display_name: "Gong cha Albany",
    suburb: "Albany",
    address: "Albany, Auckland",
    coordinates: { lat: -36.724, lng: 174.699 },
    brands: { id: brandId, name: "Gong cha", slug: "gong-cha" },
    location_images: [],
    ...overrides
  };
}

test("normalizes available store and keeps its location-specific price", () => {
  expect(
    normalizePublicDrinkAvailableStore({
      price_cents: 850,
      currency: "NZD",
      availability_status: "available",
      locations: location()
    })
  ).toMatchObject({
    displayName: "Gong cha Albany",
    priceCents: 850,
    currency: "NZD"
  });
});

test("normalizes a published drink detail with stable store ordering", () => {
  const result = normalizePublicDrinkDetail(product(), [
    {
      price_cents: 900,
      currency: "NZD",
      availability_status: "available",
      locations: location({
        id: "b70b6930-2a6f-4f4e-a63b-4fbf5d73dc1c",
        display_name: "Gong cha Newmarket",
        slug: "gong-cha-newmarket",
        suburb: "Newmarket"
      })
    },
    {
      price_cents: 850,
      currency: "NZD",
      availability_status: "available",
      locations: location()
    }
  ]);

  expect(result?.availableStores.map((store) => store.displayName)).toEqual([
    "Gong cha Albany",
    "Gong cha Newmarket"
  ]);
  expect(result?.availableStores[0]?.priceCents).toBe(850);
});

test("rejects unavailable relationships and malformed locations", () => {
  expect(
    normalizePublicDrinkAvailableStore({
      price_cents: 850,
      currency: "NZD",
      availability_status: "unavailable",
      locations: location()
    })
  ).toBeNull();
  expect(
    normalizePublicDrinkAvailableStore({
      price_cents: 850,
      currency: "NZD",
      availability_status: "available",
      locations: location({ coordinates: "not-a-point" })
    })
  ).toBeNull();
});

test("keeps a published drink detail usable with zero available stores", () => {
  const result = normalizePublicDrinkDetail(product(), []);
  expect(result?.availableStores).toEqual([]);
});
