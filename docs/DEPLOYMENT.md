# Production deployment

This runbook takes the two Vite applications and the Supabase project from a
reviewed checkout to independently deployed Cloudflare Workers Static Assets
applications.
It is explicit about the boundary between browser-safe values and server-only
secrets.

## Release order

```text
preflight → reviewed Supabase migrations/RLS → Edge Functions → R2/Maps/Auth config
→ frontend builds → Workers deploy → integration checks → smoke tests → GO/NO-GO
```

Do not run a local reset against a production project. Production schema
changes are applied by reviewed migrations only.

## Supabase production automation

Reviewed Edge Function changes merged into `main` are deployed by
`.github/workflows/supabase-functions-deploy.yml`. The workflow is limited to
changes under `supabase/functions/**` or `supabase/config.toml`, so frontend-
only changes do not start a Supabase deployment. It always deploys the three
production functions together because `_shared/admin-auth.ts` is shared by all
three functions and each function owns its deployment dependency map:

```text
merge to main
→ path-filtered GitHub Actions run
→ production Environment deployment
→ deploy store-discovery
→ deploy candidate-google-detail
→ deploy image-storage
```

The workflow explicitly targets production project ref
`tqdxmotcpogyvzdvgopi` and uses `--project-ref`; it does not use local link
state. It records the commit SHA, target project ref, CLI version and migration
status in the Actions log. Each function is deployed in its own step, so a
failure stops the job and leaves the workflow visibly failed.

The workflow uses the Supabase CLI `2.113.0` and the official pinned
`supabase/setup-cli` action. Function deployment does not set, rotate, delete or
print runtime secrets.

### GitHub configuration required

Create a GitHub Environment named `production` and add this Environment secret:

```text
SUPABASE_ACCESS_TOKEN
```

Use a production-scoped Supabase access token and do not add it to repository
files, Vite variables, workflow output or pull-request workflows. The current
Environment does not require reviewer approval; restrict its deployment branch
policy to `main`. The workflow has only `contents: read`
permissions and does not run on pull requests, including forked pull requests.
The manual `workflow_dispatch` path is also guarded so it can execute only when
`github.ref` is exactly `refs/heads/main`.

### Database migrations are controlled separately

This workflow intentionally does **not** run `supabase db push`. A migration
merged to `main` does not imply that the production database has changed, and a
successful Edge Function deployment does not imply that migrations were
applied. Review and apply migrations as a separate production release step in
their original order.

Before applying a migration, inspect the remote history and use the current
CLI's dry-run support. The production target must be linked explicitly; never
run `supabase db reset` against production and never use local seed data as a
production migration.

For a controlled operator-led migration, use a clean checkout of the reviewed
`main` commit, set `SUPABASE_ACCESS_TOKEN` in the process environment, and use
an approved database password from the password manager:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase link \
  --project-ref tqdxmotcpogyvzdvgopi \
  --password "$SUPABASE_DB_PASSWORD"
SUPABASE_TELEMETRY_DISABLED=1 supabase migration list
SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked --dry-run
SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked
```

The password is shown here only as an environment variable name; do not put
its value in shell history, GitHub logs or the repository. If migration
automation is later introduced, it needs a separately approved workflow and a
production database-password boundary; it must not be added to the function
deployment job by accident.

### Failure and recovery

If the workflow fails, open the failed run for the exact commit SHA, project
ref and function step. Correct the source or deployment issue, then use
GitHub's **Re-run failed jobs** for that same trusted `main` commit after the
production Environment deployment is available. Do not rerun from a pull-request
workflow or change the project ref to make a deployment pass.

To verify an active function after a successful run, inspect the function's
deployment/version in the Supabase Dashboard and invoke it through its normal
authenticated application path. If a function is missing from production,
rerun the workflow or use the documented manual command from a clean reviewed
checkout:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy <function-name> \
  --project-ref tqdxmotcpogyvzdvgopi \
  --use-api
```

If GitHub `main` is ahead of production, first determine whether the gap is an
Edge Function deployment or a pending migration. Restore function parity by
rerunning the function workflow; handle database drift with a reviewed
forward migration or an approved corrective procedure. Do not reset or roll
back the production database blindly.

## Production topology

| Responsibility                              | Production service                               |
| ------------------------------------------- | ------------------------------------------------ |
| Public application                          | Cloudflare Worker Static Assets for `apps/web`   |
| Admin application                           | Cloudflare Worker Static Assets for `apps/admin` |
| Database, PostGIS, Auth and RLS             | Supabase Cloud                                   |
| Server-side Google Places and R2 operations | Supabase Edge Functions                          |
| Owned/permitted image bytes                 | Cloudflare R2                                    |
| Public map rendering                        | Google Maps JavaScript API                       |

The applications are static SPAs. Each Wrangler configuration uses
`assets.not_found_handling: "single-page-application"`, which serves
`index.html` for direct navigation requests that do not match a static asset.
The Admin `_headers` file is consumed by Workers Static Assets to apply the
Admin `X-Robots-Tag` policy.

## Preflight inventory

Record the real values in the release ticket or password manager, never in this
file:

| Item                                         | Value/status to record before release |
| -------------------------------------------- | ------------------------------------- |
| Supabase project ref, region and environment |                                       |
| Cloudflare account and Worker names          |                                       |
| Public and Admin production origins          |                                       |
| R2 bucket and public base URL                |                                       |
| Google Maps browser-key restrictions         |                                       |
| Google Places server-key restrictions        |                                       |
| Auth site URL and allowed redirects          |                                       |
| Approved production catalogue/bootstrap data |                                       |

If any value is unknown, the release is not ready for a production GO.

## Environment matrix

### Browser-safe Workers variables

Configure these in the corresponding Cloudflare Workers project. They are
intentionally delivered to browser code, so use only publishable values.

Public (`apps/web`):

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_R2_PUBLIC_BASE_URL
VITE_GOOGLE_MAPS_BROWSER_KEY
VITE_PUBLIC_SITE_URL
VITE_PUBLIC_NO_INDEX
VITE_TURNSTILE_SITE_KEY
```

Admin (`apps/admin`):

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_R2_PUBLIC_BASE_URL
VITE_TURNSTILE_SITE_KEY
```

The Maps key must be restricted by HTTP referrer to the final public origin
(and any deliberately supported preview origins) and restricted to the APIs
used by the map renderer. The R2 value is a public read base URL, never a
credential.

Set `VITE_PUBLIC_SITE_URL` to the final public HTTPS origin for the `main`
Cloudflare Workers build. Cloudflare supplies `WORKERS_CI_BRANCH`; the Web
build rejects a missing or unsafe value only when that branch is `main`, rather
than treating every Vite `production` mode build as a production deployment.
Non-main Workers builds do not require a separate preview origin and are forced
noindex. A Worker runtime variable set after static assets are built cannot
change generated `robots.txt` or `sitemap.xml`. Local builds retain the
`http://localhost:5173` fallback.

Set `VITE_PUBLIC_NO_INDEX=true` only for the persistent Web DEV Worker. This
overrides route-level public robots values, changes the static HTML and runtime
metadata to `noindex, nofollow, noarchive, nosnippet`, and emits a disallow-all
`robots.txt`. Production leaves this variable unset or `false`.

## Persistent Cloudflare DEV Workers

The repository supports two named Wrangler environments without changing the
production Worker names:

| App   | Production config | DEV config | DEV Worker  |
| ----- | ----------------- | ---------- | ----------- |
| Web   | `name: "web"`     | `env.dev`  | `web-dev`   |
| Admin | `name: "admin"`   | `env.dev`  | `admin-dev` |

The named environment changes only the Worker name. The existing SPA asset
directory and compatibility settings remain shared by the top-level config.
Wrangler 4.123.0 dry-runs accepted `--env dev` and applied the shared asset
configuration; the explicit names are `web-dev` and `admin-dev`. Confirm the
active names in Cloudflare after the first DEV deployment.

Local DEV deployments, after the corresponding browser-safe variables are
configured, are:

```sh
bun --filter @wemilktea/web build
npx wrangler deploy --env dev --config apps/web/wrangler.jsonc

bun --filter @wemilktea/admin build
npx wrangler deploy --env dev --config apps/admin/wrangler.jsonc
```

Production remains unchanged and must continue to use the commands without
`--env dev`:

```sh
bun --filter @wemilktea/web build
npx wrangler deploy --config apps/web/wrangler.jsonc

bun --filter @wemilktea/admin build
npx wrangler deploy --config apps/admin/wrangler.jsonc
```

### Workers Builds dashboard configuration

Workers Builds settings are stored in Cloudflare rather than these Wrangler
files. Configure the existing `web` and `admin` Workers independently with
the following values:

| Setting                       | `web`                                                            | `admin`                                                            |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Repository                    | `harrylu99/wemilktea`                                            | `harrylu99/wemilktea`                                              |
| Root directory                | `/`                                                              | `/`                                                                |
| Production branch             | `main`                                                           | `main`                                                             |
| Build command                 | `bun --filter @wemilktea/web build`                              | `bun --filter @wemilktea/admin build`                              |
| Production deploy command     | `npx wrangler deploy --config apps/web/wrangler.jsonc`           | `npx wrangler deploy --config apps/admin/wrangler.jsonc`           |
| Non-production branch builds  | Enabled                                                          | Enabled                                                            |
| Non-production deploy command | `npx wrangler deploy --env dev --config apps/web/wrangler.jsonc` | `npx wrangler deploy --env dev --config apps/admin/wrangler.jsonc` |

The non-production command intentionally uses `wrangler deploy`, not the
default `wrangler versions upload`: the latter uploads a version but does not
make it the active deployment for a persistent DEV Worker. Cloudflare's
Workers Builds configuration supports a custom non-production deploy command.

Set the browser-safe variables separately for the production and
non-production triggers. The Workers Builds API models build environment
variables per trigger; do not assume a production value is suitable for DEV.
Do not put any service-role, R2, Google Places, or Cloudflare API credentials
in these Vite variables.

### Monorepo watch paths

Build Watch Paths are also dashboard-only. Replace the current `Include: *`
configuration with an allow-list and retain `node_modules/**` and `.git/**` in
the excludes. Enter these paths in the corresponding Worker's Include field.

Web:

```text
apps/web/**
packages/**
package.json
bun.lock
tsconfig.json
tsconfig.base.json
apps/web/tsconfig*.json
apps/web/vite.config.ts
apps/web/wrangler.jsonc
```

Admin:

```text
apps/admin/**
packages/**
package.json
bun.lock
tsconfig.json
tsconfig.base.json
apps/admin/tsconfig*.json
apps/admin/vite.config.ts
apps/admin/wrangler.jsonc
```

For both Workers, use:

```text
node_modules/**
.git/**
```

The application and shared-package entries ensure app-only changes rebuild
only the relevant Worker, while changes to workspace dependencies, the lockfile
or shared TypeScript configuration rebuild both. Confirm the dashboard's
Include/Exclude fields retain these as path patterns rather than leaving the
legacy catch-all include.

### DEV backend safety

`admin-dev` must not be configured with the production Supabase URL and anon
key. The Admin can mutate brands, locations, products, candidates,
submissions and image metadata, and can invoke the image-storage function.
WM-55 does not create a second Supabase project, R2 bucket, or Edge Function
deployment, so a fully functional Admin DEV environment remains a follow-up.
Until a separate backend is provisioned, leave Admin DEV browser backend
variables unset or treat the Worker as a static shell/configuration smoke test;
do not use it for authenticated mutations.

Web DEV may reuse production public-read values only for an explicitly
read-only smoke test. The public Web also has a store-suggestion insert path,
so do not submit suggestions or run other mutating scenarios from Web DEV
until a separate development backend is available. A production public R2
base URL is likewise read-only from the browser, but Admin uploads still need a
development R2/function configuration.

When a DEV backend is approved, add only the exact origins needed:

- the actual `web-dev` origin to the browser Maps key HTTP referrer allow-list
  if map verification is required;
- the actual `admin-dev` origin to the DEV Supabase Auth site/redirect settings;
- the actual `admin-dev` origin to DEV Edge Function `ADMIN_APP_ORIGIN` and R2
  CORS settings.

Do not add wildcard origins or change production CORS, RLS, Auth redirects,
Google restrictions or Edge Function validation for this environment.

The exact `*.workers.dev` origins must be recorded after the first DEV deploy;
this repository does not guess the account-specific Workers subdomain.

### DEV verification

After setting the non-production build variables and backend policy, deploy
DEV only and verify the resulting Worker names are `web-dev` and `admin-dev`.
For Web, check the homepage, a direct SPA route, static assets, the map and
published store reads, then inspect the bundle for production canonical URLs
and confirm `robots.txt` disallows crawling. For Admin, check only shell
loading and the intentionally configured backend state until a separate DEV
Supabase/R2 environment exists. Never use a DEV command without `--env dev` as
a test; it targets the production Worker.

### Server-only Edge Function secrets

Configure these with Supabase secrets. Never put them in a Vite environment
file, database row, frontend source, or response body.

| Secret                              | Functions                                                     | Purpose                                 |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `GOOGLE_PLACES_API_KEY`             | `store-discovery`, `candidate-google-detail`                  | Server-side Places requests             |
| `ADMIN_APP_ORIGIN`                  | `store-discovery`, `candidate-google-detail`, `image-storage` | Exact CORS/origin allow-list            |
| `MOMENTS_APP_ORIGIN`                | `community-image-storage`                                     | Exact public Web CORS origin            |
| `MOMENTS_IMAGE_UPLOAD_URL`          | `community-image-storage`                                     | Bounded Worker upload endpoint          |
| `MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET` | `community-image-storage`                                     | Worker upload capability signing secret |
| `MOMENTS_IMAGE_VERIFIER_URL`        | `community-image-storage`                                     | Private verifier Worker endpoint        |
| `MOMENTS_IMAGE_VERIFIER_TOKEN`      | `community-image-storage`                                     | Shared server-to-Worker token           |
| `SUPABASE_SERVICE_ROLE_KEY`         | `store-discovery`, `community-image-storage`                  | Privileged server-side DB operations    |
| `R2_ACCOUNT_ID`                     | `image-storage`, `community-image-storage`                    | R2 endpoint                             |
| `R2_ACCESS_KEY_ID`                  | `image-storage`, `community-image-storage`                    | Bucket-scoped R2 access                 |
| `R2_SECRET_ACCESS_KEY`              | `image-storage`, `community-image-storage`                    | Bucket-scoped R2 access                 |
| `R2_BUCKET`                         | `image-storage`, `community-image-storage`                    | Image bucket name                       |
| `R2_PUBLIC_BASE_URL`                | `image-storage`                                               | Validated public image URL construction |

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
2. For a controlled migration release, link this checkout using the
   authenticated Supabase CLI:

   ```sh
   SUPABASE_TELEMETRY_DISABLED=1 supabase link \
     --project-ref tqdxmotcpogyvzdvgopi \
     --password "$SUPABASE_DB_PASSWORD"
   ```

3. Inspect migration state before changing anything:

   ```sh
   supabase migration list
   ```

4. Review the dry-run, then apply only the reviewed migrations:

   ```sh
   SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked --dry-run
   SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked
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

Edge Functions are normally deployed by the path-filtered GitHub Actions
workflow after a reviewed merge to `main`. If CI is unavailable, deploy only
the functions present in the repository and required for the release from a
clean reviewed checkout:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy store-discovery \
  --project-ref tqdxmotcpogyvzdvgopi --use-api
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy candidate-google-detail \
  --project-ref tqdxmotcpogyvzdvgopi --use-api
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy image-storage \
  --project-ref tqdxmotcpogyvzdvgopi --use-api
```

The CLI uses the existing server-side function secrets; do not set, rotate or
delete them as part of source deployment. Verify each function's deployment and
logs. Discovery and candidate detail use the server-only Places key; image
storage uses the R2 secrets. A function must reject an untrusted origin and a
non-admin JWT before doing privileged work.

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

## Cloudflare Workers Static Assets

Use one Worker with Static Assets per app. Build from the repository root so Bun
resolves the workspace lockfile, then deploy the matching `dist` directory with
the app's Wrangler configuration.

| Project | Build command                         | Output directory  |
| ------- | ------------------------------------- | ----------------- |
| Public  | `bun --filter @wemilktea/web build`   | `apps/web/dist`   |
| Admin   | `bun --filter @wemilktea/admin build` | `apps/admin/dist` |

Build from the repository root and deploy the matching Worker:

```sh
bun --filter @wemilktea/web build
bunx wrangler deploy --config apps/web/wrangler.jsonc

bun --filter @wemilktea/admin build
bunx wrangler deploy --config apps/admin/wrangler.jsonc
```

Authenticate Wrangler using the Cloudflare account that owns the projects and
keep the account token out of the repository. Use separate Worker names and
custom domains for the public and Admin applications.

After each deploy, verify direct navigation and reload for every public and
protected route. Wrangler's SPA asset configuration, rather than a hosting-
provider redirect file, is responsible for the application shell fallback.

## Deployed smoke test

Record the exact origins and timestamp in the release ticket. Run the safe
public journey:

```text
Home → Search → Drinks → Drink Detail → Store Detail
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

- **Workers:** promote/redeploy the prior known-good deployment.
- **Edge Functions:** redeploy the prior known-good function revision.
- **Configuration:** restore the previous environment values and origin
  allow-lists.
- **Database:** migrations are forward-controlled. Do not invent a destructive
  rollback; if a migration is not safely reversible, ship a reviewed corrective
  migration and document the incident.

## Troubleshooting

| Symptom                  | First place to look                                                   |
| ------------------------ | --------------------------------------------------------------------- |
| Direct route returns 404 | Wrangler `assets.not_found_handling` and the published `dist` output  |
| Public data is empty     | Supabase project URL/key, production catalogue and RLS                |
| Admin cannot sign in     | Auth Site URL/redirects and `admin_users`                             |
| Function returns 403     | `ADMIN_APP_ORIGIN`, JWT and `is_admin()`                              |
| Discovery fails          | Function logs, Places quota/key restriction and migration state       |
| Image upload fails       | Worker upload URL/token, R2 secrets, lifecycle rule and function logs |
| Map is unavailable       | Browser key referrer/API restriction and console errors               |

## Release evidence

Attach to the release ticket: commit SHA, Cloudflare deployment IDs/URLs,
Supabase project ref (not credentials), migration status, function deployment
status, R2/Maps verification results, smoke-test results, and the completed
[release checklist](RELEASE_CHECKLIST.md).
