# WM-109 — Moments image upload

The production path is deliberately separate from the Admin
`image-storage` function:

```text
browser normalization
  -> owner-scoped Edge Function authorization
  -> signed capability to bounded Cloudflare Worker upload
  -> R2 community-quarantine/{owner}/{post}/{upload}.webp
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

When the selected canvas cannot encode an actual `image/webp`, the browser uses
a capability-detected server-normalization fallback instead of user-agent
sniffing. It keeps the header-verified JPEG, PNG, or WebP source under its
actual detected content type for preview and upload; it does not relabel source
bytes as WebP. The fallback decoder only validates browser decode availability,
so the Worker remains responsible for canonical orientation and output.

## Server and R2

`community-image-storage` verifies the Supabase user JWT and only authorizes a
draft owned by that user. The server derives
`community-quarantine/{user-id}/{post-id}/{upload-id}.webp` and returns a
10-minute HMAC upload capability; the browser never chooses an object key and
never receives a direct R2 write URL. The Cloudflare Worker reads the body
incrementally and rejects uploads over 10 MiB before writing to R2.

The verifier Worker independently checks the exact R2 object ETag, byte size,
WebP RIFF/chunk structure, forbidden metadata chunks, Cloudflare Images
`info()` decode result, dimensions, and final 2,048px long-edge limit. It then
promotes the exact bytes to `community/{user-id}/{post-id}/{upload-id}.webp`
and refuses to overwrite an existing final key. The Edge Function passes the
observed final metadata to the service-role-only
`finalize_community_post_image` RPC, which atomically inserts the owned
`image_assets` row, attaches it to the owned draft, and activates the Moment.

The upload capability binds both the detected source content type and whether
the browser or Worker normalizes it. Browser-normalized capabilities remain
strictly WebP. For the server fallback, the Worker bounds and decodes the
signed JPEG, PNG, or WebP request body, applies Cloudflare Images' EXIF
orientation during its 2,048px WebP transcode, validates the generated WebP,
and only then writes that generated WebP to the existing quarantine key. Raw
fallback bytes are never stored in R2, and the existing verifier repeats its
WebP, decode, ETag, and final-promotion checks. Already-issued v1 capabilities
remain restricted to the legacy browser-WebP path during their short lifetime.

## Configuration

The verifier Worker requires an R2 binding named `BUCKET`, an Images binding
named `IMAGES`, and a secret named `VERIFY_TOKEN`. Replace the deployment-only
placeholder bucket name in `workers/moments-image-verifier/wrangler.jsonc` and
set the secret with Wrangler. The Supabase function requires:

```text
SUPABASE_SERVICE_ROLE_KEY
MOMENTS_APP_ORIGIN
MOMENTS_IMAGE_UPLOAD_URL
MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET
MOMENTS_IMAGE_VERIFIER_URL
MOMENTS_IMAGE_VERIFIER_TOKEN
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

The Worker also requires `MOMENTS_APP_ORIGIN`, `BUCKET`, `IMAGES`,
`MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET`, and `VERIFY_TOKEN`. Before production
enablement, configure and verify the R2 lifecycle backstop with this installed
Wrangler syntax:

```bash
npx wrangler r2 bucket lifecycle add <BUCKET_NAME> \
  delete-community-quarantine community-quarantine/ --expire-days 1
npx wrangler r2 bucket lifecycle list <BUCKET_NAME>
```

The rule must match only `community-quarantine/`, never final `community/`
objects. No production settings, secrets, Worker, database, lifecycle rule, or
R2 objects are changed by this repository task. Production anonymous Auth
remains a separate manual rollout decision.

## Cleanup and failure behavior

Known terminal verification failures (for example, invalid image bytes,
dimensions, metadata, or a changed/missing source) delete the quarantine key.
Transient, ambiguous, and unknown verifier failures preserve it so the client
can retry; the one-day R2 lifecycle rule for `community-quarantine/` is the
backstop for uploads abandoned before retry/finalize. A successful finalization
deletes the quarantine source after the database transaction succeeds. If the
database call fails, the function checks for a concurrent successful reference
before deleting the promoted object; otherwise both temporary objects are
cleaned up. Owner delete remains the existing soft delete for moderation/audit;
hidden or removed Moments retain a referenced final object until a later
retention policy explicitly permits deletion.

The production Edge Function and verifier Worker are separate rollout steps;
the production Supabase deployment workflow intentionally does not deploy
`community-image-storage` automatically when this PR is merged. Configure and
deploy it only as part of the separately approved production rollout. For the
v2 upload capability, deploy the Worker (which accepts legacy v1 WebP tokens)
before the Edge Function starts minting v2 tokens, then deploy the Web client.
