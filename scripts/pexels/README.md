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

Discovery uses predefined searches and writes no R2 or Supabase data:

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

Images use `showcase/pexels/{photoId}.{extension}` in R2. Supabase stores
provider, photo ID, source URL, attribution, category membership, and the
reusable `image_assets` relationship. Re-running the same manifest is safe.

## Assign products

Assignment is dry-run by default. It skips products that already have a
primary image and never replaces an existing relationship:

```sh
bun --env-file=.env.local scripts/pexels/assign-showcase.ts
bun --env-file=.env.local scripts/pexels/assign-showcase.ts --apply
```

The selection happens once during the explicit apply run. Web requests do not
call Pexels and do not randomize images.
