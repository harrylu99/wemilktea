# WM-109 — Moments image upload

The production path is deliberately separate from the Admin
`image-storage` function:

```text
browser normalization
  -> owner-scoped Edge Function authorization
  -> R2 quarantine/{upload-id}.webp
  -> Cloudflare Images info() + WebP metadata verification
  -> R2 final object
  -> service-role-only transaction: image_assets + draft -> active
```

## Browser

`apps/web/src/moments-image-normalization.ts` accepts JPEG, PNG, and WebP
bytes, performs a bounded header preflight, decodes with
`createImageBitmap(..., { imageOrientation: "from-image" })`, renders pixels to
canvas, and encodes exactly `image/webp` at quality `0.85`. It limits source
input to 10 MiB, 8,000px per dimension and 40 megapixels, then caps the output
long edge at 2,048px. Re-encoding pixels does not copy source EXIF/GPS/XMP.

`apps/web/src/moments-image-upload.ts` uploads only the returned normalized
file. It does not trust the source filename, MIME declaration, or client image
dimensions.

## Server and R2

`community-image-storage` verifies the Supabase user JWT and only authorizes a
draft owned by that user. The server derives
`community/{user-id}/{post-id}/quarantine/{upload-id}.webp`; the browser never
chooses an object key. The URL is valid for 10 minutes and only signs
`Content-Type: image/webp`.

The verifier Worker independently checks the exact R2 object ETag, byte size,
WebP RIFF/chunk structure, forbidden metadata chunks, Cloudflare Images
`info()` decode result, dimensions, and final 2,048px long-edge limit. It then
promotes the exact bytes to `community/{user-id}/{post-id}/{upload-id}.webp`
and refuses to overwrite an existing final key. The Edge Function passes the
observed final metadata to the service-role-only
`finalize_community_post_image` RPC, which atomically inserts the owned
`image_assets` row, attaches it to the owned draft, and activates the Moment.

## Configuration

The verifier Worker requires an R2 binding named `BUCKET`, an Images binding
named `IMAGES`, and a secret named `VERIFY_TOKEN`. Replace the deployment-only
placeholder bucket name in `workers/moments-image-verifier/wrangler.jsonc` and
set the secret with Wrangler. The Supabase function requires:

```text
SUPABASE_SERVICE_ROLE_KEY
MOMENTS_APP_ORIGIN
MOMENTS_IMAGE_VERIFIER_URL
MOMENTS_IMAGE_VERIFIER_TOKEN
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

No production settings, secrets, Worker, database, or R2 objects are changed
by this repository task. Production anonymous Auth remains a separate manual
rollout decision.

## Cleanup and failure behavior

Verification failures delete the known quarantine key. A successful finalization
deletes the quarantine source after the database transaction succeeds. If the
database call fails, the function checks for a concurrent successful reference
before deleting the promoted object; otherwise both temporary objects are
cleaned up. R2 lifecycle rules should expire `community/*/quarantine/*` after a
short retention period to cover abandoned uploads. Owner delete remains the
existing soft delete for moderation/audit; hidden or removed Moments retain a
referenced final object until a later retention policy explicitly permits
deletion.

The Worker is not deployed by this task, and its live Images binding behavior
must be validated in the configured non-production Cloudflare environment
before production rollout.
