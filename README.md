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
  public/       Public WeMilktea application
  admin/        Internal WeMilktea Admin application
docs/           Product, architecture, and decision records
supabase/
  migrations/   Ordered SQL schema changes
```

## Prerequisites

- [Bun](https://bun.sh) 1.2 or later
- Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/local-development) for local Supabase development
- A Supabase project and Cloudflare account for deployed environments

## Local setup

```sh
bun install
cp apps/public/.env.example apps/public/.env.local
cp apps/admin/.env.example apps/admin/.env.local
bun run dev:public
```

Run the admin application separately with `bun run dev:admin`.

## Environment variables

The browser applications may use only the Supabase project URL and publishable/anon key:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do not put Supabase service-role credentials, Google Places keys, or R2 credentials in a Vite environment file. Configure those only in the selected server-side integration environment.

## Commands

```sh
bun run dev:public
bun run dev:admin
bun run lint
bun run test
bun run typecheck
bun run build
```

## Supabase local development

After installing the Supabase CLI, initialise or link the project, start the local stack, and apply migrations:

```sh
supabase init
supabase start
supabase db reset
```

Create schema changes with `supabase migration new <name>`. Commit the generated SQL in `supabase/migrations/`; never apply an untracked production schema change manually.

## Deployment

Cloudflare Pages deploys each app independently from this repository. Configure each Pages project with its corresponding app directory and build command (`bun run build` from that app, or the equivalent workspace command) and publish `dist`.

Supabase owns database migrations, Auth, RLS, and server-side functions. Cloudflare R2 owns image objects; database rows store object keys and metadata only. Configure production secrets in Supabase Edge Function secrets or another approved server-side boundary.

## Further reading

- [Product definition](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Engineering decisions](docs/DECISIONS.md)
- [Repository instructions](AGENTS.md)
