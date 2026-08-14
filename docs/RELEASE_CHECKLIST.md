# WeMilktea V1 release checklist

Use this checklist with [Production deployment](DEPLOYMENT.md). Check items
only when evidence is recorded in the release ticket.

## Preflight

- [ ] Commit SHA and branch are recorded.
- [ ] Supabase project ref/environment is confirmed.
- [ ] Public and Admin production origins are confirmed.
- [ ] Cloudflare Pages project names are confirmed.
- [ ] R2 bucket/public base URL and CORS origins are confirmed.
- [ ] Google Maps browser-key restrictions are confirmed.
- [ ] Google Places server-key restrictions are confirmed.
- [ ] Auth site URL and allowed redirects are confirmed.
- [ ] No production secret is present in the repository, diff, docs or frontend output.

## Local regression

- [ ] `supabase db reset --yes`
- [ ] `bun test`
- [ ] `bun run e2e`
- [ ] `bun run e2e -- e2e/accessibility.playwright.ts`
- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run build`
- [ ] `bun run format:check`
- [ ] `git diff --check`
- [ ] `supabase db lint --local --schema public --fail-on error`
- [ ] `supabase db advisors --local` reviewed; existing accepted warnings are recorded.

## Supabase Cloud

- [ ] Target project is linked and migration history inspected.
- [ ] Reviewed migrations applied with `supabase db push`.
- [ ] PostGIS/extensions, indexes and RLS are present.
- [ ] Production seed/bootstrap data is explicitly approved; local fixtures were not copied blindly.
- [ ] Anonymous public reads expose only published catalogue data.
- [ ] Candidates, discovery runs, moderation data and drafts are not publicly readable.
- [ ] Admin Auth Site URL and exact redirect URLs are configured.
- [ ] First admin exists and is present in `public.admin_users`.

## Edge Functions

- [ ] `store-discovery` deployed if enabled for launch.
- [ ] `candidate-google-detail` deployed if enabled for launch.
- [ ] `image-storage` deployed if R2-backed uploads are part of launch.
- [ ] Function secrets are configured server-side by name, never in Pages variables.
- [ ] Function logs show no secret values or raw provider payloads.
- [ ] Exact Admin origin is enforced; wildcard CORS is not used.

## R2

- [ ] Bucket-scoped token is configured.
- [ ] Narrow CORS policy includes the deployed Admin origin.
- [ ] Admin upload authorization rejects anonymous/non-admin users.
- [ ] Valid test image uploads and metadata persists.
- [ ] Public image URL resolves from canonical metadata.
- [ ] Replacement and removal were tested or explicitly deferred.
- [ ] Broken/missing objects retain the UI fallback.
- [ ] No Google image was copied to R2.

## Maps and Places

- [ ] Maps browser key is restricted to the deployed public origin and required APIs.
- [ ] `/stores` map renders canonical coordinates.
- [ ] `/stores/:slug` map renders canonical coordinates.
- [ ] Maps failure leaves list/address/directions usable.
- [ ] Browser requests do not call Google Places for catalogue content.
- [ ] Places key is server-only and key restrictions/quotas are reviewed.
- [ ] Controlled discovery test passed, or discovery is explicitly disabled for launch.

## Cloudflare Pages

- [ ] Public project deploy succeeded.
- [ ] Admin project deploy succeeded.
- [ ] Production browser variables are configured by name and environment.
- [ ] Direct reload works for `/`, `/explore`, `/stores`, `/stores/:slug`, `/drinks`, `/drinks/:brandSlug/:productSlug`, `/picker` and Picker Result.
- [ ] Admin direct protected-route navigation and refresh work.
- [ ] No localhost, dev endpoints, service-role keys or R2 secrets appear in bundles/network.
- [ ] Console has no unexplained critical errors.

## Production smoke

- [ ] Home → Explore → Drinks → Drink Detail → Store Detail.
- [ ] Home → Stores → Store Detail → Directions.
- [ ] Home → Picker → Picker Result → View drink / View store / Pick again.
- [ ] Picker Result direct URL, new tab and refresh behave deterministically.
- [ ] Unsupported Picker cravings show the documented no-match state.
- [ ] Stores → Suggest Store validation and approved test submission.
- [ ] Admin login, session restore, protected routes and logout.
- [ ] Admin Stores, Products and Submissions are usable.
- [ ] Discovery/image workflows were tested if enabled for release.

## Accessibility and device smoke

- [ ] Deployed safe Playwright responsive suite passed or exclusions are recorded.
- [ ] Deployed accessibility suite passed or exclusions are recorded.
- [ ] Focused iPhone Safari smoke completed.
- [ ] VoiceOver or equivalent smoke completed; no certification claim is made.
- [ ] No horizontal overflow at approximately 390px, 768px and 1440px.

## Picker catalogue readiness

- [ ] Matcha: `READY` / `NO MATCH BY CURRENT CATALOGUE` recorded.
- [ ] Milk Tea: `READY` / `NO MATCH BY CURRENT CATALOGUE` recorded.
- [ ] Fruit Tea: `READY` / `NO MATCH BY CURRENT CATALOGUE` recorded.
- [ ] Creamy: `READY` / `NO MATCH BY CURRENT CATALOGUE` recorded.
- [ ] Refreshing: `READY` / `NO MATCH BY CURRENT CATALOGUE` recorded.
- [ ] Surprise Me: `READY` / `NO MATCH BY CURRENT CATALOGUE` recorded.

## Rollback and decision

- [ ] Prior Pages deployments identified.
- [ ] Prior Edge Function revisions identified.
- [ ] Configuration restore path documented.
- [ ] Database corrective-migration strategy documented; no unsafe rollback assumed.
- [ ] Known bundle warnings and other accepted risks are recorded.
- [ ] Final decision is explicitly `GO` or `NO-GO`.
