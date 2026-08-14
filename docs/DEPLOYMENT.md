# Production deployment

This runbook takes the two Vite applications and the Supabase project from a
reviewed checkout to independently deployed Cloudflare Pages applications.
It is explicit about the boundary between browser-safe values and server-only
secrets.

## Release order

```text
preflight → Supabase migrations/RLS → Edge Functions → R2/Maps/Auth config
→ frontend builds → Pages deploy → integration checks → smoke tests → GO/NO-GO
```

Do not run a local reset against a production project. Production schema
changes are applied by reviewed migrations only.

## Production topology

| Responsibility                              | Production service                        |
| ------------------------------------------- | ----------------------------------------- |
| Public application                          | Cloudflare Pages project for `apps/web`   |
| Admin application                           | Cloudflare Pages project for `apps/admin` |
| Database, PostGIS, Auth and RLS             | Supabase Cloud                            |
| Server-side Google Places and R2 operations | Supabase Edge Functions                   |
| Owned/permitted image bytes                 | Cloudflare R2                             |
| Public map rendering                        | Google Maps JavaScript API                |

The Pages applications are static SPAs. The `_redirects` file in each app
routes direct client-side URLs to `index.html`.

## Preflight inventory

Record the real values in the release ticket or password manager, never in this
file:

| Item                                         | Value/status to record before release |
| -------------------------------------------- | ------------------------------------- |
| Supabase project ref, region and environment |                                       |
| Cloudflare account and Pages project names   |                                       |
| Public and Admin production origins          |                                       |
| R2 bucket and public base URL                |                                       |
| Google Maps browser-key restrictions         |                                       |
| Google Places server-key restrictions        |                                       |
| Auth site URL and allowed redirects          |                                       |
| Approved production catalogue/bootstrap data |                                       |

If any value is unknown, the release is not ready for a production GO.

## Environment matrix

### Browser-safe Pages variables

Configure these in the corresponding Cloudflare Pages project. They are
intentionally delivered to browser code, so use only publishable values.

Public (`apps/web`):

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_R2_PUBLIC_BASE_URL
VITE_GOOGLE_MAPS_BROWSER_KEY
```

Admin (`apps/admin`):

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_R2_PUBLIC_BASE_URL
```

The Maps key must be restricted by HTTP referrer to the final public origin
(and any deliberately supported preview origins) and restricted to the APIs
used by the map renderer. The R2 value is a public read base URL, never a
credential.

### Server-only Edge Function secrets

Configure these with Supabase secrets. Never put them in a Vite environment
file, database row, frontend source, or response body.

| Secret                      | Functions                                                     | Purpose                                 |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `GOOGLE_PLACES_API_KEY`     | `store-discovery`, `candidate-google-detail`                  | Server-side Places requests             |
| `ADMIN_APP_ORIGIN`          | `store-discovery`, `candidate-google-detail`, `image-storage` | Exact CORS/origin allow-list            |
| `SUPABASE_SERVICE_ROLE_KEY` | `store-discovery`                                             | Privileged discovery writes             |
| `R2_ACCOUNT_ID`             | `image-storage`                                               | R2 endpoint                             |
| `R2_ACCESS_KEY_ID`          | `image-storage`                                               | Bucket-scoped R2 access                 |
| `R2_SECRET_ACCESS_KEY`      | `image-storage`                                               | Bucket-scoped R2 access                 |
| `R2_BUCKET`                 | `image-storage`                                               | Image bucket name                       |
| `R2_PUBLIC_BASE_URL`        | `image-storage`                                               | Validated public image URL construction |

Supabase supplies the deployed function context for `SUPABASE_URL` and the
function's service context. Follow `supabase/functions/.env.example` for local
development names.

## Local release candidate checks

From the repository root:

```sh
bun install --frozen-lockfile
supabase db reset --yes
bun test
bun run e2e
bun run e2e -- e2e/accessibility.playwright.ts
bun run lint
bun run typecheck
bun run build
bun run format:check
git diff --check
supabase db lint --local --schema public --fail-on error
supabase db advisors --local
```

The local Supabase CLI may need telemetry disabled in restricted environments:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --yes
```

The current e2e configuration defaults to local `http://127.0.0.1:5173` and
accepts a deployed base URL without starting Vite:

```sh
PLAYWRIGHT_BASE_URL=https://public.example bun run e2e
PLAYWRIGHT_BASE_URL=https://public.example bun run e2e -- e2e/accessibility.playwright.ts
```

Only run mutating production scenarios with approved test data and a cleanup
plan. The normal responsive/accessibility suites use local seeded data and are
not a substitute for deployed integration checks.

## Supabase Cloud

1. Confirm the project ref and that the target is the intended production
   project.
2. Link this checkout using the authenticated Supabase CLI:

   ```sh
   supabase link --project-ref <PROJECT_REF>
   ```

3. Inspect migration state before changing anything:

   ```sh
   supabase migration list
   ```

4. Apply reviewed migrations:

   ```sh
   supabase db push
   ```

5. Verify migration history, extensions, indexes, RLS and policies in the
   Cloud project. Never run `supabase db reset` against it.
6. Treat `supabase/seed.sql` as development data unless a release owner has
   explicitly approved each row as production bootstrap data. Load approved
   canonical catalogue data through a reviewed, auditable process.

### Auth

Set the Admin production origin as the Supabase Auth Site URL and add only the
exact required redirect URLs. Do not use a wildcard redirect. Create the first
admin in Supabase Auth, then add that user ID to `public.admin_users` through
the documented trusted procedure in [Admin authentication](ADMIN_AUTH.md).

## Edge Functions

Deploy only the functions present in the repository and required for the
release:

```sh
supabase functions deploy store-discovery
supabase functions deploy candidate-google-detail
supabase functions deploy image-storage
```

Set secrets without echoing values in shell history where possible, then verify
each function's deployment and logs. Discovery and candidate detail use the
server-only Places key; image storage uses the R2 secrets. A function must
reject an untrusted origin and a non-admin JWT before doing privileged work.

## Cloudflare R2

Create or select the production image bucket and use an API token scoped to that
bucket and only the object operations required by `image-storage`. Configure
narrow CORS origins for the deployed Admin origin and any explicitly supported
development/preview origins. Configure public read delivery using the value
stored in `R2_PUBLIC_BASE_URL`.

Verify the live path with permitted test content:

```text
Admin → authorize → upload → attach metadata → public read
→ replace → public read → remove → fallback
```

Do not upload Google Places photos. PostgreSQL stores image metadata and
relationships; R2 stores bytes.

## Google configuration

Create two separate Google credentials:

- a browser-restricted Maps JavaScript key for the final public origin;
- a server-only Places key restricted to the Places API and used only by Edge
  Functions.

Verify `/stores` and `/stores/:slug` on the deployed public origin. A map
failure must leave the canonical list, address and directions usable. Verify
that browser network requests do not call Places or expose the server key.

If discovery is enabled for launch, run one controlled Admin discovery and
confirm that only the durable Place ID is retained in candidate data. If it is
disabled, record that explicitly as a launch decision.

## Cloudflare Pages

The preferred Git-integrated monorepo configuration is one Pages project per
app with repository root `/` so Bun resolves the workspace lockfile:

Cloudflare's [monorepo build configuration](https://developers.cloudflare.com/pages/configuration/monorepos/)
supports separate project roots/builds. For prebuilt assets, use the
[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
workflow.

| Project | Build command                         | Output directory  |
| ------- | ------------------------------------- | ----------------- |
| Public  | `bun --filter @wemilktea/web build`   | `apps/web/dist`   |
| Admin   | `bun --filter @wemilktea/admin build` | `apps/admin/dist` |

If a Pages project is configured with root directory `apps/web` or
`apps/admin`, use `bun run build` and `dist` and verify that the build image
still installs from the workspace root. Do not mix the two configurations.

For a prebuilt/direct upload, build from the repository root and deploy only
the matching output directory:

```sh
bun --filter @wemilktea/web build
bunx wrangler pages deploy apps/web/dist --project-name <PUBLIC_PROJECT>

bun --filter @wemilktea/admin build
bunx wrangler pages deploy apps/admin/dist --project-name <ADMIN_PROJECT>
```

Authenticate Wrangler using the Cloudflare account that owns the projects and
keep the account token out of the repository. Pages direct uploads are an
alternative to Git integration; choose one project strategy and document it.

After each deploy, verify direct navigation and reload for every public and
protected route. The `_redirects` file must be present in the published output.

## Deployed smoke test

Record the exact origins and timestamp in the release ticket. Run the safe
public journey:

```text
Home → Explore → Drinks → Drink Detail → Store Detail
Home → Stores → Store Detail → Directions
Home → Picker → Picker Result → View drink / View store / Pick again
Stores → Suggest Store → validation → approved test submission → success
```

For Admin, verify login, refresh/session restore, protected direct routes,
Stores, Products, Submissions, logout, and the configured discovery/image
operations. Inspect browser console and network requests for localhost,
service-role keys, Places calls from browser code, CORS failures, failed image
requests and unexplained 4xx/5xx responses.

Run the deployed Playwright subset with `PLAYWRIGHT_BASE_URL` after confirming
the production catalogue contains the slugs used by the tests. Do a focused
iPhone Safari smoke pass for Stores, Store Detail, Picker, Picker Result and
Suggest Store. A short VoiceOver pass is recommended; it is not WCAG
certification.

## Rollback

- **Pages:** promote/redeploy the prior known-good deployment.
- **Edge Functions:** redeploy the prior known-good function revision.
- **Configuration:** restore the previous environment values and origin
  allow-lists.
- **Database:** migrations are forward-controlled. Do not invent a destructive
  rollback; if a migration is not safely reversible, ship a reviewed corrective
  migration and document the incident.

## Troubleshooting

| Symptom                  | First place to look                                             |
| ------------------------ | --------------------------------------------------------------- |
| Direct route returns 404 | Pages deployment output and `_redirects`                        |
| Public data is empty     | Supabase project URL/key, production catalogue and RLS          |
| Admin cannot sign in     | Auth Site URL/redirects and `admin_users`                       |
| Function returns 403     | `ADMIN_APP_ORIGIN`, JWT and `is_admin()`                        |
| Discovery fails          | Function logs, Places quota/key restriction and migration state |
| Image upload fails       | R2 secrets, bucket CORS, presigned URL expiry and function logs |
| Map is unavailable       | Browser key referrer/API restriction and console errors         |

## Release evidence

Attach to the release ticket: commit SHA, Cloudflare deployment IDs/URLs,
Supabase project ref (not credentials), migration status, function deployment
status, R2/Maps verification results, smoke-test results, and the completed
[release checklist](RELEASE_CHECKLIST.md).
