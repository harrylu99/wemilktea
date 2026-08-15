import { expect, test } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { resolveAdminAuthState } from "./auth-state";

const session = {
  user: { email: "admin@example.com" }
} as Session;

test("resolves signed-out, authorized, and unauthorized states", () => {
  expect(resolveAdminAuthState(null, false)).toEqual({ kind: "signed-out" });
  expect(resolveAdminAuthState(session, true)).toEqual({
    kind: "authorized",
    email: "admin@example.com"
  });
  expect(resolveAdminAuthState(session, false)).toEqual({
    kind: "unauthorized",
    email: "admin@example.com"
  });
});
