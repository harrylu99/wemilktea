import { expect, test } from "bun:test";
import { loadUberConfig, UberConfigurationError } from "./auth";

test("resolves the paired sandbox endpoints", () => {
  expect(
    loadUberConfig({
      UBER_EATS_ENV: "sandbox",
      UBER_EATS_CLIENT_ID: "client-id",
      UBER_EATS_CLIENT_SECRET: "test-only"
    })
  ).toMatchObject({
    environment: "sandbox",
    authBaseUrl: "https://sandbox-login.uber.com",
    apiBaseUrl: "https://test-api.uber.com"
  });
});

test("requires an explicit Uber environment instead of falling back", () => {
  expect(() =>
    loadUberConfig({
      UBER_EATS_CLIENT_ID: "client-id",
      UBER_EATS_CLIENT_SECRET: "test-only"
    })
  ).toThrow(UberConfigurationError);
});
