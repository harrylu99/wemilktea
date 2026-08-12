import { expect, test } from "bun:test";
import {
  approveStoreCandidateSchema,
  browserEnvironmentSchema,
  candidateGoogleDetailSchema,
  storeDiscoveryResultSchema,
  storeSuggestionSchema
} from "./index";

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

test("validates the server-side store discovery response", () => {
  expect(
    storeDiscoveryResultSchema.safeParse({
      runId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
      status: "succeeded",
      queryCount: 8,
      resultCount: 112,
      newCandidateCount: 8,
      knownCount: 101,
      possibleDuplicateCount: 3,
      errorSummary: null
    }).success
  ).toBeTrue();
  expect(
    storeDiscoveryResultSchema.safeParse({ status: "succeeded" }).success
  ).toBeFalse();
});

test("requires verified canonical data before approving a candidate", () => {
  expect(
    approveStoreCandidateSchema.safeParse({
      candidateId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
      brand: {
        mode: "existing",
        brandId: "4b75bfe1-f502-4c41-ad08-4b4d9b16bfc2"
      },
      location: {
        displayName: "Tea House Central",
        slug: "tea-house-central",
        suburb: "Auckland CBD",
        address: "1 Queen Street, Auckland",
        latitude: -36.8485,
        longitude: 174.7633,
        sourceReference: "https://example.com/stores/central"
      }
    }).success
  ).toBeTrue();
  expect(
    approveStoreCandidateSchema.safeParse({
      candidateId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
      brand: { mode: "new", name: "Tea House", slug: "Tea House" },
      location: {}
    }).success
  ).toBeFalse();
});

test("validates the transient Google detail contract", () => {
  expect(
    candidateGoogleDetailSchema.safeParse({
      placeId: "ChIJexample",
      displayName: "Tea House",
      formattedAddress: "1 Queen Street, Auckland",
      latitude: -36.8485,
      longitude: 174.7633,
      businessStatus: "OPERATIONAL",
      websiteUri: null,
      googleMapsUri: "https://maps.google.com/?cid=1",
      attributionLabel: "Google Maps"
    }).success
  ).toBeTrue();
});
