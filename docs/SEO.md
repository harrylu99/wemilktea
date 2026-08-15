# WeMilktea SEO baseline

The public Vite app owns its SEO metadata through `apps/web/src/seo.tsx` and
`apps/web/src/seo-utils.ts`. Each public route supplies its own title,
description, canonical path and indexability. Published store and drink detail
routes also emit JSON-LD from canonical Supabase data only.

## Public origin

Set `VITE_PUBLIC_SITE_URL` in the public Cloudflare Workers project to the final
HTTPS origin, for example `https://www.example.com` once the production domain
is approved. The value is browser-visible and is used for canonical URLs,
Open Graph URLs, the sitemap and `robots.txt`. Without it, local builds use
`http://localhost:5173`; do not ship that fallback to production.

## Crawl controls

The public Vite build generates `robots.txt` and `sitemap.xml` in `dist`.
Sitemap entries include the core public routes plus only rows returned by the
public Supabase boundary for published locations and published products.
Search/filter query variants and picker results are canonicalized to their
base route and marked `noindex, follow`.

The Admin app has three layers of exclusion:

- `apps/admin/index.html` and `AdminSeo` emit `noindex, nofollow, noarchive,
nosnippet`.
- `apps/admin/public/robots.txt` disallows all crawling.
- `apps/admin/public/_headers` configures Cloudflare Workers Static Assets to return the same
  policy as `X-Robots-Tag`.

The Admin and public sitemap/configuration are independent; no Admin route is
ever emitted into the public sitemap.

## SPA limitation

This repository remains a Vite/React SPA. Static HTML contains useful public
fallback metadata, while route-specific metadata is applied after the app
loads. Dynamic detail metadata is therefore strongest for crawlers that execute
JavaScript. A future SSR/prerendering decision can improve this without
changing the canonical data or publication boundary established here.
