# External store mappings

WM-51 adds `public.location_external_sources` as the provider-neutral mapping
between a canonical WeMilktea `locations` row and an external delivery-platform
store identity.

The table currently permits the constrained provider value `uber_eats`. The
provider is stored as text rather than a PostgreSQL enum so adding a future
provider does not require an enum migration. `external_store_id` is opaque text;
Uber's UUID-shaped IDs do not define the model for other providers.

Each location may have one mapping per provider, and each provider external ID
may map to only one canonical location. The canonical location foreign key uses
`ON DELETE RESTRICT` so integration history cannot disappear silently when a
location is removed. `verified_at` records when the mapping was verified; no raw
provider payload, display name, or speculative metadata is stored.

Mappings are internal integration metadata. Anonymous users have no table
privileges or RLS policy. Authenticated users receive table privileges only so
the existing `public.is_admin()` policy can authorize Admin reads and writes.
WM-52 should resolve a mapping by querying `(location_id, provider)` inside its
server-side boundary and pass only `{ provider, externalStoreId }` to the Uber
adapter.

## Local verification

The SQL workflow test is:

```sh
supabase/tests/location_external_sources_workflow.sql
```

Run it against the local Supabase database after starting the local stack. It
covers valid admin access, ordinary-user denial, anonymous denial, both
uniqueness constraints, the location foreign key, and the provider check.

## Production migration

The Edge Function deployment workflow does not apply database migrations. After
review and merge, use a clean checkout of the approved `main` commit and follow
the existing controlled process in `docs/DEPLOYMENT.md`:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase migration list
SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked --dry-run
SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked
```

Link the intended project using the approved production access token and
database password from the password manager. Never run `supabase db reset`
against production and never commit either credential.
