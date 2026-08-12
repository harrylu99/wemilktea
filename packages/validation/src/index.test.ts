import { expect, test } from "bun:test";
import { browserEnvironmentSchema, storeSuggestionSchema } from "./index";

test("accepts a complete store suggestion", () => {
  expect(
    storeSuggestionSchema.parse({
      name: "Example Tea",
      address: "1 Queen Street, Auckland",
      sourceUrl: "https://example.com"
    })
  ).toEqual({
    name: "Example Tea",
    address: "1 Queen Street, Auckland",
    sourceUrl: "https://example.com"
  });
});

test("rejects incomplete or invalid browser configuration", () => {
  expect(
    browserEnvironmentSchema.safeParse({
      VITE_SUPABASE_URL: "https://example.supabase.co"
    }).success
  ).toBeFalse();
  expect(
    browserEnvironmentSchema.safeParse({
      VITE_SUPABASE_ANON_KEY: "anon-key"
    }).success
  ).toBeFalse();
  expect(
    browserEnvironmentSchema.safeParse({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_ANON_KEY: "anon-key"
    }).success
  ).toBeFalse();
});

test("rejects an empty store suggestion name", () => {
  expect(
    storeSuggestionSchema.safeParse({
      name: "   ",
      address: "1 Queen Street, Auckland"
    }).success
  ).toBeFalse();
});

test("rejects an invalid store suggestion URL", () => {
  expect(
    storeSuggestionSchema.safeParse({
      name: "Example Tea",
      address: "1 Queen Street, Auckland",
      sourceUrl: "not-a-url"
    }).success
  ).toBeFalse();
});
