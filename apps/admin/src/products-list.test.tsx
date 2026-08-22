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
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

const brandId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-19T00:00:00.000Z";
const brands = [{ id: brandId, name: "Gong Cha", slug: "gong-cha" }];
const categories = [{ id: categoryId, name: "Milk Tea", slug: "milk-tea" }];
const products = Array.from({ length: 40 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  brand_id: brandId,
  category_id: categoryId,
  name: index === 0 ? "Oolong Milk Tea" : `Product ${index + 1}`,
  slug: index === 0 ? "oolong-milk-tea" : `product-${index + 1}`,
  description: null,
  is_seasonal: false,
  is_published: index < 30,
  created_at: timestamp,
  updated_at: timestamp,
  brands: brands[0],
  categories: categories[0]
}));

const finalRequests: Array<{
  status: boolean | null;
  ids: string[] | null;
  from: number;
  to: number;
  countOption: string;
  orderFields: string[];
}> = [];
const lookupCalls: Array<{ table: string; field: string }> = [];

function queryFor(table: string) {
  let status: boolean | null = null;
  let idFilter: string[] | null = null;
  let idFilterField = "";
  let ilikeField = "";
  let ilikeValue = "";
  let countOption = "";
  const orderFields: string[] = [];
  const query = {
    select: (value: string, options?: { count?: string }) => {
      void value;
      countOption = options?.count ?? "";
      return query;
    },
    ilike: (field: string, value: string) => {
      ilikeField = field;
      ilikeValue = value.toLowerCase().replaceAll("%", "");
      lookupCalls.push({ table, field });
      return query;
    },
    in: (field: string, values: string[]) => {
      if (field === "id" || field === "brand_id" || field === "category_id") {
        idFilterField = field;
        idFilter = values;
      }
      return query;
    },
    eq: (field: string, value: boolean) => {
      if (field === "is_published") status = value;
      return query;
    },
    order: (field: string) => {
      orderFields.push(field);
      return query;
    },
    range: (from: number, to: number) => {
      const matching = products.filter((product) => {
        if (status !== null && product.is_published !== status) return false;
        if (idFilter && !idFilter.includes(product.id)) return false;
        return true;
      });
      finalRequests.push({
        status,
        ids: idFilter,
        from,
        to,
        countOption,
        orderFields: [...orderFields]
      });
      return Promise.resolve({
        data: matching.slice(from, to + 1),
        error: null,
        count: matching.length
      });
    },
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
      if (table === "brands") {
        const match = ilikeValue
          ? brands.filter((brand) =>
              brand.name.toLowerCase().includes(ilikeValue)
            )
          : brands;
        return Promise.resolve({ data: match, error: null }).then(resolve);
      }
      if (table === "categories") {
        const match = ilikeValue
          ? categories.filter((category) =>
              category.name.toLowerCase().includes(ilikeValue)
            )
          : categories;
        return Promise.resolve({ data: match, error: null }).then(resolve);
      }
      const matching = products.filter((product) => {
        if (ilikeField) {
          return product[ilikeField as "name" | "slug"]
            .toLowerCase()
            .includes(ilikeValue);
        }
        if (idFilter) {
          if (idFilterField === "brand_id") {
            return idFilter.includes(product.brand_id);
          }
          if (idFilterField === "category_id") {
            return idFilter.includes(product.category_id);
          }
          return idFilter.includes(product.id);
        }
        return true;
      });
      return Promise.resolve({
        data: matching.map((product) => ({ id: product.id })),
        error: null
      }).then(resolve);
    }
  };
  return query;
}

const supabaseMock = {
  from: (table: string) => queryFor(table)
};

mock.module("./lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));

const { ProductsPage } = await import("./products");

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderProducts(initialEntry = "/products") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/products" element={<ProductsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  finalRequests.length = 0;
  lookupCalls.length = 0;
});

afterEach(() => {
  installBrowserGlobals();
  cleanup();
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  "requests a bounded Product page with filtered exact count",
  async () => {
    const view = renderProducts();

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    expect(view.getAllByRole("row")).toHaveLength(26);
    expect(finalRequests[0]).toMatchObject({
      status: null,
      from: 0,
      to: 24,
      countOption: "exact",
      orderFields: ["updated_at", "id"]
    });

    fireEvent.click(view.getByRole("button", { name: "Next page" }));
    expect(await view.findByText("Product 26")).toBeTruthy();
    expect(view.getByTestId("location").textContent).toBe("/products?page=2");
    expect(finalRequests.at(-1)).toMatchObject({ from: 25, to: 49 });
  }
);

test.serial(
  "applies Product status server-side before pagination",
  async () => {
    const view = renderProducts("/products?status=published");

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    expect(view.getByText("Product 25")).toBeTruthy();
    expect(view.queryByText("Product 31")).toBeNull();
    expect(finalRequests.at(-1)).toMatchObject({
      status: true,
      from: 0,
      to: 24
    });
  }
);

test.serial(
  "resolves Brand search IDs before the bounded Product query",
  async () => {
    const view = renderProducts("/products?q=gong");

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    expect(lookupCalls).toContainEqual({ table: "brands", field: "name" });
    expect(finalRequests.at(-1)?.ids).toContain(products[0].id);
    expect(view.getByTestId("location").textContent).toBe("/products?q=gong");
  }
);

test.serial(
  "resolves Category search IDs before the bounded Product query",
  async () => {
    const view = renderProducts("/products?q=milk");

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    expect(lookupCalls).toContainEqual({ table: "categories", field: "name" });
    expect(finalRequests.at(-1)?.ids).toContain(products[0].id);
  }
);

test.serial("normalizes an out-of-range Product page", async () => {
  const view = renderProducts("/products?page=999");

  expect(await view.findByText("Product 26")).toBeTruthy();
  expect(view.getByTestId("location").textContent).toBe("/products?page=2");
  expect(finalRequests.at(-1)).toMatchObject({ from: 25, to: 49 });
});
