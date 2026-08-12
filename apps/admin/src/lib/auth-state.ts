import type { Session } from "@supabase/supabase-js";

export type AdminAuthState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "unauthorized"; email: string | null }
  | { kind: "authorized"; email: string | null }
  | { kind: "error"; message: string };

export function resolveAdminAuthState(
  session: Session | null,
  isAdmin: boolean
): AdminAuthState {
  if (!session) {
    return { kind: "signed-out" };
  }

  return isAdmin
    ? { kind: "authorized", email: session.user.email ?? null }
    : { kind: "unauthorized", email: session.user.email ?? null };
}
