import { GlobalWindow } from "happy-dom";

const browserWindow = new GlobalWindow();
browserWindow.location.href = "http://localhost:5173/search";
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

import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ThemeContext } from "../theme-context";

const { act, cleanup, fireEvent, render } =
  await import("@testing-library/react");

const sampleStore = {
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

const successResult = {
  data: { drinks: [], stores: [sampleStore], categories: [] },
  error: null
};
type DiscoveryResult = typeof successResult | { data: null; error: string };

let nextResult: DiscoveryResult = successResult;
let deferred = false;
let pendingResolve: ((result: DiscoveryResult) => void) | undefined;
let loadDiscovery = mock(() => Promise.resolve(nextResult));
const searchCalls: string[] = [];

mock.module("../discovery/data", () => ({
  loadPublicDiscoveryData: () => {
    if (!deferred) return loadDiscovery();
    return new Promise<DiscoveryResult>((resolve) => {
      pendingResolve = resolve;
    });
  },
  searchPublicDiscovery: (
    _drinks: unknown[],
    stores: (typeof sampleStore)[],
    query: string
  ) => {
    searchCalls.push(query);
    return {
      drinks: [],
      stores: query.trim().toLowerCase().includes("matcha") ? stores : []
    };
  }
}));

const { SearchPage } = await import("./page");

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderSearch(initialEntry = "/search") {
  return render(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes>
          <Route element={<SearchPage />} path="/search" />
        </Routes>
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  nextResult = successResult;
  deferred = false;
  pendingResolve = undefined;
  loadDiscovery = mock(() => Promise.resolve(nextResult));
  searchCalls.length = 0;
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
  "empty Search is idle and does not load discovery data",
  async () => {
    const view = renderSearch();

    expect(loadDiscovery).not.toHaveBeenCalled();
    expect(
      view.getByText("Search drinks and stores across Auckland.")
    ).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.queryByText("Matcha Store")).toBeNull();
  }
);

test.serial(
  "whitespace Search is idle and does not load discovery data",
  () => {
    const view = renderSearch("/search?q=%20%20");

    expect(loadDiscovery).not.toHaveBeenCalled();
    expect(
      view.getByText("Search drinks and stores across Auckland.")
    ).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
  }
);

test.serial(
  "a direct keyword URL loads and renders matching results",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    expect(loadDiscovery).toHaveBeenCalledTimes(1);
    expect(searchCalls.at(-1)).toBe("matcha");
  }
);

test.serial("the first typed keyword starts one discovery load", async () => {
  const view = renderSearch();
  const input = view.getByRole("searchbox");

  expect(loadDiscovery).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "matcha" } });

  expect(await view.findByText("Matcha Store")).toBeTruthy();
  expect(loadDiscovery).toHaveBeenCalledTimes(1);
});

test.serial(
  "subsequent keyword edits reuse the loaded discovery data",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "matcha latte" }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadDiscovery).toHaveBeenCalledTimes(1);
    expect(searchCalls.at(-1)).toBe("matcha latte");
  }
);

test.serial(
  "clear returns to idle and typing again does not refetch",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Clear search" }));

    expect(view.getByTestId("location").textContent).toBe("/search");
    expect(
      view.getByText("Search drinks and stores across Auckland.")
    ).toBeTruthy();
    expect(view.queryByText("Matcha Store")).toBeNull();
    expect(loadDiscovery).toHaveBeenCalledTimes(1);

    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "taro" }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadDiscovery).toHaveBeenCalledTimes(1);
  }
);

test.serial(
  "load errors and retry only apply to a keyword Search",
  async () => {
    nextResult = { data: null, error: "query_failed" };
    const errorView = renderSearch("/search?q=matcha");

    expect(await errorView.findByRole("alert")).toBeTruthy();
    expect(
      errorView.queryByText("Search drinks and stores across Auckland.")
    ).toBeNull();

    nextResult = successResult;
    fireEvent.click(errorView.getByRole("button", { name: "Try again" }));
    expect(await errorView.findByText("Matcha Store")).toBeTruthy();
    expect(loadDiscovery).toHaveBeenCalledTimes(2);

    cleanup();
    const idleView = renderSearch();
    expect(idleView.queryByRole("alert")).toBeNull();
  }
);

test.serial(
  "current query wins when it changes during the initial load",
  async () => {
    deferred = true;
    const view = renderSearch("/search?q=m");
    expect(await view.findByRole("status")).toBeTruthy();

    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "matcha" }
    });
    await act(async () => {
      pendingResolve?.(successResult);
    });

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    expect(searchCalls.at(-1)).toBe("matcha");
  }
);

test.serial("clearing during the initial load leaves Search idle", async () => {
  deferred = true;
  const view = renderSearch("/search?q=matcha");
  expect(await view.findByRole("status")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  await act(async () => {
    pendingResolve?.(successResult);
  });

  expect(
    view.getByText("Search drinks and stores across Auckland.")
  ).toBeTruthy();
  expect(view.queryByText("Matcha Store")).toBeNull();
  expect(view.queryByRole("status")).toBeNull();
});

test.serial(
  "re-entering a keyword during the initial load keeps loading feedback",
  async () => {
    deferred = true;
    const view = renderSearch("/search?q=matcha");
    expect(await view.findByRole("status")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Clear search" }));
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "taro" }
    });

    expect(await view.findByRole("status")).toBeTruthy();
    await act(async () => {
      pendingResolve?.(successResult);
    });
    expect(await view.findByText("No matches found")).toBeTruthy();
  }
);
