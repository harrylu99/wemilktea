# Image storage

WeMilktea stores owned or explicitly permitted image binaries in Cloudflare R2 and keeps only image metadata and relationships in Supabase. The current integration covers canonical store/location images and is intentionally reusable for product images later.

## Boundary

```text
Admin browser
  -> authenticated image-storage Edge Function
  -> short-lived presigned R2 PUT URL
  -> browser uploads bytes directly to R2
  -> Edge Function verifies the object and attaches metadata through an admin RPC
```

R2 credentials are server-only. The browser receives a URL scoped to one generated object key and one content type; it never receives an access key, secret, bucket listing capability, or arbitrary delete capability. Cloudflare documents this S3-compatible presigned URL pattern in [its R2 guide](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## Configuration

Set these as Supabase Edge Function secrets (never in `apps/*/.env.local`):

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BASE_URL
```

The R2 token should be limited to the image bucket and object operations required by the function. `R2_PUBLIC_BASE_URL` is the configured public read endpoint, such as a development `r2.dev` URL or a future `https://images.wemilktea.nz` custom domain.

The browser may use only:

```text
VITE_R2_PUBLIC_BASE_URL
```

This is a public URL, not a credential. It should match the configured public base URL. The Admin app also needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to invoke the authenticated function.

## Object keys and validation

Store images use generated keys in this form:

```text
stores/{location-id}/{uuid}.{jpg|png|webp}
```

Product images reuse the same function and policy under:

```text
products/{product-id}/{uuid}.{jpg|png|webp}
```

Temporary showcase images use a separate operator-only namespace:

```text
showcase/{provider}/{external-photo-id}.{jpg|jpeg|png|webp}
```

Showcase binaries are stored in R2 once and linked through the reusable
`showcase_image_pool` and `product_images` relationships. They are never
created through the browser upload flow.

The original filename is never authoritative. V1 accepts JPEG, PNG, and WebP images up to 10 MiB. The server validates the UUID-scoped key, MIME type, object size, and optional dimensions before writing metadata. The same policy is exported to browser-safe configuration for early UX validation.

## Metadata and provenance

`image_assets` stores `storage_key`, provenance, alt text, content type, byte size, and optional dimensions. `location_images` links the metadata to a canonical location and marks the primary image. The database relationship is authoritative; public code never lists the bucket.

R2 uploads from the Admin workflow use `wemilktea` provenance. Temporary
operator-imported showcase images use `stock` provenance and retain provider,
external photo, source URL, and attribution metadata. `merchant` and `user`
remain valid metadata values for future permitted workflows. Google imagery is
not copied to R2 and the existing `google` provenance constraint cannot claim
an R2 key.

## Replacement and removal

Replacement uploads the new object first, verifies it, and atomically replaces the primary metadata relationship. Only after the database operation succeeds does the function attempt to delete the old object. Removal deletes the metadata relationship and then attempts object cleanup for unshared product/location assets. Shared showcase assets remain protected by their pool relationship. A cleanup warning is returned/logged if R2 is temporarily unavailable; the working canonical reference is not deleted early.

There is no distributed transaction between R2 and PostgreSQL. The trusted workflow is designed to minimize orphans, but operators should treat cleanup warnings as follow-up work.

## Public reads and fallback

Anonymous users can read image metadata only through published canonical content under the existing RLS policies. Draft location images remain private. `/stores` and `/stores/:slug` build a URL from the configured public base URL and validated storage key. Missing, unavailable, or broken images retain the existing visual fallback.

## CORS and local setup

Configure the R2 bucket CORS policy for the exact Admin origins used by development and deployment (for example `http://127.0.0.1:5174` and the production Admin Worker origin), allowing the presigned `PUT` request with `Content-Type`. Keep origins and headers narrow; do not use an unrestricted wildcard in production. See [Cloudflare's R2 CORS guide](https://developers.cloudflare.com/r2/buckets/cors/).

For local function development, copy `supabase/functions/.env.example` to the local Supabase function environment and provide development R2 values. If no development credentials are available, the application still builds and renders its fallback, but live upload/read/replace/remove verification is not complete.

The future production custom image domain and CDN policy are deployment work, not part of WM-24.
