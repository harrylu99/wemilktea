# External menu function

WM-52 adds the `external-menu` Supabase Edge Function. It accepts only a
canonical WeMilktea `locationId` from an authenticated Admin request:

```json
{ "locationId": "<canonical-location-uuid>" }
```

The function reads `location_external_sources` through the existing Admin RLS
client, requires `provider = 'uber_eats'`, obtains an Uber application token
with only `client_credentials` and `eats.store`, fetches the mapped store menu,
normalizes it, and returns only the provider-neutral menu response. It never
accepts an Uber Store ID from the browser and never writes catalogue data or
persists the raw provider payload.

## Configuration

Configure these values as server-side Edge Function secrets/environment values:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
ADMIN_APP_ORIGIN
UBER_EATS_ENV=sandbox|production
UBER_EATS_CLIENT_ID
UBER_EATS_CLIENT_SECRET
```

`UBER_EATS_ENV` is required and selects a paired endpoint set. There is no
production fallback. The client keeps an in-memory token cache with a 30-second
safety window; cache lifetime is only an optimization because Edge Function
instances are ephemeral.

## Normalization decisions

The response contains `provider`, `items`, and `warnings`. Each item includes
the Uber item ID, localized name/description, the first referenced source
category name, a reference-only image URL, and a nullable price.

Uber documents `price_info.price` as an integer in the lowest local currency
denomination. WM-52 exposes this as `price.amountMinor` without floating-point
conversion. The real test response did not include a currency code, so
`price.currency` is `null`; the function does not infer NZD or any other
currency.

Category IDs are resolved to source category names only. They are not mapped to
canonical WeMilktea categories. Modifier groups are parsed for presence but are
not normalized yet; non-empty groups produce a warning. Remote image URLs are
returned as review references only and are not downloaded or persisted.

## Deployment order

Do not deploy this function before the WM-51 mapping migration exists in the
target database. The controlled sequence is:

1. Merge the reviewed WM-51 migration.
2. Apply and verify `20260817071555_add_location_external_sources.sql`.
3. Configure the server-only Uber secrets.
4. Deploy `external-menu`.
5. Verify with an authenticated Admin request.

The repository's deployment workflow does not apply database migrations or
configure secrets automatically. Do not deploy this function to production as
part of WM-52 development.
