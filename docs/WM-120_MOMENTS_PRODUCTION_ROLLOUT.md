# WM-120 — Moments production rollout pre-flight

Status: Phase A pre-flight and release wiring only
Jira: WM-120
Parent: WM-117 — V1.5 — Customer Feedback & Iteration Upgrades
Reviewed base: `8677118fcc954e15cc5bf7ccfbb794da4a9e3552`
Production Supabase project ref: `tqdxmotcpogyvzdvgopi`

## Purpose and authorization boundary

The Public Web `list_public_community_posts` RPC and Admin Moments reporting
requests returned 404 in production. The tracked repository implementation
contains the corresponding Moments schema, RPCs, Edge Function, and verifier,
so WM-120 prepares the release path and records the evidence required for a
separate production rollout decision.

This document and its PR are **not** production authorization. Phase A may
inspect production state read-only and use migration dry-run commands. It must
not apply migrations, deploy an Edge Function or Worker, change Supabase Auth,
change Turnstile or production secrets, mutate R2 or production data, merge the
PR, or mark it Ready without team-lead authorization.

## Pre-flight evidence

The repository uses Supabase CLI `2.113.0`, matching the production workflow.
The required environment variable names are:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

Their values must be provided through a secure operator environment and must
never be recorded here or in command output.

### Current execution result

The Phase A pre-flight was attempted from the clean checkout at the reviewed
base. The following facts were observed:

- `supabase --version`: `2.113.0` — PASS.
- Docker: unavailable; the `docker` command is not installed.
- Podman: unavailable; the `podman` command is not installed.
- `SUPABASE_ACCESS_TOKEN`: absent in the execution environment.
- `SUPABASE_DB_PASSWORD`: absent in the execution environment.
- Local `supabase start`: BLOCKED by missing Docker/Podman.
- Local Moments SQL workflows: NOT RUN because the local database could not be started.
- `supabase db lint --local --schema public --fail-on error`: NOT RUN for the same reason.
- `supabase migration list`: BLOCKED in the CLI because no access token was supplied.
- `supabase db push --linked --dry-run`: NOT RUN because the production project could not be linked without credentials.
- Direct production mutations by this Phase A execution: NONE.

Separate connected-management/API inspection performed read-only by the team
lead confirmed the production diagnosis:

- production migration history ends at
  `20260829131842_wm106_preserve_combined_public_search_semantics`;
- `community_posts`, `community_post_reports`,
  `list_public_community_posts`, `moderate_community_post`, and
  `resolve_community_post_report` are absent;
- `community-image-storage` is not present in the production Edge Function
  list.

This confirms the Moments rollout gap. It does not replace the CLI migration
history and `db push --linked --dry-run` gates, which remain unexecuted here.
The migration delta below is the expected candidate delta after that observed
production head, not a live CLI dry-run result. A production operator must
refresh it immediately before any later rollout authorization.

Expected candidate delta if production remains at
`20260829131842_wm106_preserve_combined_public_search_semantics`:

1. `20260830100000_wm107_moments_foundation.sql`
2. `20260831071232_wm109_moments_image_upload.sql`
3. `20260831090000_wm110_moments_product_brand_route.sql`
4. `20260901070547_wm116_fix_showcase_rpc_lint.sql`
5. `20260902023808_wm115_moments_write_limits.sql`

Do not apply or repair this expected list without fresh `migration list` and
`db push --linked --dry-run` evidence. Any unexpected migration, destructive
operation, history drift, or ordering mismatch is a NO-GO and must be reported
to the team lead.

## Tracked backend contract

The chronological migration order is authoritative:

1. `20260830100000_wm107_moments_foundation.sql`
   - `community_posts`
   - `community_post_likes`
   - `community_post_must_tries`
   - `community_post_reports`
   - Moments RLS, public feed and owner/admin RPCs
2. `20260831071232_wm109_moments_image_upload.sql`
   - server-only `finalize_community_post_image` RPC
3. `20260831090000_wm110_moments_product_brand_route.sql`
   - public feed product/brand routing and `product_brand_slug`
4. `20260901070547_wm116_fix_showcase_rpc_lint.sql`
   - existing showcase RPC lint correction
5. `20260902023808_wm115_moments_write_limits.sql`
   - private upload accounting and Moments draft/upload limits

The Public Web calls `list_public_community_posts` with the keyset cursor
contract. The Admin report count intentionally uses a count-only Supabase
query (`head: true`) against `community_post_reports`; neither request should
be replaced with a frontend fallback or a hard-coded zero.

## Required runtime components and configuration names

The reviewed production path requires the following components and names:

- Supabase Edge Function: `community-image-storage`
- Cloudflare Worker: `moments-image-verifier`
- Worker configuration and bindings: `MOMENTS_APP_ORIGIN`,
  `MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET`, `VERIFY_TOKEN`, `BUCKET`, and `IMAGES`
- Edge Function secrets/configuration: `MOMENTS_APP_ORIGIN`,
  `MOMENTS_IMAGE_UPLOAD_URL`, `MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET`,
  `MOMENTS_IMAGE_VERIFIER_URL`, `MOMENTS_IMAGE_VERIFIER_TOKEN`,
  `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`
- Browser-safe Turnstile sitekey: `VITE_TURNSTILE_SITE_KEY` in Web and Admin
- Supabase Auth Turnstile secret/configuration: operator-managed only

No value for any secret, token, password, sitekey, R2 credential, or service
role is stored in this document.

The verifier Wrangler configuration currently contains
`MOMENTS_APP_ORIGIN: configure-at-deploy` and
`bucket_name: configure-at-deploy`. These placeholders are an explicit
production NO-GO. Before any authorized Worker deployment, replace or
override them with approved production values and configure the Worker-only
`VERIFY_TOKEN` plus the shared `MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET`. The
`IMAGES` and `BUCKET` bindings must resolve to the approved production
resources.

## Release wiring in this Phase A PR

The reviewed `.github/workflows/supabase-functions-deploy.yml` now includes
`community-image-storage` after the existing `image-storage` step. The workflow
still:

- runs only for `main` pushes or guarded manual dispatch;
- uses the `production` Environment;
- targets `tqdxmotcpogyvzdvgopi` through `SUPABASE_PROJECT_REF`;
- uses Supabase CLI `2.113.0`;
- grants only `contents: read`;
- uses `--use-api` and the explicit project ref;
- does not set secrets or run database migrations;
- does not deploy from pull-request branches;
- retains `cancel-in-progress: false`.

The deployment documentation now lists four production Edge Functions. This
Phase A PR does not modify any function source, migration, Worker source,
Auth setting, secret, binding, R2 object, or production environment.

## Cloudflare branch-build safety — resolved by WM-122

WM-122 confirmed that non-main Admin builds had been deploying to the
production `admin` Worker. It contained the issue by changing non-main Admin
builds to preview-only `wrangler versions upload` behavior and restoring
production Admin to the reviewed-main version
`bc8ce8fd-5eb4-49ac-a183-b0d833cfd704`. Web was independently verified as
already preview-only for non-main builds; its production remains the reviewed-
main version `ad695961-c5f7-43c3-af52-fd3a125fec6a`.

Cloudflare branch-build safety is therefore no longer blocking WM-120. This
Phase A work does not authorize further Cloudflare changes or deployments.

## Future production rollout order — not authorized in Phase A

The following is the operator plan for a later, separately authorized release:

1. Link a clean reviewed `main` checkout to project ref
   `tqdxmotcpogyvzdvgopi`.
2. Run `supabase migration list` and
   `supabase db push --linked --dry-run`; compare against the tracked
   chronological migration order above.
3. Confirm Web/Admin CAPTCHA-capable builds, the shared Invisible Turnstile
   widget, both allowed production hostnames, and the Auth-side secret.
4. Verify existing Admin sign-in and session restoration before migration.
5. Apply the approved missing migrations in chronological order.
6. Verify the tables, RPCs, PostgREST exposure, RLS, and public feed contract.
7. Deploy `community-image-storage` from reviewed merged `main`.
8. Deploy and verify `moments-image-verifier` with the required R2 bindings and
   server-only token.
9. Verify anonymous Auth and first-write CAPTCHA behavior without making
   anonymous browsing create an identity.
10. Run controlled Public Web and Admin smoke tests.
11. Record GO/NO-GO and recovery actions; only then mark WM-120 Done.

The mutating commands below are shown only to make the future runbook explicit.
They are **NOT AUTHORIZED IN PHASE A**:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy community-image-storage \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api
npx wrangler deploy --config workers/moments-image-verifier/wrangler.jsonc
```

## Future acceptance and smoke tests

These checks belong to the later authorized rollout, not this PR:

### Public Moments

- `POST /rest/v1/rpc/list_public_community_posts` no longer returns 404.
- Public Gallery loads active, non-deleted Moments.
- Anonymous browsing does not create an Auth identity.
- Keyset pagination remains newest-first without duplicate/missing boundary
  rows.
- Like, Must Try, Report, Share, upload, verification, and finalization work
  through their existing server-authorized paths.

### Admin Moments

- The unresolved report count request no longer returns 404.
- Reported, Recent, and Hidden tabs load.
- `moderate_community_post` and `resolve_community_post_report` remain
  server-authorized.
- Admin authorization remains separated from public/anonymous identities.

### Security and image pipeline

- Only active, non-deleted Moments are public.
- No service-role, R2, verifier, Turnstile secret, or database credential is
  exposed to browser code.
- `community-image-storage` and `moments-image-verifier` use the reviewed
  quarantine/final-object boundary.
- Failed verification does not activate a Moment.

### Recovery

- If migration pre-flight drifts, stop without migration repair or ad-hoc DDL.
- If function deployment fails, keep the reviewed `main` source and rerun only
  the approved workflow for the trusted commit after the Environment gate is
  available.
- If the Moments rollout is unsafe, disable the affected public write/release
  path through an explicitly approved configuration change; do not hide 404s in
  frontend code or change RLS to make them disappear.
- Do not perform destructive rollback without explicit authorization.

## Phase A result

This document and the accompanying workflow/documentation changes prepare the
release path. They do not prove that production is rolled out: local database
validation and live production CLI dry-run evidence remain blocked in the
current environment. Direct production mutations by this Phase A execution
were NONE. WM-122 branch-build safety is contained and is no longer a WM-120
release NO-GO; the Moments production migration and function rollout remain
unexecuted and require separate authorization.
