import { expect, test } from "bun:test";
import {
  directionsUrl,
  normalizePublicStoreDetail,
  normalizePublicStoreDrinks
} from "./detail";

const storeId = "8d68fdf1-a011-4e6f-8409-469493583c2e";
const brandId = "3ff27baa-8375-448d-ac76-9bb0edbb6a2f";
const productId = "9de804a5-511a-4b17-829a-694634fa993d";

test("normalizes a published canonical store detail row", () => {
  const store = normalizePublicStoreDetail({
    id: storeId,
    slug: "gong-cha-albany",
    display_name: "Gong cha Albany",
    suburb: "Albany",
    address: "219 Don McKinnon Drive, Albany, Auckland",
    coordinates: "0101000020E6100000637FD93D79D66540B0726891ED5C42C0",
    brands: { id: brandId, name: "Gong cha", slug: "gong-cha" },
    location_images: [
      {
        image_assets: {
          id: "6ebec59b-e16e-4be4-a8cb-647c29fd81c0",
          provenance: "google",
          storage_key: null,
          external_url: "https://example.test/google.jpg",
          alt_text: "Google image",
          attribution_text: "Google"
        }
      }
    ]
  });

  expect(store?.displayName).toBe("Gong cha Albany");
  expect(store?.brandId).toBe(brandId);
  expect(store?.latitude).toBeCloseTo(-36.726);
  expect(store?.longitude).toBeCloseTo(174.7023);
  expect(store?.images).toEqual([]);
});

test("normalizes available location products without exposing unpublished rows", () => {
  const drinks = normalizePublicStoreDrinks([
    {
      price_cents: 690,
      currency: "NZD",
      availability_status: "available",
      products: {
        id: productId,
        slug: "brown-sugar-pearl-milk-tea",
        name: "Brown Sugar Pearl Milk Tea",
        description: "Black tea, milk and brown sugar pearls."
      }
    },
    {
      price_cents: null,
      currency: "NZD",
      availability_status: "unavailable",
      products: {
        id: productId,
        slug: "hidden",
        name: "Hidden",
        description: null
      }
    }
  ]);

  expect(drinks).toHaveLength(1);
  expect(drinks[0]).toMatchObject({
    name: "Brown Sugar Pearl Milk Tea",
    priceCents: 690,
    imageUrl: null,
    imageAltText: null
  });
});

test("normalizes a persisted primary Product image for a store drink", () => {
  const drinks = normalizePublicStoreDrinks([
    {
      price_cents: 690,
      currency: "NZD",
      availability_status: "available",
      products: {
        id: productId,
        slug: "brown-sugar-pearl-milk-tea",
        name: "Brown Sugar Pearl Milk Tea",
        description: null,
        product_images: [
          {
            is_primary: true,
            image_assets: {
              id: "2c4d7a6e-f782-4704-bd84-7c34f6d16a7d",
              provenance: "wemilktea",
              storage_key: null,
              external_url: "https://cdn.example.test/product.jpg",
              alt_text: "Brown sugar pearl milk tea"
            }
          }
        ]
      }
    }
  ]);

  expect(drinks[0]).toMatchObject({
    imageUrl: "https://cdn.example.test/product.jpg",
    imageAltText: "Brown sugar pearl milk tea"
  });
});

test("builds directions from canonical coordinates", () => {
  expect(directionsUrl({ latitude: -36.726, longitude: 174.7023 })).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=-36.726,174.7023"
  );
});
