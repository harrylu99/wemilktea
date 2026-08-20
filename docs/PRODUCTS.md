# Product catalogue management

WM-25 establishes the canonical drink catalogue for future public Drinks, Drink Detail, Explore, Home, and Picker work.

## Canonical model

```text
brands
  └── products
        └── location_products ── locations
```

`products` represent curated drinks/items owned by a canonical WeMilktea brand. A product is not duplicated per branch. `location_products` records whether that product is available at a canonical location, its local price in minor units, currency, provenance, and verification timestamp.

The existing schema keeps product slugs unique per brand (`brand_id, slug`). WM-27 should preserve that decision when choosing its public URL lookup strategy.

## Admin workflow

Admin routes:

```text
/products
/products/new
/products/:productId
```

New products start as drafts. Saving is separate from publishing. Publishing requires a valid product, a published parent brand, and a published category. Images and location availability are not required for publication.

Admins can manage canonical fields, product publication, the primary product image, and same-brand location relationships. Availability is catalogue state (`available`, `unavailable`, or `unknown`), not inventory or POS state. Prices use integer minor units (`price_cents`) and an uppercase three-letter currency; the V1 UI uses NZD.

## Reviewed external menu confirmation

The Admin Import Menu review is read-only until an Admin explicitly confirms selected items. Confirmation re-resolves each product by the selected location's brand and canonical `brand_id + slug` identity. Exact existing products are reused without overwriting curated fields or publication state; ambiguous same-brand names fail safely. New products are inserted as drafts, missing location relationships are added as `unknown`, and existing relationships remain unchanged. External prices, images, raw menu payloads, and tokens are not persisted. Provider-neutral item provenance is stored in `product_external_sources` and is unique per location, provider, and external item ID, making repeated confirmation idempotent.

## Images

Product images reuse WM-24's `image-storage` Edge Function and metadata model. Product keys are generated under:

```text
products/{product-id}/{uuid}.{jpg|png|webp}
```

Google imagery is never copied to R2. The primary image relationship is stored in `product_images`; public image metadata is visible only when the product, brand, and category are published.

WM-62 adds temporary stock/showcase imagery through a local operator workflow.
Approved Pexels assets are stored once in R2 under `showcase/pexels/...`,
recorded in `showcase_image_pool`, and assigned once to Products without a
primary image. Assignment is persisted; Web requests never call Pexels or
randomize the image. Existing WeMilktea, merchant, user, or future Uber images
are not replaced automatically. See [Pexels showcase images](../scripts/pexels/README.md).

## Public contract for WM-26/27

Future public queries can use the anonymous Supabase boundary to read:

- published products;
- published parent brands and categories;
- primary image metadata;
- available `location_products` relationships and local prices.

Draft products, unavailable relationships, and moderation/admin metadata remain private. No future public feature needs Admin access.

WM-26 excludes products with zero available published locations from `/drinks`, counts distinct publicly reachable locations only, and uses the unambiguous future Drink Detail route `/drinks/:brandSlug/:productSlug` because product slugs are scoped by brand.
