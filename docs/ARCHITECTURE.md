# V1 architecture

```text
Public React app ─────┐
                       ├── Supabase ── PostgreSQL + PostGIS
Admin React app ──────┘       │          Auth + RLS
                               │
Server-side integrations ─────┼── Google Places API
                               └── Cloudflare R2
```

## System responsibilities

| System                                              | Owns                                                                                   | Does not own                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Public application                                  | Public routes, browse/search presentation, picker interaction, suggestion form UI      | Secrets, privileged writes, canonical store data   |
| Admin application                                   | Internal workflows for discovery, review, and catalog operations                       | Google Places credentials, image binaries          |
| Supabase PostgreSQL + PostGIS                       | Canonical stores, drinks, locations, moderation state, user submissions, relationships | R2 image bytes, Google Places as canonical source  |
| Supabase Auth + RLS                                 | Admin identity and row-level authorization                                             | Application presentation                           |
| Supabase Edge Functions or approved server boundary | Secret-bearing Google Places/R2 operations and privileged orchestration                | Browser UI                                         |
| Cloudflare R2                                       | WeMilktea-owned/permitted image objects                                                | Product records and image metadata                 |
| Cloudflare Pages                                    | Independent public/admin static application deployment                                 | Server-side secrets or database migrations         |
| Google Places API                                   | Candidate discovery and enrichment input, subject to its terms                         | Canonical WeMilktea records                        |
| Google Maps JavaScript API                          | Public map rendering using canonical coordinates and a browser-restricted key          | Store discovery, canonical content, server secrets |

## Data flow

The public app reads only published data under RLS. The admin app authenticates through Supabase and performs allowed operational work under RLS. Where a workflow needs a secret, the browser calls an authenticated server-side endpoint; that endpoint validates input, calls the provider, and persists only permitted data through Supabase.

Store discovery follows this boundary: an authorized admin invokes the `store-discovery` Edge Function, which uses the Google Places key server-side, records an operational run, and writes internal candidate records. Google results never publish or mutate canonical locations automatically. See [Google Places discovery](GOOGLE_PLACES_DISCOVERY.md).

Candidate review follows the same boundary. The admin fetches Google reference data only through `candidate-google-detail`; the function returns it transiently with attribution and never writes it to the candidate record. Atomic database RPCs resolve a reviewed candidate to a canonical draft location, an existing location, or a retained rejection. See [Candidate review](CANDIDATE_REVIEW.md).

The public Stores experience reads only published canonical locations and published parent brands through the anonymous Supabase boundary. It does not query candidates, discovery runs, or transient Google reference data. See [Public Stores experience](STORES.md).

Public Store Detail uses the same boundary by canonical location slug and may read only published available product relationships. It reuses the browser Maps renderer with canonical coordinates; Google Places is not part of public detail rendering. See [Public Store Detail](STORE_DETAIL.md).

The Stores map uses Google Maps JavaScript API only as a visual renderer for canonical coordinates. The browser receives a separately restricted Maps key through `VITE_GOOGLE_MAPS_BROWSER_KEY`; the server-only Places credential remains confined to Edge Functions. See [Design references](DESIGN.md).

Suggest a Store is a separate public-input flow: the browser may insert a validated pending `store_submissions` row under RLS, while the admin queue reads it for later trusted verification. It never writes directly to `locations` or publication state. See [Store submissions](STORE_SUBMISSIONS.md).

Store management operates only on canonical locations. An administrator can save validated canonical edits, publish a draft location, or unpublish a published location through admin-only database RPCs. Publishing atomically makes the parent brand publicly readable too, because public location access requires both records to be published. See [Store management](STORE_MANAGEMENT.md).

Images are uploaded or managed by server-side code. PostgreSQL stores object keys, ownership/permission status, attribution where required, and presentation metadata; R2 stores the file itself.

The `image-storage` Edge Function is the R2 boundary. An authenticated admin receives a short-lived, content-type-bound presigned PUT URL, uploads directly to R2, and asks the function to verify the object before the admin-only `attach_location_image` RPC stores metadata and a canonical relationship. Public applications only combine `VITE_R2_PUBLIC_BASE_URL` with validated keys from published image relationships. They never receive R2 credentials, list buckets, or call Google Places for image content. See [Image storage](IMAGE_STORAGE.md).

Product management uses the same boundary: canonical product edits and publication use admin-authorized database RPCs, while product/location availability is stored in `location_products`. Product images use the same `image-storage` function with a `products/{product-id}/...` key and `attach_product_image`/`remove_product_image` RPCs. No product is duplicated per store and no external menu source becomes canonical automatically. See [Product catalogue management](PRODUCTS.md).

## Deployment boundaries

Cloudflare Pages has one project per application. Supabase migrations are deployed through the Supabase workflow, separately from frontend deployments. Secrets are configured in Supabase Edge Functions or the approved server integration—not Cloudflare Pages client builds.
