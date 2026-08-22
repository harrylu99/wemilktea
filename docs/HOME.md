# Public Home

`/` is the public entry surface. It orients visitors and routes them into the
existing product experiences; it does not duplicate their catalogue or search
implementations.

## Destinations

- Search submits to `/search?q=<term>` and reuses the public cross-entity search.
- Drink cards link to the brand-scoped `/drinks/:brandSlug/:productSlug` route.
- Store cards link to `/stores/:slug`.
- Category shortcuts link to `/drinks?category=<category-slug>`.
- “Pick for me” links to `/picker`, the WM-30 route boundary. Picker logic is not
  part of Home.

## Preview selection

Home reuses the existing public discovery data boundary. Drinks are already
filtered to published products with published brands/categories and at least
one available public location; the Home preview takes the first four in stable
name order. Stores are published canonical locations and the preview takes the
first two in stable display-name order. No popularity, ratings, or “new
opening” claims are inferred from timestamps or discovery data.

Categories come from the canonical public category query and are rendered as
horizontal-scroll links on narrow screens. The Home labels “Worth trying” and
“Around Auckland” intentionally replace unsupported “Top picks” and “New
around Auckland” claims.

## Images and failure states

Drink and store previews reuse the existing permitted-image metadata and
fallback components/patterns. The hero uses the first available permitted drink
image as an editorial visual, or a safe visual fallback when none exists. Home
does not call Google APIs and does not require geolocation or live R2 access.

The page keeps the hero/search/navigation useful while previews load, and shows
a controlled retry state when the public catalogue query fails. Empty drink or
store sections remain navigable through their full destination routes.

## Design

The final Figma references are documented in [Design references](DESIGN.md):
mobile `74:145`, tablet `74:196`, and desktop `74:248`. Desktop dark styling is
not a responsive theme switch; the implementation uses shared application
tokens at every viewport.
