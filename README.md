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
- Cloudflare Pages and Cloudflare R2
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
bun run dev
```

Run the admin application separately with `bun run dev:admin`.

## Environment variables

The browser applications may use only the Supabase project URL and publishable/anon key. Copy the relevant application `.env.example` to `.env.local`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`supabase/functions/.env.example` lists server-only values for local function development. Do not put Supabase service-role credentials, Google Places keys, or R2 credentials in a Vite environment file or commit their values.

The admin browser flow needs no additional environment variables. See [Admin authentication](docs/ADMIN_AUTH.md) for the Supabase Auth configuration, first-admin procedure, and database authorization model.

Google Places discovery is configured only for the server-side Edge Function. See [Google Places discovery](docs/GOOGLE_PLACES_DISCOVERY.md) for its local variables, deployment setup, API usage boundary, and required policy checks.

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

Cloudflare Pages deploys each app independently from this repository. Configure the public project with root directory `apps/web`, and the admin project with root directory `apps/admin`. For each, use `bun run build` and publish `dist`. The admin app ships `public/_redirects` so direct protected URLs resolve to the client-side route guard.

Supabase owns database migrations, Auth, RLS, and server-side functions. Cloudflare R2 owns image objects; database rows store object keys and metadata only. Configure production secrets in Supabase Edge Function secrets or another approved server-side boundary.

## Further reading

- [Product definition](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE.md)
- [Admin authentication](docs/ADMIN_AUTH.md)
- [Google Places discovery](docs/GOOGLE_PLACES_DISCOVERY.md)
- [Candidate review](docs/CANDIDATE_REVIEW.md)
- [Store management](docs/STORE_MANAGEMENT.md)
- [Engineering decisions](docs/DECISIONS.md)
- [Repository instructions](AGENTS.md)
