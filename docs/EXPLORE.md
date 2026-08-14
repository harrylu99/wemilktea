# Public Explore

`/explore` is the public editorial discovery surface for Auckland milk tea. It
composes the existing public Drinks and Stores data boundaries; it is not a
second catalogue and does not read candidates, discovery runs, or Google
reference content.

## Data and visibility

Explore reads published products with available public location relationships
and published canonical locations with published parent brands. Supabase RLS
is the visibility boundary, so drafts are not fetched and then hidden in the
browser. Image metadata follows the existing R2/public-image policy and keeps
the existing placeholder fallback.

## Search and filters

The search field is backed by `?q=` and searches canonical drink name, brand,
category, description, discovery tags, and store name, brand, suburb, and
address. The only V1 filter is `?filter=seasonal`, backed by the canonical
`products.is_seasonal` field. Search and filters are intentionally simple and
shareable through the URL.

The approved Explore frames illustrate concepts such as collections, trending,
new, top-rated, and hidden gems. V1 does not have collection, rating, review,
or temporal-ranking tables/fields, so those labels are not shown as if they
were real data. The no-search editorial sections are named “Worth trying” and
“Around Auckland” and are deterministic slices of canonical drinks/stores.

## Figma

The visual source of truth is documented in [Design references](DESIGN.md):
Explore mobile `80:409`, tablet `80:452`, and desktop `80:526`.
