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

const { cleanup, render } = await import("@testing-library/react");

const brandOneId = "11111111-1111-4111-8111-111111111111";
const brandTwoId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-19T00:00:00.000Z";
const brands = [
  { id: brandOneId, name: "Gong Cha", slug: "gong-cha" },
  { id: brandTwoId, name: "Tea Story", slug: "tea-story" }
];
const stores = Array.from({ length: 40 }, (_, index) => {
  const number = index + 1;
  const brand_id = number <= 30 ? brandOneId : brandTwoId;
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    brand_id,
    display_name: `Store ${number}`,
    slug: `store-${number}`,
    suburb: number % 2 === 0 ? "Albany" : "Waiheke",
    publication_status: number <= 25 ? "published" : "draft",
    created_at: timestamp,
    updated_at: timestamp
  };
});

const finalRequests: Array<{
  status: string | null;
  brandId: string | null;
  suburb: string | null;
  ids: string[] | null;
  from: number;
  to: number;
  countOption: string;
  orderFields: string[];
}> = [];
const lookupCalls: Array<{ field: string }> = [];

function queryFor(table: string) {
  let status: string | null = null;
  let brandId: string | null = null;
  let suburb: string | null = null;
  let idFilter: string[] | null = null;
  let idFilterField = "";
  let ilikeField = "";
  let ilikeValue = "";
  let countOption = "";
  const orderFields: string[] = [];
  const query = {
    select: (_value: string, options?: { count?: string }) => {
      countOption = options?.count ?? "";
      return query;
    },
    ilike: (field: string, value: string) => {
      ilikeField = field;
      ilikeValue = value.toLowerCase().replaceAll("%", "");
      lookupCalls.push({ field });
      return query;
    },
    in: (field: string, values: string[]) => {
      idFilterField = field;
      idFilter = values;
      return query;
    },
    eq: (field: string, value: string) => {
      if (field === "publication_status") status = value;
      if (field === "brand_id") brandId = value;
      if (field === "suburb") suburb = value;
      return query;
    },
    order: (field: string) => {
      orderFields.push(field);
      return query;
    },
    range: (from: number, to: number) => {
      const matching = stores.filter((store) => {
        if (status && store.publication_status !== status) return false;
        if (brandId && store.brand_id !== brandId) return false;
        if (suburb && store.suburb !== suburb) return false;
        if (idFilter && !idFilter.includes(store.id)) return false;
        return true;
      });
      finalRequests.push({
        status,
        brandId,
        suburb,
        ids: idFilterField === "id" ? idFilter : null,
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
        return Promise.resolve({ data: brands, error: null }).then(resolve);
      }
      if (idFilterField === "brand_id") {
        return Promise.resolve({
          data: stores
            .filter((store) => idFilter?.includes(store.brand_id))
            .map((store) => ({ id: store.id })),
          error: null
        }).then(resolve);
      }
      if (!ilikeField) {
        return Promise.resolve({
          data: stores.map((store) => ({ suburb: store.suburb })),
          error: null
        }).then(resolve);
      }
      const matching = stores.filter((store) => {
        if (ilikeField === "display_name")
          return store.display_name.toLowerCase().includes(ilikeValue);
        if (ilikeField === "slug") return store.slug.includes(ilikeValue);
        return store.suburb.toLowerCase().includes(ilikeValue);
      });
      return Promise.resolve({
        data: matching.map((store) => ({ id: store.id })),
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

const { StoresPage } = await import("./stores");

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderStores(initialEntry = "/stores") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/stores" element={<StoresPage />} />
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

test.serial("loads full Store options and a bounded page", async () => {
  const view = renderStores();

  expect(await view.findByText("Store 1")).toBeTruthy();
  expect(view.getAllByRole("row")).toHaveLength(26);
  expect(view.getByRole("option", { name: "Waiheke" })).toBeTruthy();
  expect(view.getByRole("option", { name: "Albany" })).toBeTruthy();
  expect(finalRequests.at(-1)).toMatchObject({
    from: 0,
    to: 24,
    countOption: "exact",
    orderFields: ["updated_at", "id"]
  });
});

test.serial(
  "applies Store status and reference filters before pagination",
  async () => {
    const view = renderStores(
      `/stores?status=published&brand=${brandOneId}&suburb=Albany`
    );

    expect(await view.findByText("Store 2")).toBeTruthy();
    expect(view.queryByText("Store 1")).toBeNull();
    expect(finalRequests.at(-1)).toMatchObject({
      status: "published",
      brandId: brandOneId,
      suburb: "Albany",
      from: 0,
      to: 24
    });
  }
);

test.serial(
  "resolves Store brand search IDs before the bounded query",
  async () => {
    const view = renderStores("/stores?q=gong");

    expect(await view.findByText("Store 1")).toBeTruthy();
    expect(finalRequests.at(-1)?.ids).toContain(stores[0].id);
    expect(view.getByTestId("location").textContent).toBe("/stores?q=gong");
  }
);

test.serial("normalizes an out-of-range Store page", async () => {
  const view = renderStores("/stores?page=999");

  expect(await view.findByText("Store 26")).toBeTruthy();
  expect(view.getByTestId("location").textContent).toBe("/stores?page=2");
  expect(finalRequests.at(-1)).toMatchObject({ from: 25, to: 49 });
});
