# Public Drink Detail

WM-27 implements the canonical public route:

```text
/drinks/:brandSlug/:productSlug
```

The page resolves a published product by both its brand slug and product slug. Public RLS remains authoritative: draft products, unpublished parents, unavailable relationships and draft locations are not exposed, and inaccessible route combinations use the same Not Found state.

## Data boundary

Drink Detail reads the published product, brand and category; public primary image metadata; and `location_products` rows whose availability is `available`, joined to published canonical locations. Prices are location-specific minor units and are formatted from each relationship row. No global product price is inferred.

## Interaction and limitations

“Find this drink” scrolls and focuses the `Available at` section. The mobile contextual action uses the same deterministic behaviour. Available store cards link to `/stores/:slug`.

The Figma examples for ratings, opening status, distance, “best for” copy and flavour profiles are not rendered because V1 has no canonical support for them. A published product with zero currently available locations remains a valid detail page and explains that no listed store currently carries it.

No Google API, geolocation permission or ordering/inventory service is required. Product and store image failures fall back independently.
