import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../../../supabase/migrations/20260906000000_wm124_atomic_must_try_like.sql"
  ),
  "utf8"
).toLowerCase();

test("Must Try atomically inserts the Must Try and Like rows", () => {
  expect(migration).toContain(
    "create or replace function public.save_community_post_must_try(p_post_id uuid)"
  );
  expect(migration).toContain(
    "insert into public.community_post_must_tries (post_id, user_id)"
  );
  expect(migration).toContain(
    "insert into public.community_post_likes (post_id, user_id)"
  );
  expect(
    migration.split("on conflict (post_id, user_id) do nothing").length - 1
  ).toBe(2);
});

test("Must Try keeps authentication, active-post, idempotency, and grants", () => {
  expect(migration).toContain("authentication_required");
  expect(migration).toContain("post_not_active");
  expect(migration).toContain("return coalesce(must_try_inserted, false)");
  expect(migration).toContain(
    "revoke all on function public.save_community_post_must_try(uuid) from public, anon"
  );
  expect(migration).toContain(
    "grant execute on function public.save_community_post_must_try(uuid) to authenticated"
  );
});
