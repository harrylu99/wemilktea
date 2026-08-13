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
- `approve_store_candidate`, `merge_store_candidate`, and `reject_store_candidate` are admin-only, transactionally safe RPCs. They lock the candidate row, reject repeated resolution, and preserve candidate observations. Approval creates a draft location; merge can attach the candidate Place ID only when the target location has no conflicting Place ID.
- `update_location_management` is an admin-only canonical location editor. It preserves the immutable Google Place ID and uses `updated_at` to reject stale writes. `publish_location` validates the canonical location and atomically marks both the location and its parent brand published; `unpublish_location` returns only the location to `draft`.
- The server-only `find_possible_location_duplicate()` function returns a canonical location ID only when a normalized candidate name matches and its PostGIS point is within 100 metres. It is executable only by `service_role`; it cannot grant public or ordinary authenticated users location matching access.
- `store_submissions` is a separate public-input queue. Its moderation lifecycle is `pending`, `approved`, `rejected`, or `duplicate`. Anonymous clients can insert only pending rows; they cannot read, update, delete, or set moderation fields. WM-23 enforces required-field, size, URL, and email checks in the database. A submission never creates a canonical location automatically.

## Images

`image_assets` stores metadata only, including `content_type`, `byte_size`, optional dimensions, alt text, and provenance. WeMilktea, merchant, and user images use an R2 object key after permitted upload. Google images retain external metadata and are explicitly prevented from claiming an R2 object key. `product_images` and `location_images` are explicit links, with at most one primary image per entity. The admin-only `attach_location_image` and `remove_location_image` RPCs protect location image replacement/removal; direct authenticated table writes are revoked so the Edge Function remains the trusted R2 boundary.

WM-25 adds admin RPCs for product create/update/publication, same-brand `location_products` upserts, and product image attachment/removal. Product publication requires its parent brand and category to be published; public product/image policies therefore remain safe for WM-26/27.

## RLS foundation

All V1 tables have RLS enabled. Anonymous and normal authenticated users receive only the grants and policies needed to read published public catalogue rows and insert pending store submissions. No public policy or grant exposes discovery runs, candidates, observations, or moderation data.

`admin_users` is a private allow-list linked to `auth.users`. The `is_admin()` security-definer function is available only to authenticated users and is used by every admin data policy. Administrators can operate the catalogue and moderation tables; authenticated users outside the allow-list cannot. See [Admin authentication](ADMIN_AUTH.md).

## Local verification

After Docker and the Supabase CLI are available:

```sh
supabase start
supabase db reset
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/verify_v1_schema.sql
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/candidate_review_workflow.sql
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/store_management_workflow.sql
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/public_stores_workflow.sql
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/public_store_detail_workflow.sql
docker exec -i supabase_db_wemilktea-v1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/image_storage_workflow.sql
```
