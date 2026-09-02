# WM-115 — Moments production readiness

This document records the WM-115 release audit and the narrow hardening work
authorized by the team lead. It is a release gate, not a production deployment
record.

## Decision summary

Supabase anonymous Auth CAPTCHA protection is required before public Moments
writes are enabled in production. The Web and Admin applications now obtain an
invisible Cloudflare Turnstile token and pass it to the relevant Supabase Auth
call. A missing, expired, failed, or misconfigured challenge fails closed.

One-time CAPTCHA is not sufficient by itself: one authenticated anonymous
identity could otherwise create unlimited durable drafts and upload
capabilities. WM-115 therefore adds explicit Moments-only server-side limits:

- draft creation: 4 in a rolling hour and 12 in a rolling 24 hours per identity;
- open drafts: at most 3 non-deleted drafts per identity;
- stale empty drafts: owner-scoped hard-delete when older than 24 hours during a
  new draft attempt;
- upload authorizations: 6 in a rolling hour, 12 in a rolling 24 hours, and 3
  per post;
- upload-accounting retention: 24 hours, cleaned opportunistically;
- no new limits for Like, Must Try, or Report in this ticket;
- no scheduler, queue, Redis, KV, Durable Object, or generalized abuse service.

The thresholds are deliberately explicit in the migration and are not
environment-configurable for V1.4.

## Implemented changes

### CAPTCHA

`packages/turnstile/src/index.ts` is a small dependency-free wrapper around
the official Turnstile browser API. It loads the explicit-render script,
creates an invisible widget, returns one token, and removes the widget after
success or failure.

`apps/web/src/moments/identity.ts` preserves lazy identity creation:

- read-only Moments browsing never loads Turnstile and never creates a session;
- an existing session is reused without another challenge;
- a new anonymous session is created only after a token is obtained;
- `captchaToken` is passed to `signInAnonymously`;
- failure to obtain a usable token prevents Auth sign-in and the write.

`apps/admin/src/auth-login.ts` applies the same fail-closed token gate to
`signInWithPassword`. Session restoration, `admin_users`, `is_admin()`, route
protection, logout, and Admin authorization are unchanged.

The public site key is configured with `VITE_TURNSTILE_SITE_KEY` in each
browser app. The Turnstile secret is never a browser variable, repository
value, database value, or response field; it is configured only in Supabase
Auth by an operator.

### Server-side write limits

`supabase/migrations/20260902023808_wm115_moments_write_limits.sql`:

- creates the non-API `private` schema and
  `private.community_post_upload_authorizations`;
- replaces the existing draft RPC with the same public signature and adds
  owner-scoped cleanup and draft quotas;
- adds `consume_community_image_upload_authorization(uuid)`;
- serializes each identity's quota checks with a PostgreSQL advisory
  transaction lock;
- grants only the authenticated role the two intended RPC entry points and
  gives browser roles no access to the private accounting table/schema.

The draft quota counts every post row created in the time window, including
rows later activated, hidden, removed, or soft-deleted. This prevents status or
delete changes from bypassing the creation limit. Opportunistic cleanup only
removes the current owner's old, empty, unsubmitted draft rows; it never
removes image-bearing or submitted content.

`community-image-storage` consumes the upload authorization quota before it
generates an upload ID or signed Worker capability. A rejected quota check
therefore produces no usable token and no quarantine key. The existing
quarantine, verification, promotion, finalization, ownership, and R2 cleanup
boundaries remain in place.

## Existing controls audited

The audit covered the Moments Web callers, identity helper, Share composer,
normalization and upload helpers, the community image Edge Function, the
Cloudflare verifier Worker, upload-token signing and key derivation, WM-107 and
WM-109 SQL/RPCs, RLS grants, Admin authentication, existing Admin image
storage, and repository secret references.

Verified controls retained by this change:

- anonymous identity is not created for reads, Gallery, Sip Mode, Skip, or
  opening Share;
- owner checks protect draft creation, deletion, image authorization, and
  finalization;
- `is_admin()` remains the Admin boundary;
- community tables and functions do not grant anonymous mutation access;
- unique Like/Must Try/report constraints remain unchanged;
- only active, non-deleted Moments are exposed by the public feed;
- normalized images remain bounded WebP objects with decoder, dimension,
  metadata, ETag, and key-namespace verification;
- quarantine is promoted before database activation and is not a public final
  object;
- service-role and R2 credentials remain server-only;
- the existing Admin Product/Store image-storage function was not changed.

The original WM-107, WM-109, WM-110, WM-111, and WM-114 migrations were not
edited.

## Production rollout gate

No production configuration or data was changed by WM-115. Before enabling
anonymous Moments writes, an operator must complete this order:

1. Deploy CAPTCHA-capable Web and Admin builds with the real public
   `VITE_TURNSTILE_SITE_KEY`.
2. Configure the Turnstile widget and allowed production hostnames.
3. Configure the Turnstile secret in Supabase Auth CAPTCHA protection.
4. Verify existing Admin email/password sign-in, including a fresh login and
   session restoration.
5. Apply the tracked database migration through the normal migration workflow.
6. Deploy the community image Edge Function and verifier Worker through the
   approved non-production-to-production workflow.
7. Enable anonymous sign-ins only after the CAPTCHA-capable clients and Auth
   CAPTCHA setting are verified.
8. Smoke-test that browsing and pagination do not create identity or challenge;
   the first Like/Share/Must Try/Report write obtains Turnstile, creates the
   anonymous identity with `captchaToken`, and succeeds.
9. Verify subsequent writes reuse the session without another CAPTCHA and that
   the draft/upload quotas reject over-limit direct API/RPC calls.
10. Verify the existing R2 `community-quarantine/` lifecycle backstop remains
    approximately one day and does not match final `community/` objects.

Required names only; values must remain outside the repository:

- `VITE_TURNSTILE_SITE_KEY` in Web and Admin;
- Supabase Auth Turnstile secret/configuration;
- `MOMENTS_APP_ORIGIN`;
- `MOMENTS_IMAGE_UPLOAD_URL`;
- `MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET`;
- `MOMENTS_IMAGE_VERIFIER_URL`;
- `MOMENTS_IMAGE_VERIFIER_TOKEN`;
- `R2_ACCOUNT_ID`;
- `R2_ACCESS_KEY_ID`;
- `R2_SECRET_ACCESS_KEY`;
- `R2_BUCKET`;
- Worker `BUCKET`, `IMAGES`, and `VERIFY_TOKEN` bindings/secrets.

## Residual risks and intentionally deferred work

V1.4 accepts continued long-term use by an authenticated anonymous identity at
the approved bounded rate. Like, Must Try, and Report keep their existing
uniqueness and ownership controls and receive no new arbitrary thresholds.

Empty drafts are cleaned only when that owner attempts another draft. The R2
lifecycle remains the abandoned-quarantine backstop. There is no scheduled
cleanup service.

Finalized images attached to owner-deleted or Admin-removed Moments remain
available for moderation/audit under the existing behavior. No irreversible
final-image retention policy is introduced here.

This ticket does not add a profile/login UX, AI moderation, reputation, real-
time features, notifications, or broad UI redesign. Gallery, Share UI,
Sip Mode, and Admin moderation UI remain outside WM-115’s implementation scope
and are already represented by their separate tickets.

## References

- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Cloudflare Turnstile client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
