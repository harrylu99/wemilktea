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
  "HTMLImageElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "MutationObserver",
  "Image"
] as const;
const originalGlobalDescriptors = new Map(
  browserGlobals.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(globalThis, property)
  ])
);
for (const property of browserGlobals) {
  const existing = Object.getOwnPropertyDescriptor(globalThis, property);
  if (existing && !existing.configurable) continue;
  Object.defineProperty(globalThis, property, {
    configurable: true,
    value: browserWindow[property]
  });
}

import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { MemoryRouter } from "react-router-dom";

const { cleanup, fireEvent, render, screen, waitFor } =
  await import("@testing-library/react");
const pageTest = test.serial;

const brandOneId = "11111111-1111-4111-8111-111111111111";
const brandTwoId = "22222222-2222-4222-8222-222222222222";
const locationOneId = "33333333-3333-4333-8333-333333333333";
const locationTwoId = "44444444-4444-4444-8444-444444444444";
const milkTeaCategoryId = "55555555-5555-4555-8555-555555555555";
const fruitTeaCategoryId = "66666666-6666-4666-8666-666666666666";
const existingProductId = "77777777-7777-4777-8777-777777777777";
const possibleProductId = "88888888-8888-4888-8888-888888888888";

const brands = [
  { id: brandOneId, name: "Wucha", slug: "wucha" },
  { id: brandTwoId, name: "Other Tea", slug: "other-tea" }
];

const categories = [
  { id: milkTeaCategoryId, name: "Milk Tea", slug: "milk-tea" },
  { id: fruitTeaCategoryId, name: "Fruit Tea", slug: "fruit-tea" }
];

const locations = [
  {
    id: locationOneId,
    brand_id: brandOneId,
    display_name: "Wucha Central",
    slug: "wucha-central",
    suburb: "Auckland CBD",
    publication_status: "published",
    google_place_id: null
  },
  {
    id: locationTwoId,
    brand_id: brandTwoId,
    display_name: "Other Tea Central",
    slug: "other-tea-central",
    suburb: "Newmarket",
    publication_status: "published",
    google_place_id: null
  }
];

const products = [
  {
    id: existingProductId,
    brand_id: brandOneId,
    category_id: milkTeaCategoryId,
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea"
  },
  {
    id: possibleProductId,
    brand_id: brandOneId,
    category_id: fruitTeaCategoryId,
    name: "Mango Tea",
    slug: "mango-tea-legacy"
  }
];

const completeMenu = {
  locationId: locationOneId,
  provider: "uber_eats" as const,
  warnings: ["Modifier groups were returned but are not normalized by WM-52."],
  items: [
    {
      provider: "uber_eats" as const,
      externalItemId: "external-existing",
      name: "Brown Sugar Pearl Milk Tea",
      description: "Existing canonical item",
      sourceCategory: "Milk Tea",
      price: { amountMinor: 750, currency: "NZD" },
      imageUrl: "https://example.com/brown-sugar.jpg"
    },
    {
      provider: "uber_eats" as const,
      externalItemId: "external-possible",
      name: "Mango Tea",
      description: "Possible name match",
      sourceCategory: "Fruit Tea",
      price: null,
      imageUrl: null
    },
    {
      provider: "uber_eats" as const,
      externalItemId: "external-new",
      name: "Taro Milk Tea",
      description: "A new drink",
      sourceCategory: "Milk Tea",
      price: { amountMinor: 625, currency: "NZD" },
      imageUrl: null
    }
  ]
};

type InvokeResult = {
  data: unknown;
  error: { status?: number } | null;
};

let invokeMenu: () => Promise<InvokeResult>;
let writeCalls: string[];

function queryFor(table: string) {
  const dataByTable: Record<string, unknown> = {
    brands,
    categories,
    locations,
    products
  };
  const query = {
    select: () => query,
    eq: () => query,
    order: () =>
      Promise.resolve({ data: dataByTable[table] ?? [], error: null }),
    insert: () => {
      writeCalls.push(`${table}.insert`);
      return Promise.resolve({ data: null, error: null });
    },
    update: () => {
      writeCalls.push(`${table}.update`);
      return query;
    },
    upsert: () => {
      writeCalls.push(`${table}.upsert`);
      return Promise.resolve({ data: null, error: null });
    },
    delete: () => {
      writeCalls.push(`${table}.delete`);
      return query;
    }
  };
  return query;
}

const supabaseMock = {
  from: (table: string) => queryFor(table),
  functions: {
    invoke: () => invokeMenu()
  }
};

mock.module("./lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));

const { ProductsImportMenuPage } = await import("./products-import-menu");

function page() {
  return render(
    <MemoryRouter>
      <ProductsImportMenuPage />
    </MemoryRouter>
  );
}

async function chooseBrandAndStore() {
  page();
  await screen.findByLabelText("Brand");
  fireEvent.change(screen.getByLabelText("Brand"), {
    target: { value: brandOneId }
  });
  await screen.findByRole("option", { name: /Wucha Central/ });
  fireEvent.change(screen.getByLabelText("Store"), {
    target: { value: locationOneId }
  });
  await waitFor(() => {
    expect(
      (screen.getByRole("button", { name: "Fetch menu" }) as HTMLButtonElement)
        .disabled
    ).toBeFalse();
  });
}

async function fetchCompleteMenu() {
  await chooseBrandAndStore();
  fireEvent.click(screen.getByRole("button", { name: "Fetch menu" }));
  await screen.findByText("Brown Sugar Pearl Milk Tea");
}

beforeEach(() => {
  writeCalls = [];
  invokeMenu = () => Promise.resolve({ data: completeMenu, error: null });
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  cleanup();
  for (const property of browserGlobals) {
    const original = originalGlobalDescriptors.get(property);
    if (original) {
      Object.defineProperty(globalThis, property, original);
    } else {
      delete globalThis[property];
    }
  }
});

pageTest("renders Brand, Store, and Source controls", async () => {
  page();

  expect(await screen.findByLabelText("Brand")).toBeTruthy();
  expect(screen.getByLabelText("Store")).toBeTruthy();
  expect(screen.getByLabelText("Source")).toBeTruthy();
  expect(screen.getByRole("option", { name: "Uber Eats" })).toBeTruthy();
});

pageTest(
  "shows a disabled loading state while external-menu is pending",
  async () => {
    let resolveMenu!: (result: InvokeResult) => void;
    invokeMenu = () =>
      new Promise((resolve) => {
        resolveMenu = resolve;
      });

    await chooseBrandAndStore();
    const fetchButton = screen.getByRole("button", { name: "Fetch menu" });
    fireEvent.click(fetchButton);

    expect((fetchButton as HTMLButtonElement).disabled).toBeTrue();
    expect(screen.getByText("Fetching menu…")).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Fetching normalized Uber Eats menu" })
    ).toBeTruthy();

    resolveMenu({ data: completeMenu, error: null });
    await screen.findByText("Brown Sugar Pearl Milk Tea");
  }
);

pageTest("renders the safe missing-mapping message for a 404", async () => {
  invokeMenu = () => Promise.resolve({ data: null, error: { status: 404 } });

  await chooseBrandAndStore();
  fireEvent.click(screen.getByRole("button", { name: "Fetch menu" }));

  expect(
    await screen.findByText("This store is not connected to Uber Eats.")
  ).toBeTruthy();
});

pageTest("renders an empty-menu state without an import action", async () => {
  invokeMenu = () =>
    Promise.resolve({
      data: { ...completeMenu, items: [] },
      error: null
    });

  await chooseBrandAndStore();
  fireEvent.click(screen.getByRole("button", { name: "Fetch menu" }));

  expect(await screen.findByText("No menu items returned")).toBeTruthy();
  expect(screen.getByText(/empty normalized menu/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /import products|create products/i })
  ).toBeNull();
  expect(writeCalls).toEqual([]);
});

pageTest(
  "renders normalized item fields, source price, and image fallback",
  async () => {
    await fetchCompleteMenu();

    expect(screen.getByText("Existing canonical item")).toBeTruthy();
    expect(screen.getAllByText("Milk Tea").length).toBeGreaterThan(0);
    expect(screen.getByText("$7.50")).toBeTruthy();
    expect(
      screen.getByAltText("Source preview for Brown Sugar Pearl Milk Tea")
    ).toBeTruthy();
    expect(screen.getAllByText("No preview").length).toBe(2);
    expect(screen.getByText("Review warning")).toBeTruthy();
  }
);

pageTest(
  "presents duplicate statuses and leaves matches unselected",
  async () => {
    await fetchCompleteMenu();

    expect(
      screen.getByText("Existing product · Brown Sugar Pearl Milk Tea")
    ).toBeTruthy();
    expect(screen.getByText("Possible match · Mango Tea")).toBeTruthy();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Brown Sugar Pearl Milk Tea"
        }) as HTMLInputElement
      ).checked
    ).toBeFalse();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Mango Tea"
        }) as HTMLInputElement
      ).checked
    ).toBeFalse();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Taro Milk Tea"
        }) as HTMLInputElement
      ).checked
    ).toBeTrue();
  }
);

pageTest(
  "updates selected count when an item is selected and deselected",
  async () => {
    await fetchCompleteMenu();

    expect(
      screen.getByText("Selected for WM-54:").parentElement?.textContent
    ).toContain("1 of 3");
    const existingCheckbox = screen.getByRole("checkbox", {
      name: "Select Brown Sugar Pearl Milk Tea"
    });
    fireEvent.click(existingCheckbox);
    expect(
      screen.getByText("Selected for WM-54:").parentElement?.textContent
    ).toContain("2 of 3");
    fireEvent.click(existingCheckbox);
    expect(
      screen.getByText("Selected for WM-54:").parentElement?.textContent
    ).toContain("1 of 3");
  }
);

pageTest(
  "validates and then accepts a canonical category for a selected item",
  async () => {
    invokeMenu = () =>
      Promise.resolve({
        data: {
          ...completeMenu,
          items: [
            {
              ...completeMenu.items[2],
              name: "Uncategorised Tea",
              sourceCategory: null
            }
          ]
        },
        error: null
      });

    await chooseBrandAndStore();
    fireEvent.click(screen.getByRole("button", { name: "Fetch menu" }));

    expect(
      await screen.findByText("Select a canonical category.")
    ).toBeTruthy();
    const category = screen.getByRole("combobox", {
      name: /WeMilktea category/
    });
    fireEvent.change(category, { target: { value: fruitTeaCategoryId } });
    await waitFor(() => {
      expect(screen.queryByText("Select a canonical category.")).toBeNull();
    });
  }
);

pageTest(
  "clears the store and reviewed menu when the brand changes",
  async () => {
    await fetchCompleteMenu();
    expect(screen.getByText("Brown Sugar Pearl Milk Tea")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: brandTwoId }
    });

    await waitFor(() => {
      expect((screen.getByLabelText("Store") as HTMLSelectElement).value).toBe(
        ""
      );
    });
    expect(screen.queryByText("Brown Sugar Pearl Milk Tea")).toBeNull();
  }
);

pageTest(
  "does not call product or location-product writes during review",
  async () => {
    await fetchCompleteMenu();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Brown Sugar Pearl Milk Tea"
      })
    );
    const category = screen
      .getAllByRole("combobox")
      .find((control) => control.id.startsWith("category-"));
    if (!category) throw new Error("category control was not rendered");
    fireEvent.change(category, {
      target: { value: fruitTeaCategoryId }
    });

    expect(writeCalls).toEqual([]);
  }
);
