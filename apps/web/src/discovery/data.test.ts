import { expect, test } from "bun:test";
import {
  filterPublicDiscoveryDrinks,
  filterPublicDiscoveryStores,
  searchPublicDiscovery
} from "./data";
import type { PublicDrink } from "../drinks/data";
import type { PublicStore } from "../stores/data";

const drinks: PublicDrink[] = [
  {
    id: "9de804a5-511a-4b17-829a-694634fa993d",
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    categoryName: "Milk Tea",
    categorySlug: "milk-tea",
    description: "Black tea, milk and brown sugar pearls.",
    discoveryTags: ["brown-sugar", "pearls"],
    isSeasonal: false,
    imageUrl: null,
    imageAltText: null,
    availableStoreCount: 2
  },
  {
    id: "c0aee95b-c6e2-4501-a5a7-dcb4b8d1b11a",
    name: "Summer Mango Tea",
    slug: "summer-mango-tea",
    brandName: "Chatime",
    brandSlug: "chatime",
    categoryName: "Fruit Tea",
    categorySlug: "fruit-tea",
    description: "A bright seasonal mango drink.",
    discoveryTags: ["mango"],
    isSeasonal: true,
    imageUrl: null,
    imageAltText: null,
    availableStoreCount: 1
  }
];

const stores: PublicStore[] = [
  {
    id: "05c6f9e6-b940-4121-a365-01324ecb9fd8",
    slug: "gong-cha-albany",
    displayName: "Gong cha Albany",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    suburb: "Albany",
    address: "Albany, Auckland",
    latitude: -36.726,
    longitude: 174.7023,
    imageUrl: null,
    imageAltText: null
  }
];

test("searches canonical drink fields", () => {
  expect(filterPublicDiscoveryDrinks(drinks, "mango")).toEqual([drinks[1]]);
  expect(filterPublicDiscoveryDrinks(drinks, "gong cha")).toEqual([drinks[0]]);
});

test("searches stores case insensitively across store fields", () => {
  expect(filterPublicDiscoveryStores(stores, "  GONG CHA  ")).toEqual(stores);
  expect(filterPublicDiscoveryStores(stores, "auckland")).toEqual(stores);
});

test("returns grouped Drink and Store search results", () => {
  expect(searchPublicDiscovery(drinks, stores, "albany")).toEqual({
    drinks: [],
    stores
  });
});

test("returns no results for an empty query", () => {
  expect(searchPublicDiscovery(drinks, stores, "  ")).toEqual({
    drinks: [],
    stores: []
  });
});
