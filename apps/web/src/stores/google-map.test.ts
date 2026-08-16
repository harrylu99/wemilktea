import { expect, test } from "bun:test";
import {
  buildGoogleMapsScriptUrl,
  loadGoogleMaps,
  resetGoogleMapsLoaderForTests
} from "./google-map";

test("builds a browser-only Google Maps loader URL", () => {
  const url = new URL(buildGoogleMapsScriptUrl("browser-key"));

  expect(url.origin).toBe("https://maps.googleapis.com");
  expect(url.pathname).toBe("/maps/api/js");
  expect(url.searchParams.get("key")).toBe("browser-key");
  expect(url.searchParams.get("callback")).toBeTruthy();
  expect(url.searchParams.get("loading")).toBe("async");
  expect(url.searchParams.get("v")).toBe("weekly");
});

test("loads Map, LatLngBounds, and Marker from their owning libraries", async () => {
  const scriptListeners = new Map<string, () => void>();
  const importedLibraries: string[] = [];
  const fakeScript = {
    addEventListener: (eventName: string, listener: () => void) => {
      scriptListeners.set(eventName, listener);
    },
    dataset: {} as DOMStringMap,
    src: ""
  } as unknown as HTMLScriptElement;
  const fakeWindow = {
    google: undefined
  } as unknown as Window & Record<string, unknown>;
  const fakeDocument = {
    createElement: () => fakeScript,
    head: {
      appendChild: () => {
        const callbackName = new URL(fakeScript.src).searchParams.get(
          "callback"
        );
        class FakeMap {}
        class FakeBounds {}
        class FakeMarker {}
        fakeWindow.google = {
          maps: {
            importLibrary: async (libraryName: "maps" | "core" | "marker") => {
              importedLibraries.push(libraryName);
              if (libraryName === "maps") return { Map: FakeMap };
              if (libraryName === "core") return { LatLngBounds: FakeBounds };
              return { Marker: FakeMarker };
            }
          }
        };
        const callback = callbackName ? fakeWindow[callbackName] : null;
        if (typeof callback === "function") callback();
      }
    },
    querySelector: () => null
  } as unknown as Document;
  const globals = globalThis as unknown as {
    document?: Document;
    window?: Window & typeof globalThis;
  };
  const originalDocument = globals.document;
  const originalWindow = globals.window;

  try {
    globals.document = fakeDocument;
    globals.window = fakeWindow as unknown as Window & typeof globalThis;

    const googleMaps = await loadGoogleMaps("browser-key");

    expect(googleMaps.maps.Map.name).toBe("FakeMap");
    expect(googleMaps.maps.Marker.name).toBe("FakeMarker");
    expect(googleMaps.maps.LatLngBounds.name).toBe("FakeBounds");
    expect(importedLibraries).toEqual(["maps", "core", "marker"]);
    expect(scriptListeners.has("load")).toBe(false);
  } finally {
    resetGoogleMapsLoaderForTests();
    globals.document = originalDocument;
    globals.window = originalWindow;
  }
});

test("reports the Maps API readiness error when the callback has no API", async () => {
  const fakeScript = {
    addEventListener: () => undefined,
    dataset: {} as DOMStringMap,
    src: ""
  } as unknown as HTMLScriptElement;
  const fakeWindow = {} as Window & Record<string, unknown>;
  const fakeDocument = {
    createElement: () => fakeScript,
    head: {
      appendChild: () => {
        const callbackName = new URL(fakeScript.src).searchParams.get(
          "callback"
        );
        const callback = callbackName ? fakeWindow[callbackName] : null;
        if (typeof callback === "function") callback();
      }
    },
    querySelector: () => null
  } as unknown as Document;
  const globals = globalThis as unknown as {
    document?: Document;
    window?: Window & typeof globalThis;
  };
  const originalDocument = globals.document;
  const originalWindow = globals.window;

  try {
    globals.document = fakeDocument;
    globals.window = fakeWindow as unknown as Window & typeof globalThis;

    await expect(loadGoogleMaps("browser-key")).rejects.toThrow(
      "Google Maps loaded without its Maps API."
    );
  } finally {
    resetGoogleMapsLoaderForTests();
    globals.document = originalDocument;
    globals.window = originalWindow;
  }
});
