# Google Places store discovery

WM-18 adds a manually triggered discovery pipeline. It is deliberately separate from candidate review: a Google result can create or update an internal candidate observation, but never a published WeMilktea location.

```text
Authorized admin browser
  -> Supabase Edge Function (store-discovery)
  -> Google Places Text Search (New)
  -> normalized, deduplicated candidate identity
  -> discovery_runs + store_candidates + observations
  -> future candidate review
```

The Admin invocation pins `store-discovery` to `ap-south-1`, the current
production database region, because the workflow performs many database
round-trips. Change that client setting if the production database moves.

## Security and configuration

`apps/admin` calls only the `store-discovery` Edge Function with the signed-in user's JWT. The function verifies the user and calls `is_admin()` before creating a service-role client. The Google key and Supabase service-role key are never sent to the browser.

For local function development, copy `supabase/functions/.env.example` to `supabase/functions/.env` and set:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_PLACES_API_KEY=
ADMIN_APP_ORIGIN=http://127.0.0.1:5174
```

For a deployed project, set `GOOGLE_PLACES_API_KEY` and the exact `ADMIN_APP_ORIGIN` as Supabase Edge Function secrets. Supabase provides its project URL and service-role context to deployed functions; confirm the deployed environment has the required variables before release. Restrict the Google key to the Places API, set a budget and quotas, and do not reuse the key in browser or Cloudflare client configuration.

Deploy after the migration is applied:

```sh
supabase functions deploy store-discovery
supabase secrets set GOOGLE_PLACES_API_KEY=... ADMIN_APP_ORIGIN=https://admin.example.com
```

## Search and API usage

`supabase/functions/store-discovery/discovery-config.ts` centrally owns eight Auckland-focused searches and a 35 km Auckland location bias. Each search requests at most two 20-result pages. This makes the upper bound 16 Text Search requests per manual run while covering city-wide, CBD, North Shore, east, and south searches.

The request field mask is intentionally limited to:

- Place ID
- display name and coordinates, used transiently only for duplicate assistance
- pagination token

No photos, reviews, ratings, opening hours, address, website, business status, or raw response payloads are requested or stored. The candidate record retains only the Google Place ID, provenance, status, possible canonical match, and discovery timestamps. Google may return overlapping and unstable result lists, so the pipeline removes duplicate Place IDs within one run and reuses the durable candidate record across runs.

## Candidate classification

1. An exact Google Place ID matching `locations.google_place_id` is counted as `known`; it does not create a candidate.
2. An exact Google Place ID matching `store_candidates.google_place_id` is observed again without adding another candidate row.
3. A new Place ID with the same normalized name as a canonical location within 100 metres is stored as `possible_duplicate` and linked to that location for human review. The name and coordinates are used only during this request.
4. All other valid results create a `new` candidate.

The secondary signal never merges or publishes anything. It only surfaces a review decision.

## Run reliability

Every invocation starts a `discovery_runs` row with `running` status and finalizes it with counts, `finished_at`, and a bounded error summary. A failed Google request is isolated to its query: other searches continue and a partially successful run is marked `succeeded` with errors. A database write failure stops the run and marks it `failed`. When a new run starts, rows still marked `running` for more than ten minutes are marked `failed` with a finish time; recent runs are left alone, and existing candidates and observations are not removed.

The testable `runStoreDiscovery` module is independent of the HTTP handler. A future scheduled function can call the same module with `triggerType: "scheduled"` without copying Google or classification logic.

## Google Places requirements

Google Place IDs are the durable external identity. Google-derived display content is not persisted. WM-19 uses the server-side `candidate-google-detail` lookup only when an administrator opens a candidate, shows a Google Maps attribution label, and captures separately verified WeMilktea data for any canonical location. Do not retain raw responses, copy Google photos to R2, or present Google-sourced content publicly without the required attribution. Before production launch, confirm the public Terms of Use and Privacy Policy treatment against the project's current Google agreement and the [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies).
