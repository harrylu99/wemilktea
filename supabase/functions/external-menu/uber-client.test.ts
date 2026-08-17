import { expect, test } from "bun:test";
import {
  UberClientError,
  UberEatsClient,
  type UberFetcher
} from "./uber-client.ts";

const config = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  environment: "sandbox" as const,
  safetyWindowMs: 30_000
};

test("reuses an unexpired token for multiple menu requests", async () => {
  let tokenRequests = 0;
  let menuRequests = 0;
  const fetcher: UberFetcher = async (input) => {
    if (String(input).includes("oauth")) {
      tokenRequests += 1;
      return Response.json({
        access_token: "mock-access-token",
        expires_in: 3600,
        scope: "eats.store"
      });
    }

    menuRequests += 1;
    return Response.json({ items: [], categories: [], modifier_groups: {} });
  };
  const client = new UberEatsClient(config, fetcher, () => 0);

  await client.fetchMenu("store-1");
  await client.fetchMenu("store-1");

  expect(tokenRequests).toBe(1);
  expect(menuRequests).toBe(2);
});

test("refreshes a token inside the safety window", async () => {
  let now = 0;
  let tokenRequests = 0;
  const fetcher: UberFetcher = async (input) => {
    if (String(input).includes("oauth")) {
      tokenRequests += 1;
      return Response.json({
        access_token: `mock-access-token-${tokenRequests}`,
        expires_in: 60,
        scope: "eats.store"
      });
    }
    return Response.json({ items: [], categories: [], modifier_groups: {} });
  };
  const client = new UberEatsClient(config, fetcher, () => now);

  await client.fetchMenu("store-1");
  now = 31_000;
  await client.fetchMenu("store-1");

  expect(tokenRequests).toBe(2);
});

test("rejects OAuth responses without the required scope", async () => {
  const fetcher: UberFetcher = async () =>
    Response.json({
      access_token: "mock-access-token",
      expires_in: 3600,
      scope: "other.scope"
    });
  const client = new UberEatsClient(config, fetcher);

  await expect(client.getAccessToken()).rejects.toMatchObject({
    kind: "invalid_response",
    code: "required_scope_unavailable"
  });
});

test("maps Uber API failures to safe typed errors", async () => {
  const fetcher: UberFetcher = async (input) => {
    if (String(input).includes("oauth")) {
      return Response.json({
        access_token: "mock-access-token",
        expires_in: 3600,
        scope: "eats.store"
      });
    }
    return new Response(
      JSON.stringify({ message: "private provider detail" }),
      {
        status: 429,
        headers: { "Retry-After": "7" }
      }
    );
  };
  const client = new UberEatsClient(config, fetcher);

  await expect(client.fetchMenu("store-1")).rejects.toEqual(
    expect.objectContaining({
      kind: "http",
      status: 429,
      code: "http_429",
      retryAfterSeconds: 7,
      message: "Uber Eats request failed."
    })
  );
});

test("preserves only safe status metadata for provider HTTP failures", async () => {
  for (const status of [401, 403, 404, 500]) {
    const fetcher: UberFetcher = async (input) => {
      if (String(input).includes("oauth")) {
        return Response.json({
          access_token: "mock-access-token",
          expires_in: 3600,
          scope: "eats.store"
        });
      }

      return new Response(
        JSON.stringify({ message: "private provider detail" }),
        { status }
      );
    };
    const client = new UberEatsClient(config, fetcher);

    await expect(client.fetchMenu("store-1")).rejects.toEqual(
      expect.objectContaining({
        kind: "http",
        status,
        code: `http_${status}`,
        message: "Uber Eats request failed."
      })
    );
  }
});

test("converts an aborted request into a timeout error", async () => {
  const fetcher: UberFetcher = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  const client = new UberEatsClient({ ...config, timeoutMs: 1 }, fetcher);

  await expect(client.getAccessToken()).rejects.toBeInstanceOf(UberClientError);
  await expect(client.getAccessToken()).rejects.toMatchObject({
    kind: "timeout",
    code: "timeout"
  });
});
