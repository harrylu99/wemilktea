# Public Drinks

WM-26 exposes the canonical drink catalogue at `/drinks`.

## Public data boundary

The page reads published `products`, their published `brands` and `categories`, primary public image metadata, and available `location_products`. Row-level security remains authoritative; the browser does not fetch drafts and hide them in React.

Products with no available relationship to a published location are excluded from the discovery catalogue. An availability count is the number of distinct locations where the relationship is `available` and the location, product, brand, and category are publicly published.

## Search and categories

Search is client-side after one bounded catalogue load because the V1 Auckland catalogue is small. It matches product name, brand, category, description, and discovery tags case-insensitively. Category chips are sourced from published database categories, use one selected category at a time, and preserve `q`/`category` in the URL:

```text
/drinks?q=matcha&category=milk-tea
```

The category row scrolls horizontally on narrow screens so valid categories are not hidden. “All drinks” clears the category filter.

## Cards and ordering

Cards show the canonical product name, brand/category context, owned/permitted image when available, and truthful available-store count. Ratings are not shown because V1 has no rating model. The list uses stable alphabetical product-name ordering; the Figma “Popular drinks” label is intentionally rendered as “Drinks” until a real curation/popularity signal exists.

## Images

Product images reuse the WM-24/25 R2 metadata boundary. Missing or failed images use the existing content-oriented fallback. Google imagery is never fetched or used as catalogue content.

## Drink Detail contract

Because WM-25 product slugs are unique per brand rather than globally, cards use the unambiguous future route:

```text
/drinks/:brandSlug/:productSlug
```

WM-27 can load the product, brand, category, primary image, available published stores, and location-specific prices through the same public Supabase boundary.

See [Public Drink Detail](DRINK_DETAIL.md) for the detail route, availability semantics, CTA behaviour and intentional omissions from the illustrative Figma metadata.
