import { expect, test } from "bun:test";
import {
  searchParamsForStoreFilters,
  storeListStateFromSearchParams,
  storeManagementReturnPath
} from "./store-list-state";

test("reads default Store filters from an empty URL", () => {
  expect(storeListStateFromSearchParams(new URLSearchParams())).toEqual({
    query: "",
    publicationStatus: "all",
    brandId: "",
    suburb: ""
  });
});

test("reads valid status and multiple Store filters", () => {
  expect(
    storeListStateFromSearchParams(
      new URLSearchParams(
        "q=gong&status=published&brand=brand-1&suburb=Albany"
      ),
      { brandIds: ["brand-1"], suburbs: ["Albany"] }
    )
  ).toEqual({
    query: "gong",
    publicationStatus: "published",
    brandId: "brand-1",
    suburb: "Albany"
  });
});

test("falls back safely for invalid status, brand, and suburb values", () => {
  expect(
    storeListStateFromSearchParams(
      new URLSearchParams(
        "status=banana&brand=not-a-brand&suburb=NotARealArea"
      ),
      { brandIds: ["brand-1"], suburbs: ["Albany"] }
    )
  ).toMatchObject({
    publicationStatus: "all",
    brandId: "",
    suburb: ""
  });
});

test("updates one Store filter without dropping the others", () => {
  const next = searchParamsForStoreFilters(
    new URLSearchParams("q=gong&status=published&brand=brand-1&suburb=Albany"),
    { publicationStatus: "archived" }
  );

  expect(next.toString()).toBe(
    "q=gong&status=archived&brand=brand-1&suburb=Albany"
  );
});

test("omits default and empty Store filter values", () => {
  const next = searchParamsForStoreFilters(
    new URLSearchParams("q=gong&status=archived&brand=brand-1&suburb=Albany"),
    { query: "", publicationStatus: "all", brandId: "", suburb: "" }
  );

  expect(next.toString()).toBe("");
});

test("accepts only Store list return paths", () => {
  expect(storeManagementReturnPath(null)).toBe("/stores");
  expect(storeManagementReturnPath({ returnTo: "/stores" })).toBe("/stores");
  expect(
    storeManagementReturnPath({ returnTo: "/stores?status=archived" })
  ).toBe("/stores?status=archived");
  expect(storeManagementReturnPath({ returnTo: "/candidates" })).toBe(
    "/stores"
  );
  expect(storeManagementReturnPath({ returnTo: "/stores/123" })).toBe(
    "/stores"
  );
  expect(storeManagementReturnPath({ returnTo: "https://evil.example" })).toBe(
    "/stores"
  );
});
