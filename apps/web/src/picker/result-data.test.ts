import { expect, test } from "bun:test";
import {
  normalizePickerResult,
  pickerResultCraving,
  pickerResultDrinkPath,
  pickerResultStorePath,
  type PickerResult
} from "./result-data";
import type {
  PublicDrinkAvailableStore,
  PublicDrinkDetail
} from "../drinks/detail-data";

const storeId = "c5d5cf65-0d5b-4b1f-a56f-2671a2e9a5b0";
const productId = "9de804a5-511a-4b17-829a-694634fa993d";

function store(
  overrides: Partial<PublicDrinkAvailableStore> = {}
): PublicDrinkAvailableStore {
  return {
    id: storeId,
    slug: "gong-cha-albany",
    displayName: "Gong cha Albany",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    suburb: "Albany",
    address: "219 Don McKinnon Drive, Albany, Auckland",
    latitude: -36.726,
    longitude: 174.7023,
    imageUrl: null,
    imageAltText: null,
    priceCents: 850,
    currency: "NZD",
    ...overrides
  };
}

function detail(overrides: Partial<PublicDrinkDetail> = {}): PublicDrinkDetail {
  return {
    id: productId,
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    categoryName: "Milk Tea",
    categorySlug: "milk-tea",
    description: "Black tea, milk and brown sugar pearls.",
    discoveryTags: ["brown-sugar", "pearls", "classic"],
    isSeasonal: false,
    imageUrl: "https://images.example.test/drink.jpg",
    imageAltText: "Brown sugar pearl milk tea",
    availableStoreCount: 1,
    availableStores: [store()],
    ...overrides
  };
}

test("resolves a current product/store relationship into one result", () => {
  const loaded = normalizePickerResult(detail(), "gong-cha-albany", "milk-tea");
  expect(loaded.error).toBeNull();
  expect(loaded.data).toMatchObject({
    drink: { slug: "brown-sugar-pearl-milk-tea" },
    store: { slug: "gong-cha-albany", priceCents: 850 },
    craving: {
      key: "milk-tea",
      label: "Milk Tea",
      fortune: "A classic milk tea feels right today."
    }
  });
});

test("rejects missing or unavailable selected stores without substitution", () => {
  expect(normalizePickerResult(detail(), null, "milk-tea")).toEqual({
    data: null,
    error: "stale"
  });
  expect(normalizePickerResult(detail(), "other-store", "milk-tea")).toEqual({
    data: null,
    error: "stale"
  });
  expect(
    normalizePickerResult(
      detail({ availableStores: [store({ slug: "other-store" })] }),
      "gong-cha-albany",
      "milk-tea"
    )
  ).toEqual({ data: null, error: "stale" });
});

test("uses generic fortune copy for unknown or mismatched cravings", () => {
  const product = detail({
    categorySlug: "milk-tea",
    discoveryTags: ["classic"]
  });
  expect(pickerResultCraving(product, "banana")).toEqual({
    key: null,
    label: null,
    fortune: "The sign picked this one for you."
  });
  expect(pickerResultCraving(product, "matcha")).toEqual({
    key: "matcha",
    label: null,
    fortune: "The sign picked this one for you."
  });
  expect(pickerResultCraving(product, "surprise")).toEqual({
    key: "surprise",
    label: "Surprise Me",
    fortune: "The sign picked this one for you."
  });
});

test("mood fortune requires an explicit discovery tag", () => {
  const creamy = detail({ discoveryTags: ["taro", "creamy"] });
  expect(pickerResultCraving(creamy, "creamy").fortune).toBe(
    "The sign says: go creamy today."
  );
  expect(pickerResultCraving(detail(), "refreshing").label).toBeNull();
});

test("result actions preserve canonical drink and store routes", () => {
  const loaded = normalizePickerResult(detail(), "gong-cha-albany", "milk-tea");
  expect(loaded.error).toBeNull();
  const result = loaded.data as PickerResult;
  expect(pickerResultDrinkPath(result)).toBe(
    "/drinks/gong-cha/brown-sugar-pearl-milk-tea"
  );
  expect(pickerResultStorePath(result)).toBe("/stores/gong-cha-albany");
});

test("keeps the selected relationship price, including an unlisted price", () => {
  const loaded = normalizePickerResult(
    detail({ availableStores: [store({ priceCents: null })] }),
    "gong-cha-albany",
    "milk-tea"
  );
  expect(loaded.error).toBeNull();
  expect(loaded.data?.store.priceCents).toBeNull();
});
