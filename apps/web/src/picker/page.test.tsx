import { GlobalWindow } from "happy-dom";

const browserWindow = new GlobalWindow();
browserWindow.location.href = "http://localhost:5173/picker";
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
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../theme-context";

const { act, cleanup, fireEvent, render } =
  await import("@testing-library/react");

const successResult = {
  data: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Matcha Latte",
      slug: "matcha-latte",
      brandName: "Gong cha",
      brandSlug: "gong-cha",
      categorySlug: "milk-tea",
      discoveryTags: [],
      imageUrl: null,
      imageAltText: null,
      availableStores: [
        {
          locationId: "22222222-2222-4222-8222-222222222222",
          displayName: "Gong cha Albany",
          slug: "gong-cha-albany",
          suburb: "Albany",
          priceCents: null,
          currency: "NZD"
        }
      ]
    }
  ],
  error: null
};
type PickerLoadResult = typeof successResult | { data: null; error: string };

let nextResult: PickerLoadResult = successResult;
let deferred = false;
let pendingResolve: ((result: PickerLoadResult) => void) | undefined;
let loadCandidates = mock(() => Promise.resolve(nextResult));
const actualPickerData = await import("./data");

mock.module("./data", () => ({
  ...actualPickerData,
  loadPublicPickerCandidates: () => {
    if (!deferred) return loadCandidates();
    return new Promise<PickerLoadResult>((resolve) => {
      pendingResolve = resolve;
    });
  }
}));

const { PickerPage } = await import("./page");

function renderPicker() {
  return render(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={["/picker"]}>
        <PickerPage />
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  nextResult = successResult;
  deferred = false;
  pendingResolve = undefined;
  loadCandidates = mock(() => Promise.resolve(nextResult));
});

afterEach(() => {
  installBrowserGlobals();
  cleanup();
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  mock.restore();
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
  "shows the loading ritual and resolves without delaying readiness",
  async () => {
    deferred = true;
    const view = renderPicker();

    await act(async () => {
      await Promise.resolve();
    });
    expect(view.getByText("Consulting the pearls...")).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1050));
    });
    expect(view.getByText("Reading your milk tea stars...")).toBeTruthy();

    const resolveCandidates = pendingResolve;
    expect(resolveCandidates).toBeTruthy();
    await act(async () => {
      resolveCandidates?.(successResult);
      await Promise.resolve();
    });

    expect(view.queryByText("Reading your milk tea stars...")).toBeNull();
    expect(view.getByText("Your sign is ready ✦")).toBeTruthy();
    expect(
      (
        view.getByRole("button", {
          name: "Draw my milk tea sign"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  }
);

test.serial("resets the first loading message when retrying", async () => {
  nextResult = { data: null, error: "network" };
  const view = renderPicker();

  await act(async () => {
    await Promise.resolve();
  });
  deferred = true;
  fireEvent.click(view.getByRole("button", { name: "Try again" }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(view.getByText("Consulting the pearls...")).toBeTruthy();
  expect(view.queryByText("Reading your milk tea stars...")).toBeNull();
});

test.serial("cleans up loading timers when the Picker unmounts", async () => {
  deferred = true;
  const view = renderPicker();

  await act(async () => {
    await Promise.resolve();
  });
  view.unmount();

  await new Promise((resolve) => setTimeout(resolve, 1050));
  expect(view.queryByText("Reading your milk tea stars...")).toBeNull();
});
