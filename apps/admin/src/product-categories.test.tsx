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
  "HTMLTextAreaElement",
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
import { MemoryRouter } from "react-router-dom";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

const milkTeaId = "11111111-1111-4111-8111-111111111111";
const fruitTeaId = "22222222-2222-4222-8222-222222222222";
const matchaId = "33333333-3333-4333-8333-333333333333";

const initialCategories = [
  {
    id: fruitTeaId,
    name: "Fruit Tea",
    slug: "fruit-tea",
    description: "Fruit flavours",
    sort_order: 20,
    is_published: true
  },
  {
    id: milkTeaId,
    name: "Milk Tea",
    slug: "milk-tea",
    description: "Classic milk tea",
    sort_order: 10,
    is_published: true
  },
  {
    id: matchaId,
    name: "Matcha",
    slug: "matcha",
    description: null,
    sort_order: 30,
    is_published: false
  }
];

let categoryRows = structuredClone(initialCategories);
let productReferences = [
  { category_id: milkTeaId },
  { category_id: milkTeaId },
  { category_id: fruitTeaId }
];
let categoriesReadError: { code?: string; message?: string } | null = null;
let productsReadError: { code?: string; message?: string } | null = null;
let mutationError: { code?: string; message?: string } | null = null;
let mutationCalls: Array<{
  operation: "insert" | "update";
  values: Record<string, unknown>;
  id?: string;
}> = [];

function categoryQuery() {
  let operation: "read" | "insert" | "update" = "read";
  let updateId: string | undefined;
  let values: Record<string, unknown> = {};
  const query = {
    select: () => query,
    order: () => query,
    eq: (_field: string, value: string) => {
      updateId = value;
      return query;
    },
    insert: (nextValues: Record<string, unknown>) => {
      operation = "insert";
      values = nextValues;
      return query;
    },
    update: (nextValues: Record<string, unknown>) => {
      operation = "update";
      values = nextValues;
      return query;
    },
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
      if (operation === "read") {
        return Promise.resolve({
          data: [...categoryRows].sort(
            (left, right) =>
              left.sort_order - right.sort_order ||
              left.name.localeCompare(right.name)
          ),
          error: categoriesReadError
        }).then(resolve);
      }

      mutationCalls.push({
        operation,
        values,
        ...(updateId ? { id: updateId } : {})
      });
      if (!mutationError) {
        if (operation === "insert") {
          categoryRows = [
            ...categoryRows,
            {
              ...(values as Omit<(typeof categoryRows)[number], "id">),
              id: "55555555-5555-4555-8555-555555555555"
            }
          ];
        } else {
          categoryRows = categoryRows.map((category) =>
            category.id === updateId ? { ...category, ...values } : category
          );
        }
      }
      return Promise.resolve({ data: null, error: mutationError }).then(
        resolve
      );
    }
  };
  return query;
}

function productsQuery() {
  const query = {
    select: () => query,
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({
        data: productReferences,
        error: productsReadError
      }).then(resolve)
  };
  return query;
}

const supabaseMock = {
  from: (table: string) =>
    table === "categories" ? categoryQuery() : productsQuery()
};

mock.module("./lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));

const { ProductCategoriesPage } = await import("./product-categories");

function renderCategories() {
  return render(
    <MemoryRouter initialEntries={["/products/categories"]}>
      <ProductCategoriesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  categoryRows = structuredClone(initialCategories);
  productReferences = [
    { category_id: milkTeaId },
    { category_id: milkTeaId },
    { category_id: fruitTeaId }
  ];
  categoriesReadError = null;
  productsReadError = null;
  mutationError = null;
  mutationCalls = [];
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
  "renders categories in sort order with product counts",
  async () => {
    const view = renderCategories();
    expect(
      view.getByRole("status", { name: "Loading product categories" })
    ).toBeTruthy();

    const rows = await view.findAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1].textContent).toContain("Milk Tea");
    expect(rows[1].textContent).toContain("2");
    expect(rows[1].textContent).toContain("Published");
    expect(rows[2].textContent).toContain("Fruit Tea");
    expect(rows[3].textContent).toContain("Matcha");
  }
);

test.serial("renders empty and error states", async () => {
  categoryRows = [];
  const emptyView = renderCategories();
  expect(await emptyView.findByText("No product categories yet.")).toBeTruthy();
  expect(
    emptyView.getAllByRole("button", { name: "+ Add category" })[0]
  ).toBeTruthy();
  emptyView.unmount();

  categoriesReadError = { message: "query failed" };
  const errorView = renderCategories();
  expect(await errorView.findByRole("alert")).toBeTruthy();
  expect(errorView.getByRole("button", { name: "Retry" })).toBeTruthy();
});

test.serial(
  "generates a canonical slug and preserves a manual override",
  async () => {
    const view = renderCategories();
    await view.findByRole("row", { name: /Milk Tea/ });
    fireEvent.click(view.getByRole("button", { name: "+ Add category" }));

    const name = view.getByLabelText("Name *");
    const slug = view.getByLabelText("Slug *") as HTMLInputElement;
    fireEvent.input(name, { target: { value: "Matcha & Green Tea" } });
    expect(slug.value).toBe("matcha-green-tea");

    fireEvent.change(name, { target: { value: "Matcha and Green Tea" } });
    expect(slug.value).toBe("matcha-and-green-tea");
    fireEvent.change(slug, { target: { value: "green-tea-custom" } });
    fireEvent.change(name, { target: { value: "Matcha Tea" } });
    expect(slug.value).toBe("green-tea-custom");

    fireEvent.change(view.getByLabelText("Sort order *"), {
      target: { value: "40" }
    });
    fireEvent.click(view.getByRole("button", { name: "Save category" }));

    expect((await view.findByRole("status")).textContent).toContain(
      "Product category created."
    );
    expect(mutationCalls[0]).toMatchObject({
      operation: "insert",
      values: {
        name: "Matcha Tea",
        slug: "green-tea-custom",
        sort_order: 40,
        is_published: true
      }
    });
  }
);

test.serial(
  "editing preserves the established slug and updates metadata",
  async () => {
    const view = renderCategories();
    await view.findByRole("row", { name: /Milk Tea/ });
    fireEvent.click(view.getAllByRole("button", { name: "Edit" })[0]);

    const name = view.getByLabelText("Name *");
    const slug = view.getByLabelText("Slug *") as HTMLInputElement;
    expect(slug.value).toBe("milk-tea");
    fireEvent.change(name, { target: { value: "Classic Milk Tea" } });
    expect(slug.value).toBe("milk-tea");
    fireEvent.change(view.getByLabelText("Description"), {
      target: { value: "Updated description" }
    });
    fireEvent.change(view.getByLabelText("Sort order *"), {
      target: { value: "15" }
    });
    fireEvent.click(view.getByRole("button", { name: "Save category" }));

    expect((await view.findByRole("status")).textContent).toContain(
      "Product category saved."
    );
    expect(mutationCalls[0]).toMatchObject({
      operation: "update",
      id: milkTeaId,
      values: {
        name: "Classic Milk Tea",
        slug: "milk-tea",
        description: "Updated description",
        sort_order: 15
      }
    });
  }
);

test.serial(
  "unpublishing referenced categories requires confirmation",
  async () => {
    const view = renderCategories();
    await view.findByRole("row", { name: /Milk Tea/ });
    fireEvent.click(view.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.click(view.getByLabelText("Published"));
    fireEvent.click(view.getByRole("button", { name: "Save category" }));

    const dialog = await view.findByRole("dialog");
    expect(dialog.textContent).toContain(
      "2 products currently use this category."
    );
    expect(mutationCalls).toHaveLength(0);
    fireEvent.click(dialog.querySelector("button") as HTMLButtonElement);
    expect(view.queryByRole("dialog")).toBeNull();
    expect(mutationCalls).toHaveLength(0);

    fireEvent.click(view.getByRole("button", { name: "Save category" }));
    const confirmation = await view.findByRole("dialog");
    fireEvent.click(
      confirmation.querySelectorAll("button")[1] as HTMLButtonElement
    );
    expect((await view.findByRole("status")).textContent).toContain(
      "Product category saved."
    );
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0]).toMatchObject({
      operation: "update",
      id: milkTeaId,
      values: { is_published: false }
    });
  }
);

test.serial(
  "unpublishing a zero-use category saves without confirmation",
  async () => {
    productReferences = [];
    const view = renderCategories();
    await view.findByRole("row", { name: /Milk Tea/ });
    fireEvent.click(view.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.click(view.getByLabelText("Published"));
    fireEvent.click(view.getByRole("button", { name: "Save category" }));

    expect(view.queryByRole("dialog")).toBeNull();
    expect((await view.findByRole("status")).textContent).toContain(
      "Product category saved."
    );
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0].values).toMatchObject({ is_published: false });
  }
);

test.serial("maps duplicate-name failures to useful feedback", async () => {
  mutationError = {
    code: "23505",
    message:
      "duplicate key value violates unique constraint categories_name_key"
  };
  const view = renderCategories();
  await view.findByRole("row", { name: /Milk Tea/ });
  fireEvent.click(view.getByRole("button", { name: "+ Add category" }));
  fireEvent.input(view.getByLabelText("Name *"), {
    target: { value: "Milk Tea" }
  });
  fireEvent.click(view.getByRole("button", { name: "Save category" }));

  expect((await view.findByRole("alert")).textContent).toContain(
    "A category with that name already exists."
  );
});

test.serial("maps duplicate-slug failures to useful feedback", async () => {
  mutationError = {
    code: "23505",
    message:
      "duplicate key value violates unique constraint categories_slug_key"
  };
  const view = renderCategories();
  await view.findByRole("row", { name: /Milk Tea/ });
  fireEvent.click(view.getByRole("button", { name: "+ Add category" }));
  fireEvent.input(view.getByLabelText("Name *"), {
    target: { value: "Another Tea" }
  });
  fireEvent.input(view.getByLabelText("Slug *"), {
    target: { value: "milk-tea" }
  });
  fireEvent.click(view.getByRole("button", { name: "Save category" }));

  expect((await view.findByRole("alert")).textContent).toContain(
    "That category slug is already in use."
  );
});
