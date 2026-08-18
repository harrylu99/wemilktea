import { expect, test } from "bun:test";
import {
  loadUberCredentials,
  requestApplicationToken,
  UberConfigurationError
} from "./auth";
import type { Fetcher } from "./auth";

test("requires both Uber credentials", () => {
  expect(() => loadUberCredentials({})).toThrow(UberConfigurationError);
  expect(() =>
    loadUberCredentials({ UBER_EATS_CLIENT_ID: "client-id" })
  ).toThrow("UBER_EATS_CLIENT_SECRET");
});

test("parses an application token without exposing it in the result summary", async () => {
  const response = Response.json({
    access_token: "mock-access-token",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "eats.store"
  });
  const token = await requestApplicationToken(
    {
      clientId: "client-id",
      clientSecret: "test-only",
      authBaseUrl: "https://sandbox-login.uber.com"
    },
    (async () => response) satisfies Fetcher
  );

  expect(token).toMatchObject({
    expiresIn: 3600,
    tokenType: "Bearer",
    scope: "eats.store"
  });
  expect(token.accessToken).toBe("mock-access-token");
});

test("returns safe OAuth error fields for an authentication failure", async () => {
  const response = new Response(
    JSON.stringify({
      error: "invalid_client",
      error_description: "The client credentials are invalid"
    }),
    { status: 401, statusText: "Unauthorized" }
  );

  await expect(
    requestApplicationToken(
      {
        clientId: "client-id",
        clientSecret: "test-only",
        authBaseUrl: "https://sandbox-login.uber.com"
      },
      (async () => response) satisfies Fetcher
    )
  ).rejects.toMatchObject({
    status: 401,
    code: "invalid_client",
    message: "The client credentials are invalid"
  });
});
