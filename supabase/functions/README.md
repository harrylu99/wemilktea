# Supabase Edge Functions

Add a function here only for a secret-bearing or privileged V1 operation, such as Google Places enrichment or an R2 upload workflow. Browser applications must not call those providers directly with secret credentials.

`store-discovery` is the first such function. Its HTTP entry point authorizes an admin JWT, then uses a service-role database client and the server-only Google Places key. Its pure discovery module can be reused by a future scheduled entry point without duplicating pipeline logic. See [Google Places discovery](../../docs/GOOGLE_PLACES_DISCOVERY.md).
