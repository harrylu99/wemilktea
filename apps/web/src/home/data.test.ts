import { expect, test } from "bun:test";
import {
  selectHomeCategories,
  selectHomeDrinks,
  selectHomeHeroDrink,
  selectHomeStores
} from "./data";
import type { PublicDrink } from "../drinks/data";
import type { PublicStore } from "../stores/data";

const drink = (name: string, id: string): PublicDrink => ({
  id,
  name,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  categoryName: "Milk Tea",
  categorySlug: "milk-tea",
  description: null,
  discoveryTags: [],
  isSeasonal: false,
  imageUrl: null,
  imageAltText: null,
  availableStoreCount: 1
});

const drinkWithImage = (name: string, id: string): PublicDrink => ({
  ...drink(name, id),
  imageUrl: `https://cdn.example.com/${id}.jpg`
});

const store = (displayName: string, id: string): PublicStore => ({
  id,
  slug: displayName.toLowerCase().replaceAll(" ", "-"),
  displayName,
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  suburb: "Auckland",
  address: "Auckland",
  latitude: -36.85,
  longitude: 174.76,
  imageUrl: null,
  imageAltText: null
});

test("selects a stable bounded drink preview without popularity claims", () => {
  expect(
    selectHomeDrinks([
      drink("Taro Milk Tea", "00000000-0000-0000-0000-000000000003"),
      drink("Brown Sugar Milk Tea", "00000000-0000-0000-0000-000000000001"),
      drink("Matcha Milk Tea", "00000000-0000-0000-0000-000000000002")
    ]).map((item) => item.name)
  ).toEqual(["Brown Sugar Milk Tea", "Matcha Milk Tea", "Taro Milk Tea"]);
});

test("returns null for an empty hero candidate pool", () => {
  expect(selectHomeHeroDrink([], () => 0)).toBeNull();
});

test("prefers image-backed drinks for the hero", () => {
  const imageDrink = drinkWithImage(
    "Image Drink",
    "00000000-0000-0000-0000-000000000002"
  );
  const laterImageDrink = drinkWithImage(
    "Later Image Drink",
    "00000000-0000-0000-0000-000000000003"
  );

  expect(
    selectHomeHeroDrink(
      [
        drink("No Image Drink", "00000000-0000-0000-0000-000000000001"),
        imageDrink,
        laterImageDrink
      ],
      () => 0
    )
  ).toBe(imageDrink);
  expect(
    selectHomeHeroDrink(
      [
        drink("No Image Drink", "00000000-0000-0000-0000-000000000001"),
        imageDrink,
        laterImageDrink
      ],
      () => 0.9
    )
  ).toBe(laterImageDrink);
});

test("falls back to all drinks when none have images", () => {
  const secondDrink = drink(
    "Second Drink",
    "00000000-0000-0000-0000-000000000002"
  );

  expect(
    selectHomeHeroDrink(
      [
        drink("First Drink", "00000000-0000-0000-0000-000000000001"),
        secondDrink
      ],
      () => 0.9
    )
  ).toBe(secondDrink);
});

test("selects a bounded, stable store preview", () => {
  expect(
    selectHomeStores([
      store("Tea Talk", "00000000-0000-0000-0000-000000000003"),
      store("Gong cha Albany", "00000000-0000-0000-0000-000000000001"),
      store("Chatime CBD", "00000000-0000-0000-0000-000000000002")
    ]).map((item) => item.displayName)
  ).toEqual(["Chatime CBD", "Gong cha Albany"]);
});

test("keeps canonical category shortcuts", () => {
  expect(
    selectHomeCategories([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Matcha",
        slug: "matcha"
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Milk Tea",
        slug: "milk-tea"
      }
    ])
  ).toHaveLength(2);
});
