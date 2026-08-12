# V1 database schema

The database owns canonical, reviewed WeMilktea data. Google Places contributes discovery and enrichment inputs; it does not own brands, locations, products, or published catalogue records.

```text
brands 1 ── * locations
brands 1 ── * products * ── 1 categories
locations * ── * products (location_products)
products 1 ── * product_images * ── 1 image_assets
locations 1 ── * location_images * ── 1 image_assets
discovery_runs 1 ── * store_candidate_observations * ── 1 store_candidates
locations 1 ── * store_candidates (possible match or resolved canonical location)
auth.users 1 ── * store_submissions (reviewer, after WM-17 authorization)
```

## Catalogue

- A `brand` represents a business. A `location` is one physical branch, so products can be shared across branches without treating each shop as a separate brand.
- `products` are curated discovery records, not POS or ordering menus. A product has one primary brand and category.
- `location_products` records a product’s local price, availability, source, and last verification time. Its composite key prevents duplicate product/location rows, and composite foreign keys prevent assigning a brand’s product to another brand’s location.
- Coordinates are stored once as PostGIS `geography(Point, 4326)`. Do not add duplicated latitude/longitude columns.

## Discovery and submissions

- `store_candidates` is a durable record keyed by Google Place ID. Google-derived display data is not persisted: candidate review must retrieve it on demand with proper attribution, then capture only independently verified WeMilktea data when promoting a location. `store_candidate_observations` connects each Place ID to every discovery run without creating another candidate row.
- Candidate review records `reviewed_at`, `reviewed_by`, and (for approval/merge) `resolved_location_id`. New, known, and possible-duplicate candidates remain unreviewed; rejected candidates record a reviewer without a canonical link; approved candidates must record both a reviewer and their canonical location.
- The server-only `find_possible_location_duplicate()` function returns a canonical location ID only when a normalized candidate name matches and its PostGIS point is within 100 metres. It is executable only by `service_role`; it cannot grant public or ordinary authenticated users location matching access.
- `store_submissions` is a separate public-input queue. Its moderation lifecycle is `pending`, `approved`, `rejected`, or `duplicate`.

## Images

`image_assets` stores metadata only. WeMilktea, merchant, and user images use an R2 object key after permitted upload. Google images retain external metadata and are explicitly prevented from claiming an R2 object key. `product_images` and `location_images` are explicit links, with at most one primary image per entity.

## RLS foundation

All V1 tables have RLS enabled. Anonymous and normal authenticated users receive only the grants and policies needed to read published public catalogue rows and insert pending store submissions. No public policy or grant exposes discovery runs, candidates, observations, or moderation data.

`admin_users` is a private allow-list linked to `auth.users`. The `is_admin()` security-definer function is available only to authenticated users and is used by every admin data policy. Administrators can operate the catalogue and moderation tables; authenticated users outside the allow-list cannot. See [Admin authentication](ADMIN_AUTH.md).

## Local verification

After Docker and the Supabase CLI are available:

```sh
supabase start
supabase db reset
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/verify_v1_schema.sql
```
