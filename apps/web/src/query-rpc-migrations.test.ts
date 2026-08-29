import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../../supabase/migrations/20260829131842_wm106_preserve_combined_public_search_semantics.sql"
  ),
  "utf8"
).toLowerCase();

test("Drinks RPC searches the combined product, metadata and tag text", () => {
  expect(migration).toContain(
    `concat_ws(
        ' ',
        p.name,
        b.name,
        c.name,
        coalesce(p.description, ''),
        array_to_string(p.discovery_tags, ' ')
      ) ilike params.search_pattern escape chr(92)`
  );
  expect(migration).not.toContain("or p.name ilike params.search_pattern");
  expect(migration).not.toContain("or b.name ilike params.search_pattern");
  expect(migration).not.toContain("or c.name ilike params.search_pattern");
  expect(migration).not.toContain("from unnest(p.discovery_tags)");
});

test("Stores RPC searches the combined location and brand text", () => {
  expect(migration).toContain(
    `concat_ws(
        ' ',
        l.display_name,
        b.name,
        l.suburb,
        l.address
      ) ilike params.search_pattern escape chr(92)`
  );
  expect(migration).not.toContain(
    "or l.display_name ilike params.search_pattern"
  );
  expect(migration).not.toContain("or l.suburb ilike params.search_pattern");
  expect(migration).not.toContain("or l.address ilike params.search_pattern");
  expect(migration).not.toContain("or b.name ilike params.search_pattern");
});

test("the corrective RPC migration preserves its existing security and API contracts", () => {
  expect(migration).toContain("security invoker");
  expect(migration).toContain(
    "public.search_public_drinks(text, text, integer, integer)"
  );
  expect(migration).toContain("public.search_public_stores(text, text, text)");
  expect(migration).toContain("grant execute on function");
});
