import { afterEach, expect, mock, test } from "bun:test";

let currentSessionUser: { id: string } | null = null;
let anonymousSignInCalls = 0;

const auth = {
  getSession: mock(async () => ({
    data: { session: currentSessionUser ? { user: currentSessionUser } : null },
    error: null
  })),
  signInAnonymously: mock(async () => {
    anonymousSignInCalls += 1;
    const user = { id: "55555555-5555-4555-8555-555555555555" };
    currentSessionUser = user;
    return { data: { user }, error: null };
  })
};

mock.module("../lib/supabase", () => ({
  supabase: { auth },
  supabaseConfigurationError: null
}));

const { ensurePublicWriteIdentity } = await import("./identity");

afterEach(() => {
  currentSessionUser = null;
  anonymousSignInCalls = 0;
  auth.getSession.mockClear();
  auth.signInAnonymously.mockClear();
});

test("reuses a current session without creating anonymous Auth", async () => {
  currentSessionUser = { id: "66666666-6666-4666-8666-666666666666" };

  const result = await ensurePublicWriteIdentity();

  expect(result).toEqual({
    userId: currentSessionUser.id,
    error: null
  });
  expect(anonymousSignInCalls).toBe(0);
});

test("deduplicates concurrent identity creation", async () => {
  const [first, second] = await Promise.all([
    ensurePublicWriteIdentity(),
    ensurePublicWriteIdentity()
  ]);

  expect(first).toEqual(second);
  expect(anonymousSignInCalls).toBe(1);
});
