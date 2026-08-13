# Public Store Detail

The public route is `/stores/:slug`. It reads one published canonical
location and its published parent brand through the anonymous Supabase client.
Drafts, candidates, discovery runs, moderation fields, and transient Google
reference data are not queried.

## Data and relationships

The detail query loads the canonical location by slug and the public
`location_products` relationships whose status is `available`. Existing RLS
policies also require the location, product, brand, and category to be
published. Product links use the future `/drinks/:slug` contract; Drink Detail
is outside WM-22.

Location image metadata is accepted when it contains a permitted external URL.
Google-provenance imagery is ignored. Until R2 image delivery is implemented,
the page uses an owned-data-safe fallback.

## Map and directions

Store Detail reuses the WM-21 Google Maps JavaScript loader. The map receives
only canonical latitude/longitude values from Supabase and does not call
Google Places. If the browser key or Maps SDK is unavailable, the address and
directions link remain usable. Directions use a Google Maps URL built from the
canonical coordinates.

## Deliberate V1 omissions

The current canonical schema does not provide opening hours, phone numbers,
ratings, reviews, saved stores, or live business status. Store Detail does not
fabricate or fetch those fields from Google. The mobile Figma Save action is
omitted because public accounts/favourites are outside V1; Share is supported
with the Web Share API or clipboard fallback.
