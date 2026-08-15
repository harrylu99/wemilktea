# Picker Result

The WM-30 result contract is resolved by the public route:

`/picker/result/:brandSlug/:productSlug?store=:locationSlug&craving=:cravingKey`

WM-31 resolves that URL against the current public catalogue. It does not run
the Picker algorithm again, use React navigation state, or persist a result.

## Canonical validation

The product must be published and belong to a published brand and category. The
selected store must be published and have an available `location_products`
relationship for that exact product. RLS is the authoritative visibility
boundary. Missing, draft, unavailable, or tampered relationships render the
stale-result state and never substitute another store.

Query failures are kept distinct from stale/invalid results so a user can retry
the same URL without changing the recommendation.

## Craving and fortune

The `craving` query value is parsed through WM-30's centralized craving schema.
Known category cravings match the canonical category slug; `creamy` and
`refreshing` require explicit lower-cased `discovery_tags`; `surprise` is
generic. Unknown or mismatched cravings use the neutral line “The sign picked
this one for you.” Fortune text is derived at render time and is not stored.

## Result actions

The result remains one drink plus one selected store. It exposes:

- `View drink` → `/drinks/:brandSlug/:productSlug`
- `Find this drink` → `/stores/:locationSlug`
- `Pick again` → `/picker`

Price is read from the selected product/location relationship only. If it is
missing, the result omits price rather than inventing one. Product imagery uses
the existing permitted R2 metadata and falls back safely when absent or broken.

The Store Detail page remains responsible for maps and directions. WM-31 makes
no Google, Maps, or geolocation request.

## Figma/data boundary

The approved Result frames are Mobile `86:826`, Tablet `86:847`, and Desktop
`86:875`. Their illustrative “near you”, opening-status, and distance copy is
not rendered because V1 has no canonical hours, open status, geolocation, or
nearest-store ranking. The next-step panel instead names the selected store
and its canonical area.

## Content readiness

The current development seed has representative Milk Tea and Creamy content,
but no published Matcha category, available Fruit Tea product, or explicit
Refreshing tag. Those options intentionally retain WM-30's honest no-match
behaviour and are catalogue-curation work, not a result-page fallback reason.
