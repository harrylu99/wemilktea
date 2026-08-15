import { expect, test } from "bun:test";
import { filterManagedStores, type ManagedStore } from "./store-list";

const stores: ManagedStore[] = [
  {
    id: "05c6f9e6-b940-4121-a365-01324ecb9fd8",
    brand_id: "6d395d6e-0b1f-4cd3-9d5d-979a3fbe10ad",
    brandName: "Gong cha",
    display_name: "Gong cha Takapuna",
    slug: "gong-cha-takapuna",
    suburb: "Takapuna",
    publication_status: "draft",
    created_at: "2026-08-12T00:00:00.000Z",
    updated_at: "2026-08-12T00:00:00.000Z"
  },
  {
    id: "e802eb8f-1eb7-493f-b1f0-eba35a10151b",
    brand_id: "0634de79-14d8-4e5a-b2bb-f0caf7082261",
    brandName: "Machi Machi",
    display_name: "Machi Machi Newmarket",
    slug: "machi-machi-newmarket",
    suburb: "Newmarket",
    publication_status: "published",
    created_at: "2026-08-12T00:00:00.000Z",
    updated_at: "2026-08-12T00:00:00.000Z"
  }
];

test("filters canonical stores by search, publication, brand, and area", () => {
  expect(
    filterManagedStores(stores, {
      query: "machi",
      publicationStatus: "published",
      brandId: "0634de79-14d8-4e5a-b2bb-f0caf7082261",
      suburb: "Newmarket"
    })
  ).toEqual([stores[1]]);
  expect(
    filterManagedStores(stores, {
      query: "",
      publicationStatus: "draft",
      brandId: "",
      suburb: ""
    })
  ).toEqual([stores[0]]);
});
