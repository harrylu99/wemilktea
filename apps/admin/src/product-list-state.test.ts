import { expect, test } from "bun:test";
import {
  productListStateFromSearchParams,
  productManagementReturnPath,
  searchParamsForProductFilters,
  searchParamsForProductPage
} from "./product-list-state";

test("reads default Product list state", () => {
  expect(productListStateFromSearchParams(new URLSearchParams())).toEqual({
    query: "",
    status: "all",
    page: 1
  });
});

test("reads valid Product query, status, and page values", () => {
  expect(
    productListStateFromSearchParams(
      new URLSearchParams("q=oolong&status=published&page=3")
    )
  ).toEqual({ query: "oolong", status: "published", page: 3 });
});

test("falls back safely for invalid Product status and page values", () => {
  for (const page of ["0", "-1", "abc", "1.5"]) {
    expect(
      productListStateFromSearchParams(
        new URLSearchParams(`status=unknown&page=${page}`)
      )
    ).toMatchObject({ status: "all", page: 1 });
  }
});

test("resets Product page when a filter changes", () => {
  expect(
    searchParamsForProductFilters(
      new URLSearchParams("q=tea&status=published&page=3"),
      { status: "draft" }
    ).toString()
  ).toBe("q=tea&status=draft");
});

test("changes Product page without dropping filters", () => {
  expect(
    searchParamsForProductPage(
      new URLSearchParams("q=tea&status=published"),
      2
    ).toString()
  ).toBe("q=tea&status=published&page=2");
});

test("omits Product page one from the URL", () => {
  expect(
    searchParamsForProductPage(
      new URLSearchParams("q=tea&status=published&page=2"),
      1
    ).toString()
  ).toBe("q=tea&status=published");
});

test("accepts only safe Product list return paths", () => {
  expect(productManagementReturnPath({ returnTo: "/products?page=3" })).toBe(
    "/products?page=3"
  );
  expect(productManagementReturnPath(null)).toBe("/products");
  expect(productManagementReturnPath({ returnTo: "/stores" })).toBe(
    "/products"
  );
  expect(productManagementReturnPath({ returnTo: "/products/123" })).toBe(
    "/products"
  );
  expect(productManagementReturnPath({ returnTo: "https://example.com" })).toBe(
    "/products"
  );
});
