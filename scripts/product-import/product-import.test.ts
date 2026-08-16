import { expect, test } from "bun:test";
import { parseProductFile } from "./parse";
import { applyImport, planImport } from "./importer";
import type { ProductImportRepository } from "./repository";
import type {
  ImportSnapshot,
  ProductImportRow,
  ReferenceProduct
} from "./types";
import { normalizeProductImports } from "./validate";

const snapshot: ImportSnapshot = {
  brands: [
    { id: "brand-gong", slug: "gong-cha", name: "Gong cha" },
    { id: "brand-chatime", slug: "chatime", name: "Chatime" }
  ],
  categories: [
    { id: "category-milk", slug: "milk-tea", name: "Milk Tea" },
    { id: "category-fruit", slug: "fruit-tea", name: "Fruit Tea" }
  ],
  locations: [
    {
      id: "location-albany",
      brandId: "brand-gong",
      slug: "gong-cha-albany",
      displayName: "Gong cha Albany",
      publicationStatus: "published"
    },
    {
      id: "location-newmarket",
      brandId: "brand-gong",
      slug: "gong-cha-newmarket",
      displayName: "Gong cha Newmarket",
      publicationStatus: "draft"
    },
    {
      id: "location-chatime",
      brandId: "brand-chatime",
      slug: "chatime-auckland-cbd",
      displayName: "Chatime Auckland CBD",
      publicationStatus: "published"
    }
  ],
  products: [
    {
      id: "product-existing",
      brandId: "brand-gong",
      categoryId: "category-milk",
      name: "Brown Sugar Pearl Milk Tea",
      slug: "brown-sugar-pearl-milk-tea",
      description: "Black tea, milk and brown sugar pearls.",
      tags: ["brown-sugar", "pearls"],
      seasonal: false,
      isPublished: true
    }
  ],
  locationProducts: [
    { locationId: "location-albany", productId: "product-existing" }
  ]
};

function row(overrides: Partial<ProductImportRow> = {}): ProductImportRow {
  return {
    rowNumber: 2,
    brandSlug: "gong-cha",
    name: "New Milk Tea",
    slug: "new-milk-tea",
    categorySlug: "milk-tea",
    tags: ["classic"],
    seasonal: false,
    availability: { mode: "unknown" },
    ...overrides
  };
}

function createRecordingRepository() {
  const calls = {
    creates: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    links: [] as Array<Record<string, unknown>>
  };
  const repository: ProductImportRepository = {
    async loadSnapshot() {
      return snapshot;
    },
    async createProduct(input) {
      calls.creates.push(input);
      return "product-created";
    },
    async updateProduct(input) {
      calls.updates.push(input);
    },
    async createLocationProduct(input) {
      calls.links.push(input);
    }
  };
  return { repository, calls };
}

test("parses CSV quoting and JSON arrays", () => {
  const csv = parseProductFile(
    'brand_slug,product_name,category_slug,description\ngong-cha,Tea,milk-tea,"Tea, milk"\n',
    "products.csv"
  );
  expect(csv[0].values.description).toBe("Tea, milk");

  const json = parseProductFile(
    '[{"brand_slug":"gong-cha","product_name":"Tea","category_slug":"milk-tea"}]',
    "products.json"
  );
  expect(json).toHaveLength(1);
});

test("generates a shared canonical slug and rejects price fields", () => {
  const normalized = normalizeProductImports(
    parseProductFile(
      "brand_slug,product_name,category_slug\ngong-cha,Téa & Co.,milk-tea\n",
      "products.csv"
    )
  );
  expect(normalized.rows[0].slug).toBe("tea-co");

  expect(() =>
    parseProductFile(
      "brand_slug,product_name,category_slug,price_cents\ngong-cha,Tea,milk-tea,750\n",
      "products.csv"
    )
  ).toThrow("WM-48 does not import prices");
});

test("reports unknown brands and categories without guessing", () => {
  const plan = planImport(
    [
      row({ brandSlug: "unknown-brand" }),
      row({ rowNumber: 3, categorySlug: "special-drinks" })
    ],
    snapshot
  );

  expect(plan.counts.error).toBe(2);
  expect(plan.rows[0].issues[0].message).toContain("brand");
  expect(plan.rows[1].issues[0].message).toContain("category");
});

test("rejects selected locations belonging to another brand", () => {
  const plan = planImport(
    [
      row({
        availability: {
          mode: "selected",
          locationSlugs: ["chatime-auckland-cbd"]
        }
      })
    ],
    snapshot
  );

  expect(plan.counts.error).toBe(1);
  expect(plan.rows[0].issues[0].message).toContain("different brand");
});

test("resolves all current non-archived brand locations", () => {
  const plan = planImport(
    [row({ availability: { mode: "all-current-brand-locations" } })],
    snapshot
  );

  expect(plan.rows[0].locations.map((location) => location.slug)).toEqual([
    "gong-cha-albany",
    "gong-cha-newmarket"
  ]);
  expect(plan.counts.locationLinks).toBe(2);
});

test("exact existing products are skipped and repeated identity is rejected", () => {
  const existing: ReferenceProduct = snapshot.products[0];
  const plan = planImport(
    [
      row({
        name: existing.name,
        slug: existing.slug,
        categorySlug: "milk-tea",
        description: existing.description ?? undefined,
        tags: existing.tags,
        seasonal: existing.seasonal
      }),
      row({ rowNumber: 3, name: existing.name, slug: existing.slug })
    ],
    snapshot
  );

  expect(plan.rows[0].action).toBe("skip");
  expect(plan.rows[1].action).toBe("error");
  expect(plan.rows[1].issues[0].kind).toBe("duplicate");
});

test("dry-run planning performs no writes", () => {
  const fake = createRecordingRepository();
  const plan = planImport(
    [
      row({
        availability: { mode: "selected", locationSlugs: ["gong-cha-albany"] }
      })
    ],
    snapshot
  );

  expect(plan.counts.error).toBe(0);
  expect(fake.calls.creates).toHaveLength(0);
  expect(fake.calls.updates).toHaveLength(0);
  expect(fake.calls.links).toHaveLength(0);
});

test("apply creates a draft product and only missing location links", async () => {
  const fake = createRecordingRepository();
  const plan = planImport(
    [
      row({
        availability: {
          mode: "all-current-brand-locations"
        }
      })
    ],
    snapshot
  );

  const result = await applyImport(plan, fake.repository);
  expect(result).toMatchObject({
    createdProducts: 1,
    locationRelationshipsCreated: 2
  });
  expect(fake.calls.creates[0]).toMatchObject({ isPublished: false });
  expect(fake.calls.links).toHaveLength(2);
  expect(fake.calls.links[0]).not.toHaveProperty("price_cents");
});

test("apply never writes when validation errors exist", async () => {
  const fake = createRecordingRepository();
  const plan = planImport([row({ brandSlug: "missing" })], snapshot);

  await expect(applyImport(plan, fake.repository)).rejects.toThrow(
    "validation errors"
  );
  expect(fake.calls.creates).toHaveLength(0);
  expect(fake.calls.updates).toHaveLength(0);
  expect(fake.calls.links).toHaveLength(0);
});

test("partial invalid input keeps the valid row and reports the invalid row", () => {
  const normalized = normalizeProductImports([
    {
      rowNumber: 2,
      values: {
        brand_slug: "gong-cha",
        product_name: "Valid Tea",
        category_slug: "milk-tea"
      }
    },
    {
      rowNumber: 3,
      values: {
        brand_slug: "gong-cha",
        product_name: "",
        category_slug: "milk-tea"
      }
    }
  ]);
  const plan = planImport(normalized.rows, snapshot, normalized.issues);

  expect(plan.rows).toHaveLength(1);
  expect(plan.issues).toHaveLength(1);
  expect(plan.counts.error).toBe(1);
});
