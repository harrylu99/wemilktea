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

| System                                              | Owns                                                                                   | Does not own                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Public application                                  | Public routes, browse/search presentation, picker interaction, suggestion form UI      | Secrets, privileged writes, canonical store data  |
| Admin application                                   | Internal workflows for discovery, review, and catalog operations                       | Google Places credentials, image binaries         |
| Supabase PostgreSQL + PostGIS                       | Canonical stores, drinks, locations, moderation state, user submissions, relationships | R2 image bytes, Google Places as canonical source |
| Supabase Auth + RLS                                 | Admin identity and row-level authorization                                             | Application presentation                          |
| Supabase Edge Functions or approved server boundary | Secret-bearing Google Places/R2 operations and privileged orchestration                | Browser UI                                        |
| Cloudflare R2                                       | WeMilktea-owned/permitted image objects                                                | Product records and image metadata                |
| Cloudflare Pages                                    | Independent public/admin static application deployment                                 | Server-side secrets or database migrations        |
| Google Places API                                   | Candidate discovery and enrichment input, subject to its terms                         | Canonical WeMilktea records                       |

## Data flow

The public app reads only published data under RLS. The admin app authenticates through Supabase and performs allowed operational work under RLS. Where a workflow needs a secret, the browser calls an authenticated server-side endpoint; that endpoint validates input, calls the provider, and persists only permitted data through Supabase.

Store discovery follows this boundary: an authorized admin invokes the `store-discovery` Edge Function, which uses the Google Places key server-side, records an operational run, and writes internal candidate records. Google results never publish or mutate canonical locations automatically. See [Google Places discovery](GOOGLE_PLACES_DISCOVERY.md).

Images are uploaded or managed by server-side code. PostgreSQL stores object keys, ownership/permission status, attribution where required, and presentation metadata; R2 stores the file itself.

## Deployment boundaries

Cloudflare Pages has one project per application. Supabase migrations are deployed through the Supabase workflow, separately from frontend deployments. Secrets are configured in Supabase Edge Functions or the approved server integration—not Cloudflare Pages client builds.
