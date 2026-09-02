# WeMilktea V1

WeMilktea is an Auckland-focused milk-tea discovery product. This repository contains two independently deployed React applications: the public discovery experience and the internal operations portal.

## Architecture

Both browser applications communicate with Supabase. PostgreSQL and PostGIS hold canonical product data; Supabase Auth and Row Level Security control access. Cloudflare R2 stores WeMilktea-owned or permitted images. Secret-bearing integrations, including Google Places discovery and enrichment, run only in a server-side boundary such as Supabase Edge Functions.

See [the architecture document](docs/ARCHITECTURE.md) for responsibilities and data ownership.

## Stack

- Bun workspaces, React, TypeScript, Vite, React Router
- Tailwind CSS and shadcn/ui
- Zod
- Supabase: PostgreSQL, PostGIS, Auth, RLS
- Cloudflare Workers Static Assets and Cloudflare R2
- Google Places API for discovery and enrichment

## Repository structure

```text
apps/
  web/          Public WeMilktea application
  admin/        Internal WeMilktea Admin application
packages/
  domain/       Shared domain contracts
  validation/   Shared Zod schemas
  config/       Browser-safe shared configuration types
docs/           Product, architecture, and decision records
supabase/
  migrations/   Ordered SQL schema changes
  functions/    Server-side integrations
  seed.sql      Local seed entry point
```

## Prerequisites

- [Bun](https://bun.sh) 1.2 or later
- Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/local-development) for local Supabase development
- A Supabase project and Cloudflare account for deployed environments

## Local setup

```sh
bun install
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
bun --filter @wemilktea/web dev
```

Run the Admin application separately with `bun --filter @wemilktea/admin dev`.

### Local development against production services

The ignored `apps/web/.env.local` and `apps/admin/.env.local` files may contain
browser-safe production Supabase/R2 values for local debugging. The Web app
runs at `http://localhost:5173` and the Admin app runs at
`http://localhost:5174`; both can run at the same time.

Equivalent root scripts are available:

```sh
bun run dev
bun run dev:web
bun run dev:admin
```

Local Web/Admin use the production backend when those production public values
are configured. Local Admin is therefore a real production write surface:
creating, editing, publishing, uploading, archiving, or deleting data from
localhost changes production. Do not run seed, migration, import, Pexels, or
assignment commands as part of frontend startup, and prefer read-only smoke
tests.

The current Admin login uses direct email/password sign-in and does not need a
localhost redirect for login, session restoration, or logout. If an email
confirmation or password-reset flow is introduced or tested locally, add the
exact `http://localhost:5174/` URL to the production Supabase Auth URL
configuration; do not add a wildcard. No production CORS change is required
for the current direct read/auth smoke tests. Do not broaden Edge Function or
R2 CORS to make local mutation flows work.

## Environment variables

The browser applications may use only the Supabase project URL and publishable/anon key. The public app may additionally use a browser-restricted Google Maps key for the Stores map. Copy the relevant application `.env.example` to `.env.local`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PUBLIC_SITE_URL=
VITE_GOOGLE_MAPS_BROWSER_KEY=
VITE_R2_PUBLIC_BASE_URL=
VITE_TURNSTILE_SITE_KEY=
```

`supabase/functions/.env.example` lists server-only values for local function development. Do not put Supabase service-role credentials, Google Places keys, or R2 credentials in a Vite environment file or commit their values.

`VITE_TURNSTILE_SITE_KEY` is the public Cloudflare Turnstile site key required
by the first-write Moments identity flow and Admin password login when Supabase
Auth CAPTCHA is enabled. The Turnstile secret is configured only in Supabase
Auth; see [Moments production readiness](docs/WM-115_MOMENTS_PRODUCTION_READINESS.md)
for the rollout order. See [Admin authentication](docs/ADMIN_AUTH.md) for the
first-admin procedure and database authorization model.

Google Places discovery is configured only for the server-side Edge Function. See [Google Places discovery](docs/GOOGLE_PLACES_DISCOVERY.md) for its local variables, deployment setup, API usage boundary, and required policy checks.

R2 image secrets are configured only for server-side Edge Functions and Cloudflare Worker bindings. The browser receives only `VITE_R2_PUBLIC_BASE_URL` plus a short-lived Moments upload capability; see [Image storage](docs/IMAGE_STORAGE.md) for the Admin bucket permissions and [WM-109 Moments image upload](docs/WM-109_MOMENTS_IMAGE_UPLOAD.md) for the bounded Worker quarantine path.

Product catalogue management is documented in [Product catalogue management](docs/PRODUCTS.md). It uses the existing canonical `products` and `location_products` model and the WM-24 image boundary.

The public Drinks discovery page is documented in [Public Drinks](docs/DRINKS.md). It reads published products and available public location relationships only.

The public Drink Detail route is documented in [Public Drink Detail](docs/DRINK_DETAIL.md). It resolves brand-scoped products and shows only currently available published locations with location-specific prices.

The Picker Result route is documented in [Picker Result](docs/PICKER_RESULT.md). It revalidates the selected published drink/store relationship on refresh and never rerolls or substitutes a stale recommendation.

The public Maps key is optional for local development and must be restricted by HTTP referrer and enabled APIs in Google Cloud. It is safe to expose to the browser only under those restrictions; never put the server-only Places key in a Vite environment file. See [Design references](docs/DESIGN.md).

Set `VITE_PUBLIC_SITE_URL` to the final public HTTPS origin before deploying the public app. It drives canonical URLs, social metadata, `robots.txt` and the build-time sitemap. See [SEO baseline](docs/SEO.md). The Admin app has a separate noindex configuration and must not reuse the public origin.

## Commands

```sh
bun run dev
bun run dev:web
bun run dev:admin
bun run format
bun run format:check
bun run lint
bun run test
bun run typecheck
bun run build
```

## Supabase local development

After installing the Supabase CLI, start the local stack and apply migrations:

```sh
supabase start
supabase db reset
```

Create schema changes with `supabase migration new <name>`. Commit the generated SQL in `supabase/migrations/`; never apply an untracked production schema change manually.

## Deployment

Cloudflare Workers Static Assets deploys each app independently from this
repository. The workspace-safe configuration uses repository root `/`,
`bun --filter @wemilktea/web build` with `apps/web/dist`, and
`bun --filter @wemilktea/admin build` with `apps/admin/dist`. A Worker rooted at
an individual app may instead use `bun run build` and `dist` if the build image
resolves the Bun workspace correctly. Both Wrangler configurations use
`not_found_handling: "single-page-application"` so direct client-side routes
resolve to the application shell. Follow the
[production deployment runbook](docs/DEPLOYMENT.md) and [release checklist](docs/RELEASE_CHECKLIST.md)
for migrations, secrets, integrations, smoke testing and rollback.

Supabase owns database migrations, Auth, RLS, and server-side functions. Cloudflare R2 owns image objects; database rows store object keys and metadata only. Configure production secrets in Supabase Edge Function secrets or another approved server-side boundary.

## Further reading

- [Product definition](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE.md)
- [Admin authentication](docs/ADMIN_AUTH.md)
- [Google Places discovery](docs/GOOGLE_PLACES_DISCOVERY.md)
- [Candidate review](docs/CANDIDATE_REVIEW.md)
- [Store management](docs/STORE_MANAGEMENT.md)
- [Public Stores experience](docs/STORES.md)
- [Public Store Detail](docs/STORE_DETAIL.md)
- [Store submissions](docs/STORE_SUBMISSIONS.md)
- [Image storage](docs/IMAGE_STORAGE.md)
- [Product catalogue management](docs/PRODUCTS.md)
- [Public Drinks](docs/DRINKS.md)
- [Public Drink Detail](docs/DRINK_DETAIL.md)
- [Public Search](docs/SEARCH.md)
- [Public Home](docs/HOME.md)
- [Daily Milk Tea Picker](docs/PICKER.md)
- [SEO baseline](docs/SEO.md)
- [Picker Result](docs/PICKER_RESULT.md)
- [Design references](docs/DESIGN.md)
- [Engineering decisions](docs/DECISIONS.md)
- [Repository instructions](AGENTS.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
