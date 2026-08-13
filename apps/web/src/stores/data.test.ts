import { expect, test } from "bun:test";
import {
  filterPublicStores,
  markerPosition,
  normalizePublicStore,
  type PublicStore
} from "./data";

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
    longitude: 174.7023
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
    longitude: 174.7633
  }
];

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
