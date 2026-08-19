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

function responseFor(table: string, single: boolean) {
  if (table === "brands") return { data: brands, error: null };
  if (table === "categories") {
    return categoriesError
      ? { data: null, error: { message: "categories unavailable" } }
      : { data: categories, error: null };
  }
  if (table === "locations") return { data: locations, error: null };
  if (table === "products" && single) {
    return { data: existingProduct, error: null };
  }
  if (table === "product_images") return { data: null, error: null };
  if (table === "location_products") return { data: [], error: null };
  return { data: [], error: null };
}

function queryFor(table: string) {
  let single = false;
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    maybeSingle: () => {
      single = true;
      return Promise.resolve(responseFor(table, single));
    },
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(responseFor(table, single)).then(resolve)
  };
  return query;
}

const supabaseMock = {
  from: (table: string) => queryFor(table),
  rpc: mock(() => Promise.resolve({ data: null, error: null }))
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
