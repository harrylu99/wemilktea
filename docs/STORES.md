# Public Stores experience

The public `/stores` route reads the canonical `locations` table through the
anonymous Supabase client. The database policy is the public boundary: only
locations with `publication_status = 'published'` whose parent brand is
published are returned. Candidate, discovery-run, moderation, and transient
Google reference data are not queried by the public application.

## Data flow

```text
WM-19 candidate review
        ↓
canonical location (draft)
        ↓
WM-20 Store Management
        ↓
published location + published brand
        ↓
public `/stores`
```

The web app selects only the fields required for the Stores screen: canonical
location ID/slug, display name, suburb, address, PostGIS coordinates, and the
published brand name/slug. Coordinates are normalised at the browser boundary
from the PostGIS representation and are used for the map/list relationship.

## Search and filters

V1 search is a bounded client-side filter over the published Auckland result
set. It matches canonical display name, brand, suburb, and address. Brand and
area filters are derived from that same result set and are reflected in the
URL query string (`q`, `brand`, `area`, and `near`). The dataset is
expected to remain small for V1; a server-side search or bounds query can be
introduced when real volume justifies it.

`Near me` is opt-in. It requests browser geolocation only after the user
selects the control, filters to a 40 km Auckland-area radius, and sorts by
distance. Denying permission does not block browsing.

## Map decision

WM-21 uses the Google Maps JavaScript API with a browser-restricted key. The
key is loaded only from `VITE_GOOGLE_MAPS_BROWSER_KEY`; it is not the
server-only `GOOGLE_PLACES_API_KEY` used by Edge Functions. Markers are built
from canonical PostGIS coordinates already returned by the public query. The
accessible list remains the primary store representation, and marker/card
selection is linked. If the browser key or Maps SDK is unavailable, the page
keeps the list usable and renders the canonical marker fallback surface.

WM-47 keeps Google Maps for the public Stores map. The existing implementation
already provides the required map, marker, list-selection, filtering,
fit-bounds, Near Me, responsive, and fallback behavior. Leaflet would require
selecting and operating a production tile provider in addition to the library;
the public OpenStreetMap tile service is best-effort and has explicit
attribution, referrer, caching, and usage requirements. Mapbox GL JS would add
a public access token, a new rendering dependency and CSS/WebGL integration,
provider attribution, and map-load billing. Those tradeoffs do not provide a
meaningful benefit for the current Auckland store density or feature set, so
WM-47 customizes the existing Google marker path without adding a second map
stack or changing provider configuration.

The approved visual references are recorded in [Design references](DESIGN.md).

The Figma Stores frames include `Open now`, `Top rated`, and `New` chips, but
the V1 schema does not contain reliable hours, ratings, or a canonical
creation taxonomy for those filters. WM-21 implements only supported filters
(Near me, area, and brand) rather than presenting non-functional controls.

## Images and routing

No image is required for a store result. Until the R2 image workflow is
implemented, the card uses a neutral fallback and does not copy or hotlink
Google imagery. Store links use the canonical `/stores/:slug` route; the
detail page is owned by WM-22.
