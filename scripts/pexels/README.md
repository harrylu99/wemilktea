# Pexels showcase image pool

WM-62 provides a local/server-side operator workflow for importing a small,
reviewed pool of temporary showcase images. Pexels credentials and R2/Supabase
privileged credentials never enter Admin or Web bundles.

## Environment

Copy the blank values from `scripts/pexels/.env.example` into the ignored
`.env.local`. Verify the file is ignored before adding credentials:

```sh
git check-ignore -v .env.local
```

## Discover

Discovery uses the configured `searchTerms` in `scripts/pexels/types.ts`,
spreads requests across those terms, and returns up to 40 unique candidates
per category. Results are never approved automatically; every manifest entry
starts with `approved: false`. Discovery writes no R2 or Supabase data:

```sh
bun --env-file=.env.local scripts/pexels/import-showcase.ts \
  --discover --output /tmp/wm62-showcase-manifest.json
```

Review the manifest and set `approved` to `true` only for selected entries.
The importer intentionally does not bulk-mirror or automatically approve
results.

## Apply

Validate an approved manifest without writes:

```sh
bun --env-file=.env.local scripts/pexels/import-showcase.ts \
  --manifest /tmp/wm62-showcase-manifest.json --dry-run
```

Import approved entries explicitly:

```sh
bun --env-file=.env.local scripts/pexels/import-showcase.ts \
  --apply --manifest /tmp/wm62-showcase-manifest.json
```

Images use `showcase/pexels/{photoId}.{extension}` in R2. Before apply, the
importer loads existing category/provider/photo identities from
`showcase_image_pool` once. Existing entries are logged as `SKIPPED` before
any Pexels download or R2 request. Supabase stores provider, photo ID, source
URL, attribution, category membership, and the reusable `image_assets`
relationship. Re-running the same manifest is safe.

## Assign products

Assignment is dry-run by default. It skips products that already have a
primary image and never replaces an existing relationship:

```sh
bun --env-file=.env.local scripts/pexels/assign-showcase.ts
bun --env-file=.env.local scripts/pexels/assign-showcase.ts --apply
```

The selection happens once during the explicit apply run. Web requests do not
call Pexels and do not randomize images.

## Store showcase images

Store discovery is a separate review pool. It uses generic bubble-tea-shop
searches, stores no Product category, and produces at most 60 unique
candidates. Every candidate starts with `approved: false`.

Discover locally without writing to Supabase or R2:

```sh
bun --env-file=.env.local scripts/pexels/import-store-showcase.ts \
  --discover --output /tmp/wm77-store-showcase-manifest.json
```

Review `/tmp/wm77-store-showcase-manifest.json` manually. Reject branded,
store-specific, watermarked, duplicated, or otherwise unsuitable images, and
only then set selected entries to `approved: true`.

Validate the reviewed manifest without writes:

```sh
bun --env-file=.env.local scripts/pexels/import-store-showcase.ts \
  --manifest /tmp/wm77-store-showcase-manifest.json --dry-run
```

Apply only after the human review:

```sh
bun --env-file=.env.local scripts/pexels/import-store-showcase.ts \
  --apply --manifest /tmp/wm77-store-showcase-manifest.json
```

Store assignment is also dry-run by default. It skips every location that
already has a primary image, balances usage among the least-used active pool
images, and persists assignments only with `--apply`:

```sh
bun --env-file=.env.local scripts/pexels/assign-store-showcase.ts
bun --env-file=.env.local scripts/pexels/assign-store-showcase.ts --apply
```

The Store pool reuses an existing Product-pool Pexels asset when the same
provider/photo identity is already present. Store stock is linked through the
reusable `image_assets` record and the `store_showcase_image_pool` table; it is
not copied into a location-specific `stores/{location-id}/...` object.

Do not apply or assign production images before the reviewed manifest has been
approved under WM-78.
