import { describe, expect, test } from "bun:test";
import worker, { pingSupabase } from "./index";

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key"
};

describe("pingSupabase", () => {
  test("runs a public RPC with the anon key", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
      request = { url: String(url), init };
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    expect(await pingSupabase(env, fetcher)).toBe(200);
    expect(request?.url).toBe(
      "https://project.supabase.co/rest/v1/rpc/search_public_stores"
    );
    expect(request?.init?.method).toBe("POST");
    const headers = request?.init?.headers as Record<string, string>;
    expect(headers.apikey).toBe("anon-key");
    expect(headers.authorization).toBe("Bearer anon-key");
  });

  test("throws when Supabase does not answer successfully", async () => {
    const fetcher = (async () =>
      new Response("paused", { status: 540 })) as unknown as typeof fetch;

    await expect(pingSupabase(env, fetcher)).rejects.toThrow("HTTP 540");
  });
});

describe("scheduled", () => {
  test("propagates a failed ping so Cron Events record an error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("paused", { status: 540 })) as unknown as typeof fetch;
    try {
      await expect(worker.scheduled(undefined, env)).rejects.toThrow(
        "HTTP 540"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
