import { expect, test } from "bun:test";
import {
  searchParamsForStorePage,
  searchParamsForStoreFilters,
  storeListStateFromSearchParams,
  storeManagementReturnPath
} from "./store-list-state";

test("reads default Store filters from an empty URL", () => {
  expect(storeListStateFromSearchParams(new URLSearchParams())).toEqual({
    query: "",
    publicationStatus: "all",
    brandId: "",
    suburb: "",
    page: 1
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
    suburb: "Albany",
    page: 1
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
    suburb: "",
    page: 1
  });
});

test("updates one Store filter without dropping the others", () => {
  const next = searchParamsForStoreFilters(
    new URLSearchParams(
      "q=gong&status=published&brand=brand-1&suburb=Albany&page=3"
    ),
    { publicationStatus: "archived" }
  );

  expect(next.toString()).toBe(
    "q=gong&status=archived&brand=brand-1&suburb=Albany"
  );
});

test("omits default and empty Store filter values", () => {
  const next = searchParamsForStoreFilters(
    new URLSearchParams(
      "q=gong&status=archived&brand=brand-1&suburb=Albany&page=3"
    ),
    { query: "", publicationStatus: "all", brandId: "", suburb: "" }
  );

  expect(next.toString()).toBe("");
});

test("reads and updates Store page state", () => {
  expect(
    storeListStateFromSearchParams(
      new URLSearchParams("status=published&page=2"),
      { brandIds: [], suburbs: [] }
    ).page
  ).toBe(2);
  expect(
    searchParamsForStorePage(
      new URLSearchParams("status=published"),
      2
    ).toString()
  ).toBe("status=published&page=2");
  expect(
    searchParamsForStorePage(
      new URLSearchParams("status=published&page=2"),
      1
    ).toString()
  ).toBe("status=published");
});

test("accepts only Store list return paths", () => {
  expect(storeManagementReturnPath(null)).toBe("/stores");
  expect(storeManagementReturnPath({ returnTo: "/stores" })).toBe("/stores");
  expect(
    storeManagementReturnPath({
      returnTo: "/stores?status=archived&brand=brand-1&page=2"
    })
  ).toBe("/stores?status=archived&brand=brand-1&page=2");
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
