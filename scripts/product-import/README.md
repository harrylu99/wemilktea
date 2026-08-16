# Product catalogue import

WM-48 provides a provider-neutral local/server-side import path for CSV and
JSON product records. It resolves canonical brands, categories, products, and
locations before producing one plan used by both dry-run and apply modes.

## Environment

Use local/server-only variables. Never use `VITE_*` variables or commit a
populated env file:

```sh
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Before using `.env.local`, verify it is ignored:

```sh
git check-ignore -v .env.local
```

Additional real CSV/JSON files under `data/product-imports/` are ignored; only
the committed example fixture is tracked.

## Run

Dry run is the default and performs no database writes:

```sh
bun --env-file=.env.local scripts/product-import/import-products.ts \
  --file data/product-imports/example.csv
```

Apply requires the explicit `--apply` flag and uses the exact same resolved
plan:

```sh
bun --env-file=.env.local scripts/product-import/import-products.ts \
  --file data/product-imports/example.csv \
  --apply
```

The importer rejects price-related fields (`price`, `price_cents`, `currency`,
and location-price variants). Prices are never written to `products` or
`location_products`.

## Safety behavior

- Product identity is the existing canonical `(brand slug, product slug)`.
- Missing product slugs use the shared application `slugify` helper.
- Exact existing products are skipped when canonical fields already match;
  changed exact products are updated; ambiguous same-brand name matches fail.
- Unknown brands, categories, locations, cross-brand locations, duplicate input
  identities, and invalid rows fail the plan.
- `all-current-brand-locations` resolves non-archived locations for the brand at
  import time. `selected` resolves exact location slugs. `unknown` creates no
  location relationship.
- New products are inserted with `is_published = false`. Apply never calls a
  publication RPC and never changes an existing product's publication state.
- New location relationships use unknown availability and preserve all existing
  location-specific prices. Existing relationships are not overwritten.
- Apply aborts before any write when plan validation errors exist. A later
  database failure is reported as a write failure; this local tool does not
  pretend to provide a cross-request transaction.
