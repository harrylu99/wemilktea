# Supabase Edge Functions

Add a function here only for a secret-bearing or privileged V1 operation, such as Google Places enrichment or an R2 upload workflow. Browser applications must not call those providers directly with secret credentials.

`store-discovery` is the first such function. Its HTTP entry point authorizes an admin JWT, then uses a service-role database client and the server-only Google Places key. Its pure discovery module can be reused by a future scheduled entry point without duplicating pipeline logic. See [Google Places discovery](../../docs/GOOGLE_PLACES_DISCOVERY.md).

`candidate-google-detail` authorizes the same admin JWT but reads the candidate through that user's RLS-scoped client. It uses the Google key only to return transient, attributed reference data; it never persists that response. See [Candidate review](../../docs/CANDIDATE_REVIEW.md).

`image-storage` authorizes an admin, issues a short-lived R2 presigned upload URL, verifies the uploaded object, and attaches only metadata through admin-only RPCs. R2 credentials stay in Edge Function secrets; the browser receives no credentials or bucket access. See [Image storage](../../docs/IMAGE_STORAGE.md).
