import { GlobalWindow } from "happy-dom";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";

const browserWindow = new GlobalWindow();
browserWindow.location.href = "http://localhost:5173/drinks";
const browserGlobals = [
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
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

const { act, cleanup, fireEvent, render } =
  await import("@testing-library/react");
const { MemoryRouter, useLocation, useNavigate } =
  await import("react-router-dom");
const { ThemeContext } = await import("../theme-context");

const sampleDrink = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Oolong Milk Tea",
  slug: "oolong-milk-tea",
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
};
const sampleCategory = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Milk Tea",
  slug: "milk-tea"
};
type DrinkResult =
  | { data: Array<typeof sampleDrink>; totalResults: number; error: null }
  | { data: null; totalResults: 0; error: string };
type CategoryResult =
  | { data: Array<typeof sampleCategory>; error: null }
  | { data: null; error: string };

const drinkSuccess: DrinkResult = {
  data: [sampleDrink],
  totalResults: 1,
  error: null
};
const categorySuccess: CategoryResult = {
  data: [sampleCategory],
  error: null
};
let nextDrinkResults: DrinkResult[] = [];
let nextCategoryResults: CategoryResult[] = [];
let deferredDrinks = false;
const pendingDrinks: Array<(result: DrinkResult) => void> = [];
let categoryCalls = 0;
const drinkCalls: Array<{
  query: string;
  categorySlug: string;
  page: number;
  pageSize: number;
}> = [];

const realDrinksData = await import("./data");
mock.module("./data", () => ({
  ...realDrinksData,
  drinkDetailPath: (drink: typeof sampleDrink) =>
    `/drinks/${drink.brandSlug}/${drink.slug}`,
  loadPublicDrinkCategories: () => {
    categoryCalls += 1;
    return Promise.resolve(nextCategoryResults.shift() ?? categorySuccess);
  },
  loadPublicDrinksPage: (options: (typeof drinkCalls)[number]) => {
    drinkCalls.push(options);
    if (deferredDrinks) {
      return new Promise<DrinkResult>((resolve) => {
        pendingDrinks.push(resolve);
      });
    }
    return Promise.resolve(nextDrinkResults.shift() ?? drinkSuccess);
  }
}));

const { DrinksPage } = await import("./page");
const { maxPageForOffset } = await import("./pagination");

function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location">
        {location.pathname}
        {location.search}
      </div>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

function renderDrinks(
  options: {
    initialEntries?: string[];
    initialIndex?: number;
    historyControls?: boolean;
  } = {}
) {
  return render(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter
        initialEntries={options.initialEntries ?? ["/drinks"]}
        initialIndex={options.initialIndex}
      >
        {options.historyControls ? <HistoryProbe /> : null}
        <DrinksPage />
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  nextDrinkResults = [];
  nextCategoryResults = [];
  deferredDrinks = false;
  pendingDrinks.length = 0;
  categoryCalls = 0;
  drinkCalls.length = 0;
});

afterEach(() => {
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
  "keeps drink results usable and retries categories independently",
  async () => {
    nextCategoryResults = [
      { data: null, error: "query_failed" },
      categorySuccess
    ];
    const view = renderDrinks();

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    expect(
      await view.findByText("Drink categories are unavailable right now.")
    ).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Retry categories" }));

    expect(
      view.queryByText("Drink categories are unavailable right now.")
    ).toBe(null);
    fireEvent.click(view.getByRole("button", { name: "Filters" }));
    expect(await view.findByText("Milk Tea")).toBeTruthy();
    expect(categoryCalls).toBe(2);
  }
);

test.serial("retries a failed Drinks request without remounting", async () => {
  nextDrinkResults = [
    { data: null, totalResults: 0, error: "query_failed" },
    drinkSuccess
  ];
  const view = renderDrinks({ initialEntries: ["/drinks?q=matcha"] });

  expect(
    await view.findByText("Drinks are unavailable right now. Please try again.")
  ).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Try again" }));
  expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
});

test.serial(
  "loads an extreme direct page URL without an availability error",
  async () => {
    const view = renderDrinks({
      initialEntries: ["/drinks?page=107374184"]
    });

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    expect(
      view.queryByText("Drinks are unavailable right now. Please try again.")
    ).toBeNull();
    expect(drinkCalls[0]?.page).toBe(maxPageForOffset());
  }
);

test.serial(
  "Back navigation synchronizes Drinks input without overwriting the URL",
  async () => {
    const view = renderDrinks({
      historyControls: true,
      initialEntries: ["/drinks?q=matcha", "/drinks?q=taro"],
      initialIndex: 1
    });

    expect(await view.findByText("Oolong Milk Tea")).toBeTruthy();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Back" }));
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(view.getByTestId("location").textContent).toBe("/drinks?q=matcha");
    expect((view.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "matcha"
    );
    expect(drinkCalls.at(-1)?.query).toBe("matcha");
  }
);

test.serial("ignores a stale Drinks response after a newer query", async () => {
  deferredDrinks = true;
  const olderDrink = { ...sampleDrink, name: "Older Drink" };
  const newerDrink = { ...sampleDrink, name: "Newer Drink" };
  const view = renderDrinks({ initialEntries: ["/drinks?q=first"] });
  expect(await view.findByRole("status")).toBeTruthy();

  fireEvent.change(view.getByRole("searchbox"), {
    target: { value: "second" }
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(pendingDrinks).toHaveLength(2);

  await act(async () => {
    pendingDrinks[1]?.({ data: [newerDrink], totalResults: 1, error: null });
    await Promise.resolve();
  });
  expect(await view.findByText("Newer Drink")).toBeTruthy();

  await act(async () => {
    pendingDrinks[0]?.({ data: [olderDrink], totalResults: 1, error: null });
    await Promise.resolve();
  });
  expect(view.getByText("Newer Drink")).toBeTruthy();
  expect(view.queryByText("Older Drink")).toBeNull();
});

test.serial(
  "ignores a Drinks response when the input changes during the debounce window",
  async () => {
    deferredDrinks = true;
    const olderDrink = { ...sampleDrink, name: "Older Drink" };
    const view = renderDrinks({ initialEntries: ["/drinks?q=first"] });
    expect(await view.findByRole("status")).toBeTruthy();

    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "second" }
    });
    await act(async () => {
      pendingDrinks.shift()?.({
        data: [olderDrink],
        totalResults: 1,
        error: null
      });
      await Promise.resolve();
    });

    expect(view.queryByText("Older Drink")).toBeNull();
    expect(view.getByRole("status")).toBeTruthy();
  }
);

test.serial("hides previous Drink results when the input changes", async () => {
  const view = renderDrinks();
  expect(await view.findByText(sampleDrink.name)).toBeTruthy();

  fireEvent.change(view.getByRole("searchbox"), {
    target: { value: "second" }
  });

  expect(view.queryByText(sampleDrink.name)).toBeNull();
  expect(view.getByRole("status")).toBeTruthy();
});
