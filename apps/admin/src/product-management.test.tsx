import { GlobalWindow } from "happy-dom";

const browserWindow = new GlobalWindow();
const browserGlobals = [
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "MutationObserver"
] as const;
const originalGlobalDescriptors = new Map(
  browserGlobals.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(globalThis, property)
  ])
);

function installBrowserGlobals() {
  for (const property of browserGlobals) {
    Object.defineProperty(globalThis, property, {
      configurable: true,
      value: browserWindow[property]
    });
  }
}

installBrowserGlobals();

import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

const brandId = "11111111-1111-4111-8111-111111111111";
const milkTeaCategoryId = "22222222-2222-4222-8222-222222222222";
const fruitTeaCategoryId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const locationId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-08-19T00:00:00.000Z";

const categories = [
  { id: milkTeaCategoryId, name: "Milk Tea", slug: "milk-tea" },
  { id: fruitTeaCategoryId, name: "Fruit Tea", slug: "fruit-tea" }
];
const brands = [{ id: brandId, name: "WM Tea", slug: "wm-tea" }];
const locations = [
  {
    id: locationId,
    brand_id: brandId,
    display_name: "WM Tea Central",
    suburb: "Auckland CBD",
    publication_status: "draft"
  }
];
const existingProduct = {
  id: productId,
  brand_id: brandId,
  category_id: milkTeaCategoryId,
  name: "Brown Sugar Pearl Milk Tea",
  slug: "gong-cha-brown-sugar",
  description: null,
  discovery_tags: [],
  is_seasonal: false,
  is_published: false,
  created_at: timestamp,
  updated_at: timestamp,
  brands: { name: "WM Tea", slug: "wm-tea" },
  categories: { name: "Milk Tea", slug: "milk-tea" }
};

let categoriesError = false;
let currentProduct = {
  ...structuredClone(existingProduct),
  description: existingProduct.description as string | null
};
let locationRelationshipRows: unknown[] = [];
let locationRelationshipError: { message: string } | null = null;
const selectCalls: Array<{ table: string; selection: string }> = [];

function responseFor(table: string, single: boolean, selection: string) {
  if (table === "brands") return { data: brands, error: null };
  if (table === "categories") {
    return categoriesError
      ? { data: null, error: { message: "categories unavailable" } }
      : { data: categories, error: null };
  }
  if (table === "locations") return { data: locations, error: null };
  if (table === "products" && single) {
    return { data: currentProduct, error: null };
  }
  if (table === "product_images") return { data: null, error: null };
  if (table === "location_products" && selection.includes("locations!inner(")) {
    return {
      data: null,
      error: {
        message: "Could not embed because more than one relationship was found"
      }
    };
  }
  if (table === "location_products") {
    return { data: locationRelationshipRows, error: locationRelationshipError };
  }
  return { data: [], error: null };
}

function queryFor(table: string) {
  let single = false;
  let selection = "";
  const query = {
    select: (value: string) => {
      selection = value;
      selectCalls.push({ table, selection });
      return query;
    },
    order: () => query,
    eq: () => query,
    maybeSingle: () => {
      single = true;
      return Promise.resolve(responseFor(table, single, selection));
    },
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(responseFor(table, single, selection)).then(resolve)
  };
  return query;
}

const rpcMock = mock((name: string, args: Record<string, unknown>) => {
  if (name === "update_product_management") {
    currentProduct = {
      ...currentProduct,
      name: String(args.p_name),
      slug: String(args.p_slug),
      description: (args.p_description as string | null) ?? null,
      updated_at: "2026-08-19T00:01:00.000Z"
    };
  }
  return Promise.resolve({ data: null, error: null });
});

const supabaseMock = {
  from: (table: string) => queryFor(table),
  rpc: rpcMock
};

mock.module("./lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));

const { CategoryField, ProductManagementPage } = await import("./products");

function renderProduct(path: "/products/new" | "/products/:productId") {
  return render(
    <MemoryRouter
      initialEntries={[
        path === "/products/new" ? path : `/products/${productId}`
      ]}
    >
      <Routes>
        <Route
          path="/products/:productId"
          element={<ProductManagementPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  categoriesError = false;
  currentProduct = {
    ...structuredClone(existingProduct),
    description: existingProduct.description as string | null
  };
  locationRelationshipRows = [];
  locationRelationshipError = null;
  selectCalls.length = 0;
  rpcMock.mockClear();
});

afterEach(() => {
  installBrowserGlobals();
  cleanup();
});

afterAll(() => {
  for (const property of browserGlobals) {
    const descriptor = originalGlobalDescriptors.get(property);
    if (descriptor) {
      Object.defineProperty(globalThis, property, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[property];
    }
  }
});

test.serial(
  "renders canonical categories and keeps the selected ID",
  async () => {
    const view = renderProduct("/products/new");
    const category = await view.findByLabelText("Category");

    expect(category).toBeTruthy();
    expect(category.getAttribute("required")).toBe("");
    expect((category as HTMLSelectElement).value).toBe(milkTeaCategoryId);
    expect(view.getByRole("option", { name: "Milk Tea" })).toBeTruthy();
    expect(view.getByRole("option", { name: "Fruit Tea" })).toBeTruthy();

    fireEvent.change(category, { target: { value: fruitTeaCategoryId } });
    expect((category as HTMLSelectElement).value).toBe(fruitTeaCategoryId);
  }
);

test.serial("shows category loading, error, and empty states", () => {
  const loadingView = render(
    <CategoryField
      categories={[]}
      disabled={false}
      error={null}
      isLoading
      value=""
      onChange={() => {}}
    />
  );
  expect(
    loadingView.getByRole("option", { name: "Loading categories…" })
  ).toBeTruthy();
  expect(
    (loadingView.getByRole("combobox") as HTMLSelectElement).disabled
  ).toBe(true);
  loadingView.unmount();

  const errorView = render(
    <CategoryField
      categories={[]}
      disabled={false}
      error="Product categories could not be loaded. Please try again."
      isLoading={false}
      value=""
      onChange={() => {}}
    />
  );
  expect(errorView.getByRole("alert")).toBeTruthy();
  errorView.unmount();

  const emptyView = render(
    <CategoryField
      categories={[]}
      disabled={false}
      error={null}
      isLoading={false}
      value=""
      onChange={() => {}}
    />
  );
  expect(
    emptyView.getByText("No product categories are available.")
  ).toBeTruthy();
  expect((emptyView.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
    true
  );
});

test.serial(
  "auto-generates and then preserves a manually edited slug",
  async () => {
    const view = renderProduct("/products/new");
    const name = await view.findByLabelText("Product name");
    const slug = view.getByLabelText("Slug") as HTMLInputElement;

    fireEvent.input(name, {
      target: { value: "Brown Sugar Pearl Milk Tea" }
    });
    expect(slug.value).toBe("brown-sugar-pearl-milk-tea");

    fireEvent.change(name, {
      target: { value: "Brown Sugar Pearl Milk Tea Large" }
    });
    expect(slug.value).toBe("brown-sugar-pearl-milk-tea-large");

    fireEvent.change(slug, { target: { value: "brown-sugar-pearl" } });
    fireEvent.change(name, {
      target: { value: "Brown Sugar Pearl Fresh Milk" }
    });
    expect(slug.value).toBe("brown-sugar-pearl");
  }
);

test.serial("does not regenerate an existing product slug", async () => {
  const view = renderProduct("/products/:productId");
  const name = await view.findByLabelText("Product name");
  const slug = view.getByLabelText("Slug") as HTMLInputElement;

  expect(slug.value).toBe("gong-cha-brown-sugar");
  fireEvent.change(name, { target: { value: "Renamed Brown Sugar Tea" } });
  expect(slug.value).toBe("gong-cha-brown-sugar");
});

test.serial(
  "loads an existing draft with no image or availability rows",
  async () => {
    const view = renderProduct("/products/:productId");

    expect(
      await view.findByRole("heading", {
        name: "Product information"
      })
    ).toBeTruthy();
    expect((view.getByLabelText("Brand") as HTMLSelectElement).value).toBe(
      brandId
    );
    expect((view.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      milkTeaCategoryId
    );
    expect((view.getByLabelText("Slug") as HTMLInputElement).value).toBe(
      existingProduct.slug
    );
    expect(view.getByText(/No product image attached/)).toBeTruthy();
    expect(
      (view.getByLabelText("Availability") as HTMLSelectElement).value
    ).toBe("unknown");
    expect(
      view.queryByText("Product details could not be loaded. Please try again.")
    ).toBeNull();

    const relationshipSelect = selectCalls.find(
      ({ table }) => table === "location_products"
    );
    expect(relationshipSelect?.selection).toContain(
      "locations!location_products_location_id_fkey!inner"
    );
  }
);

test.serial(
  "loads a product with one valid location relationship",
  async () => {
    locationRelationshipRows = [
      {
        location_id: locationId,
        product_id: productId,
        brand_id: brandId,
        price_cents: 750,
        currency: "NZD",
        availability_status: "available",
        last_verified_at: timestamp,
        source_provenance: "wemilktea",
        source_reference: null,
        locations: locations[0]
      }
    ];

    const view = renderProduct("/products/:productId");

    expect(await view.findByText("WM Tea Central")).toBeTruthy();
    expect(
      (view.getByLabelText("Availability") as HTMLSelectElement).value
    ).toBe("available");
    expect(
      (view.getByLabelText("Price (cents)") as HTMLInputElement).value
    ).toBe("750");
  }
);

test.serial(
  "edits and saves an existing product without changing its slug",
  async () => {
    const view = renderProduct("/products/:productId");
    const name = await view.findByLabelText("Product name");
    const slug = view.getByLabelText("Slug") as HTMLInputElement;
    const description = view.getByLabelText("Description");

    fireEvent.change(name, { target: { value: "Renamed Brown Sugar Tea" } });
    fireEvent.change(description, { target: { value: "Updated draft" } });
    fireEvent.click(view.getByRole("button", { name: "Save changes" }));

    const status = await view.findByRole("status");
    expect(status.textContent).toBe("Product saved.");
    expect(slug.value).toBe(existingProduct.slug);
    expect(currentProduct.name).toBe("Renamed Brown Sugar Tea");
    expect(currentProduct.slug).toBe(existingProduct.slug);
    expect(currentProduct.description).toBe("Updated draft");
    expect(rpcMock).toHaveBeenCalledWith(
      "update_product_management",
      expect.objectContaining({
        p_product_id: productId,
        p_category_id: milkTeaCategoryId,
        p_slug: existingProduct.slug
      })
    );
  }
);
