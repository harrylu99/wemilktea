import { GlobalWindow } from "happy-dom";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";

const browserWindow = new GlobalWindow();
browserWindow.location.href = "http://localhost:5173/stores";
let desktopLayout = true;
Object.defineProperty(browserWindow, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes("min-width") ? desktopLayout : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  })
});

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

const store = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "matcha-store",
  displayName: "Matcha Store",
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  suburb: "Albany",
  address: "1 Tea Street, Albany",
  latitude: -36.7,
  longitude: 174.7,
  imageUrl: null,
  imageAltText: null
};
const refreshedStore = {
  ...store,
  id: "22222222-2222-4222-8222-222222222222",
  displayName: "Refreshed Store"
};
type StoreResult =
  { data: Array<typeof store>; error: null } | { data: null; error: string };
type FacetsResult =
  | { data: { brands: Array<[string, string]>; areas: string[] }; error: null }
  | { data: null; error: string };

const facetSuccess: FacetsResult = {
  data: { brands: [["gong-cha", "Gong cha"]], areas: ["Albany"] },
  error: null
};

let deferred = false;
let nextResults: StoreResult[] = [];
let nextFacetResults: FacetsResult[] = [];
const pendingResolves: Array<(result: StoreResult) => void> = [];
const storeCalls: Array<{ query: string; brandSlug: string; suburb: string }> =
  [];
let facetCalls = 0;

mock.module("../lib/supabase", () => ({
  supabase: {},
  supabaseConfigurationError: "configuration_missing"
}));

const realStoresData = await import("./data");
mock.module("./data", () => ({
  ...realStoresData,
  distanceKm: () => 0,
  loadPublicStoreFacets: () => {
    facetCalls += 1;
    return Promise.resolve(nextFacetResults.shift() ?? facetSuccess);
  },
  loadPublicStores: (options: (typeof storeCalls)[number]) => {
    storeCalls.push(options);
    if (deferred) {
      return new Promise<StoreResult>((resolve) => {
        pendingResolves.push(resolve);
      });
    }
    return Promise.resolve(
      nextResults.shift() ?? ({ data: [store], error: null } as StoreResult)
    );
  },
  markerPosition: () => ({ left: "50%", top: "50%" })
}));

mock.module("./suggest-store", () => ({
  SuggestStoreCta: () => <button type="button">Suggest a store</button>,
  SuggestStoreDialog: () => null
}));

const { act, cleanup, fireEvent, render } =
  await import("@testing-library/react");
const { MemoryRouter, useLocation, useNavigate } =
  await import("react-router-dom");
const { ThemeContext } = await import("../theme-context");
const { StoresPage } = await import("../app");

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

function renderStores(
  initialEntries = ["/stores"],
  initialIndex = 0,
  historyControls = false
) {
  return render(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        {historyControls ? <HistoryProbe /> : null}
        <StoresPage />
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

async function settleInitialLoad(view: ReturnType<typeof render>) {
  await act(async () => {
    pendingResolves.shift()?.({ data: [store], error: null });
    await Promise.resolve();
  });
  expect(await view.findByText(store.displayName)).toBeTruthy();
}

beforeEach(() => {
  installBrowserGlobals();
  desktopLayout = true;
  deferred = false;
  nextResults = [];
  nextFacetResults = [];
  pendingResolves.length = 0;
  storeCalls.length = 0;
  facetCalls = 0;
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
  "uses layout-preserving skeletons before the first Store result",
  async () => {
    deferred = true;
    const view = renderStores();

    expect(view.getByRole("status").textContent).toBe("Loading store results");
    expect(view.container.querySelector(".store-map-skeleton")).toBeTruthy();
    expect(
      view.container.querySelectorAll(".store-skeleton-card")
    ).toHaveLength(4);
    expect(view.queryByText("Loading stores…")).toBeNull();
    expect(view.queryByText("MAP / STORE PINS")).toBeNull();

    await settleInitialLoad(view);
  }
);

test.serial(
  "lets mobile users switch from the map skeleton to the list skeleton",
  async () => {
    desktopLayout = false;
    deferred = true;
    const view = renderStores();

    expect(view.container.querySelector(".store-map-skeleton")).toBeTruthy();
    expect(
      view.container.querySelectorAll(".store-skeleton-card")
    ).toHaveLength(0);

    fireEvent.click(view.getByRole("button", { name: "List" }));

    expect(view.container.querySelector(".store-map-skeleton")).toBeNull();
    expect(
      view.container.querySelectorAll(".store-skeleton-card")
    ).toHaveLength(4);

    await settleInitialLoad(view);
  }
);

test.serial(
  "keeps Store results usable and retries failed facets independently",
  async () => {
    nextFacetResults = [{ data: null, error: "query_failed" }, facetSuccess];
    const view = renderStores();

    expect(await view.findByText(store.displayName)).toBeTruthy();
    expect(
      view.queryByText("Stores are unavailable right now. Please try again.")
    ).toBeNull();

    fireEvent.click(view.getByRole("button", { name: "Filters" }));
    expect(
      await view.findByText("Store filters are unavailable right now.")
    ).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Retry store filters" }));

    expect(await view.findByRole("option", { name: "Albany" })).toBeTruthy();
    expect(
      view.queryByText("Store filters are unavailable right now.")
    ).toBeNull();
    expect(facetCalls).toBe(2);
    expect(storeCalls).toHaveLength(1);
  }
);

test.serial(
  "loads Store facets once and does not reload them with search or filters",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();
    expect(facetCalls).toBe(1);

    fireEvent.click(view.getByRole("button", { name: "Filters" }));
    fireEvent.change(view.getByLabelText("Area"), {
      target: { value: "Albany" }
    });
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "gong" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(facetCalls).toBe(1);
  }
);

test.serial(
  "keeps the Map and current Store cards mounted during refresh",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "gong" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(view.getByRole("status").textContent).toBe("Updating store results");
    expect(view.container.querySelector(".store-refresh-spinner")).toBeTruthy();
    expect(view.container.querySelector(".store-map-skeleton")).toBeNull();
    expect(view.container.querySelector(".store-skeleton-card")).toBeNull();
    expect(view.getByText(store.displayName)).toBeTruthy();
    expect(view.getByText("MAP / STORE PINS")).toBeTruthy();
    expect((view.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "gong"
    );

    await act(async () => {
      pendingResolves.shift()?.({ data: [refreshedStore], error: null });
      await Promise.resolve();
    });

    expect(await view.findByText(refreshedStore.displayName)).toBeTruthy();
    expect(view.queryByText(store.displayName)).toBeNull();
    expect(view.queryByRole("status")).toBeNull();
    expect(view.container.querySelector(".store-refresh-spinner")).toBeNull();
  }
);

test.serial(
  "replaces stale Stores with the successful empty result",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "no-match" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(view.getByText(store.displayName)).toBeTruthy();
    expect(view.getByRole("status").textContent).toBe("Updating store results");
    expect(view.container.querySelector(".store-refresh-spinner")).toBeTruthy();
    await act(async () => {
      pendingResolves.shift()?.({ data: [], error: null });
      await Promise.resolve();
    });

    expect(await view.findByText("No stores found")).toBeTruthy();
    expect(view.queryByText(store.displayName)).toBeNull();
    expect(view.queryByText("MAP / STORE PINS")).toBeNull();
  }
);

test.serial(
  "hides stale Store results and selection after a refresh error",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();
    fireEvent.focus(view.getByText(store.displayName));
    expect(
      view.container.querySelector(".store-map-marker-selected")
    ).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "broken" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await act(async () => {
      pendingResolves.shift()?.({ data: null, error: "query_failed" });
      await Promise.resolve();
    });

    expect(view.getByRole("alert")).toBeTruthy();
    expect(view.queryByText(store.displayName)).toBeNull();
    expect(view.queryByText("MAP / STORE PINS")).toBeNull();
    expect(view.queryByText("No stores found")).toBeNull();
    expect(
      view.container.querySelector(".store-map-marker-selected")
    ).toBeNull();
    expect(view.queryByRole("status")).toBeNull();
  }
);

test.serial(
  "restores Store results after a failed refresh when a later request succeeds",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "broken" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await act(async () => {
      pendingResolves.shift()?.({ data: null, error: "query_failed" });
      await Promise.resolve();
    });

    expect(view.getByRole("alert")).toBeTruthy();
    expect(view.queryByText(store.displayName)).toBeNull();
    expect(view.queryByText("1 stores")).toBeNull();

    deferred = false;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "recovered" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await Promise.resolve();
    });

    expect(await view.findByText(store.displayName)).toBeTruthy();
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByText("MAP / STORE PINS")).toBeTruthy();
  }
);

test.serial(
  "Back navigation synchronizes Store input without overwriting the URL",
  async () => {
    const view = renderStores(["/stores?q=matcha", "/stores?q=gong"], 1, true);

    expect(await view.findByText(store.displayName)).toBeTruthy();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Back" }));
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(view.getByTestId("location").textContent).toBe("/stores?q=matcha");
    expect((view.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "matcha"
    );
    expect(storeCalls.at(-1)?.query).toBe("matcha");
  }
);

test.serial(
  "ignores a stale refresh response after a newer request",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "first" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "second" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(pendingResolves).toHaveLength(2);

    await act(async () => {
      pendingResolves[1]?.({ data: [refreshedStore], error: null });
      await Promise.resolve();
    });
    expect(await view.findByText(refreshedStore.displayName)).toBeTruthy();

    await act(async () => {
      pendingResolves[0]?.({ data: [store], error: null });
      await Promise.resolve();
    });
    expect(view.getByText(refreshedStore.displayName)).toBeTruthy();
    expect(view.queryByText(store.displayName)).toBeNull();
  }
);

test.serial(
  "ignores a Store response when the input changes during the debounce window",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "first" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(pendingResolves).toHaveLength(1);

    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "second" }
    });
    await act(async () => {
      pendingResolves.shift()?.({ data: [refreshedStore], error: null });
      await Promise.resolve();
    });

    expect(view.queryByText(refreshedStore.displayName)).toBeNull();
    expect(view.getByText(store.displayName)).toBeTruthy();
  }
);

test.serial(
  "ignores a stale refresh error after a newer request succeeds",
  async () => {
    const view = renderStores();
    expect(await view.findByText(store.displayName)).toBeTruthy();

    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "first" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "second" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(pendingResolves).toHaveLength(2);

    await act(async () => {
      pendingResolves[1]?.({ data: [refreshedStore], error: null });
      await Promise.resolve();
    });
    expect(await view.findByText(refreshedStore.displayName)).toBeTruthy();

    await act(async () => {
      pendingResolves[0]?.({ data: null, error: "query_failed" });
      await Promise.resolve();
    });
    expect(view.getByText(refreshedStore.displayName)).toBeTruthy();
    expect(view.queryByRole("alert")).toBeNull();
  }
);
