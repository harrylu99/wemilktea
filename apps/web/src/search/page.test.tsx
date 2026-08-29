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
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";
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
  data: { drinks: [], stores: [sampleStore] },
  error: null
};
type SearchResult = typeof successResult | { data: null; error: string };

let nextResult: SearchResult = successResult;
let deferred = false;
const pendingResolves: Array<(result: SearchResult) => void> = [];
let loadSearch = mock((query: string) => {
  void query;
  return Promise.resolve(nextResult);
});
const searchCalls: string[] = [];

mock.module("../discovery/data", () => ({
  loadPublicSearchResults: (query: string) => {
    searchCalls.push(query);
    if (!deferred) return loadSearch(query);
    return new Promise<SearchResult>((resolve) => {
      pendingResolves.push(resolve);
    });
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

function HistoryProbe() {
  const navigate = useNavigate();
  return (
    <>
      <LocationProbe />
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Forward
      </button>
    </>
  );
}

function renderSearch(
  initialEntry = "/search",
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
        initialEntries={options.initialEntries ?? [initialEntry]}
        initialIndex={options.initialIndex}
      >
        {options.historyControls ? <HistoryProbe /> : <LocationProbe />}
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
  pendingResolves.length = 0;
  loadSearch = mock((query: string) =>
    Promise.resolve(
      nextResult.error
        ? nextResult
        : query.includes("matcha")
          ? successResult
          : { data: { drinks: [], stores: [] }, error: null }
    )
  );
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

    expect(loadSearch).not.toHaveBeenCalled();
    expect(view.getByText("What are you craving?")).toBeTruthy();
    expect(view.getByText("Search by drink or store name.")).toBeTruthy();
    expect(view.getByRole("searchbox").getAttribute("placeholder")).toBe(
      "Try “matcha”, “Gong cha”, or “Albany”"
    );
    expect(view.queryByRole("status")).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.queryByText("Matcha Store")).toBeNull();
  }
);

test.serial(
  "whitespace Search is idle and does not load discovery data",
  () => {
    const view = renderSearch("/search?q=%20%20");

    expect(loadSearch).not.toHaveBeenCalled();
    expect(view.getByText("What are you craving?")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
  }
);

test.serial(
  "a direct keyword URL loads and renders matching results",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    expect(loadSearch).toHaveBeenCalledTimes(1);
    expect(searchCalls.at(-1)).toBe("matcha");
  }
);

test.serial("the first typed keyword starts one discovery load", async () => {
  const view = renderSearch();
  const input = view.getByRole("searchbox");

  expect(loadSearch).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "matcha" } });

  expect(await view.findByText("Matcha Store")).toBeTruthy();
  expect(loadSearch).toHaveBeenCalledTimes(1);
});

test.serial(
  "subsequent keyword edits are debounced and refetch results",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "matcha latte" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(loadSearch).toHaveBeenCalledTimes(2);
    expect(searchCalls.at(-1)).toBe("matcha latte");
  }
);

test.serial(
  "hides previous results while a new keyword is debouncing and loading",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    deferred = true;
    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "taro" }
    });

    expect(view.queryByText("Matcha Store")).toBeNull();
    expect(view.getByRole("status").getAttribute("aria-label")).toBe(
      "Loading search results"
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(pendingResolves).toHaveLength(1);
    expect(view.queryByText("Matcha Store")).toBeNull();

    await act(async () => {
      pendingResolves.shift()?.(successResult);
      await Promise.resolve();
    });
    expect(await view.findByText("Matcha Store")).toBeTruthy();
  }
);

test.serial(
  "Back navigation synchronizes Search input without overwriting the URL",
  async () => {
    const view = renderSearch("/search", {
      historyControls: true,
      initialEntries: ["/search?q=matcha", "/search?q=taro"],
      initialIndex: 1
    });

    expect(await view.findByText("No luck with “taro”")).toBeTruthy();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Back" }));
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(view.getByTestId("location").textContent).toBe("/search?q=matcha");
    expect((view.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "matcha"
    );
    expect(await view.findByText("Matcha Store")).toBeTruthy();
  }
);

test.serial(
  "clear returns to idle and typing again refetches after debounce",
  async () => {
    const view = renderSearch("/search?q=matcha");

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Clear search" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.getByTestId("location").textContent).toBe("/search");
    expect(view.getByText("What are you craving?")).toBeTruthy();
    expect(view.queryByText("Matcha Store")).toBeNull();
    expect(loadSearch).toHaveBeenCalledTimes(1);

    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "taro" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(loadSearch).toHaveBeenCalledTimes(2);
  }
);

test.serial(
  "load errors and retry only apply to a keyword Search",
  async () => {
    nextResult = { data: null, error: "query_failed" };
    const errorView = renderSearch("/search?q=matcha");

    expect(await errorView.findByRole("alert")).toBeTruthy();
    expect(errorView.queryByText("What are you craving?")).toBeNull();

    nextResult = successResult;
    fireEvent.click(errorView.getByRole("button", { name: "Try again" }));
    expect(await errorView.findByText("Matcha Store")).toBeTruthy();
    expect(loadSearch).toHaveBeenCalledTimes(2);

    cleanup();
    const idleView = renderSearch();
    expect(idleView.queryByRole("alert")).toBeNull();
  }
);

test.serial(
  "stale search responses cannot replace the current query",
  async () => {
    deferred = true;
    const view = renderSearch("/search?q=m");
    expect(await view.findByRole("status")).toBeTruthy();

    fireEvent.change(view.getByRole("searchbox"), {
      target: { value: "matcha" }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(pendingResolves).toHaveLength(2);
    await act(async () => {
      pendingResolves[1]?.(successResult);
      await Promise.resolve();
    });

    expect(await view.findByText("Matcha Store")).toBeTruthy();
    expect(searchCalls.at(-1)).toBe("matcha");
    await act(async () => {
      pendingResolves[0]?.({
        data: { drinks: [], stores: [] },
        error: null
      });
      await Promise.resolve();
    });
    expect(view.getByText("Matcha Store")).toBeTruthy();
  }
);

test.serial("clearing during the initial load leaves Search idle", async () => {
  deferred = true;
  const view = renderSearch("/search?q=matcha");
  expect(await view.findByRole("status")).toBeTruthy();

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Clear search" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    pendingResolves[0]?.(successResult);
    await Promise.resolve();
  });

  expect(view.getByText("What are you craving?")).toBeTruthy();
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
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await act(async () => {
      pendingResolves[1]?.({
        data: { drinks: [], stores: [] },
        error: null
      });
      await Promise.resolve();
    });
    expect(await view.findByText("No luck with “taro”")).toBeTruthy();
    expect(view.getByText("Try another drink or store name.")).toBeTruthy();
  }
);

test.serial("shows query-aware no-results copy", async () => {
  const view = renderSearch("/search?q=something-with-no-match");

  expect(
    await view.findByText("No luck with “something-with-no-match”")
  ).toBeTruthy();
  expect(view.getByText("Try another drink or store name.")).toBeTruthy();
});
