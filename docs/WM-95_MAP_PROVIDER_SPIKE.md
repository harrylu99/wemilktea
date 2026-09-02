# WM-95 Map Provider Spike

Research date: 2026-09-02  
Ticket: WM-95 — Spike: Evaluate Google Maps replacement with MapLibre / OpenStreetMap

## Decision

**NO-GO for a provider migration in v1.4. Keep Google Maps JavaScript API as the
current renderer.**

The current product has only two map call sites, a canonical store data path,
an accessible list fallback, and an existing Google loader that already covers
the WM-98 interaction contract. A migration would add a tile/style provider,
attribution, token/rate-limit operations, WebGL/bundle behavior, and a second
failure surface without a demonstrated product or cost benefit at current
scale.

This is a research-only spike. It does not change the production map, schema,
environment variables, dependencies, or provider configuration.

## 1. Current implementation and data contract

The current implementation was inspected in:

- `apps/web/src/stores/google-map.ts`
- `apps/web/src/stores/google-map.test.ts`
- `apps/web/src/app.tsx`
- `apps/web/src/store-detail.tsx`
- `apps/web/src/stores/data.ts`
- `apps/web/package.json`
- `apps/web/.env.example`
- `packages/validation/src/index.ts`
- `docs/ARCHITECTURE.md`
- `docs/STORES.md`
- `docs/DEPLOYMENT.md`

There are two production call sites:

1. `/stores` renders `GoogleMapPanel` and keeps the accessible store list as a
   primary fallback.
2. Store detail renders `StoreMap` for one canonical location.

Both use the optional, browser-restricted `VITE_GOOGLE_MAPS_BROWSER_KEY`. The
server supplies canonical public store data through `search_public_stores`;
coordinates are parsed from the existing PostGIS representation. Store and
marker selection, map/list switching, filter invalidation, single-store
centering, multi-store fitting, loading, error, empty, and no-key fallback
behavior already exist.

The map is a renderer only. It does not perform Places search or geocoding in
the browser, and no provider-specific place identity is stored in the public
store contract.

## 2. WM-98 UX contract comparison

| Requirement                                 | Current Google implementation | Migration impact                                              |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| Mobile Map default                          | Supported by `StoresPage`     | Recreate map lifecycle and resize behavior                    |
| Explicit Map/List switch                    | Supported                     | Provider-neutral controller needed                            |
| Marker selection and in-map preview         | Supported                     | Rebuild marker event/focus behavior                           |
| No document jump to hidden list             | Supported                     | Preserve current selection model                              |
| Latest valid selected store survives switch | Supported                     | Re-test state synchronization                                 |
| Invalid selection clears after filtering    | Supported                     | Independent of provider, but must be retained                 |
| Desktop combined list/map                   | Supported by current layout   | Recreate responsive sizing/gesture behavior                   |
| Light/dark strategy                         | Existing Google renderer path | MapLibre/Mapbox requires style choice and runtime switch plan |
| Accessible fallback                         | Existing list/fallback UI     | Must remain first-class during SDK/tile failures              |

MapLibre and Mapbox can implement markers, bounds, center/zoom, controls, and
style changes, but that is implementation work rather than a current contract
gap. A map library does not provide the map data, style hosting, availability
guarantee, or attribution policy by itself.

## 3. Provider comparison

### Google Maps JavaScript API

- **Feasible:** yes; already integrated and tested in production code.
- **Advantages:** lowest migration risk; existing browser-key restriction,
  loader, marker behavior, fit-bounds behavior, fallback, and UX are already
  aligned with WM-98.
- **Costs:** Google bills successful Dynamic Maps JavaScript map loads. The
  current published price is USD $7 per 1,000 billable loads after the first
  10,000 monthly free usage events in the listed tier; actual account credits,
  other SKUs, currency, and taxes still need to be checked at rollout.
- **Risks:** vendor pricing and Google renderer dependency; browser key must
  remain restricted by origin and API.
- **Assessment:** retain for v1.4.

### Mapbox GL JS and Mapbox-hosted services

- **Feasible:** yes, but it requires a Mapbox token, style/tiles configuration,
  attribution, and a new renderer adapter.
- **Advantages:** mature WebGL renderer and hosted vector-tile/style product;
  current pricing documentation describes web map loads with up to 50,000
  monthly free map loads on the listed plan and usage-based tiers after that.
- **Risks:** token and account operations, style/tile coupling, Mapbox
  commercial terms, bundle/runtime migration, and provider lock-in. A Mapbox
  renderer without Mapbox-hosted services does not remove the tile/style
  operations problem.
- **Assessment:** no demonstrated reason to accept this migration cost now.

### MapLibre GL JS

- **Feasible:** yes as the renderer. It is a TypeScript/WebGL client library;
  its current documentation describes the style-document/vector-tile model,
  and v6 is ESM-only.
- **Advantages:** BSD-3-Clause licensed renderer, provider-neutral style and
  tile interfaces, and less renderer lock-in than a hosted vendor SDK.
- **Risks:** MapLibre is not a hosted map-data service. WeMilkTea would still
  need a production tile/style provider or self-hosting, visible attribution,
  monitoring, cache/rate-limit policy, dark/light style assets, and a plan for
  WebGL failures and bundle cost.
- **Assessment:** viable future renderer, not a complete replacement decision.

### MapTiler Cloud

- **Feasible:** yes as a MapLibre tile/style provider.
- **Advantages:** managed vector styles and tiles with a documented MapLibre
  path; commercial plans and an SLA tier are available.
- **Risks:** the current free plan is non-commercial/R&D only. The published
  Flex plan is USD $30/month with 25,000 sessions and 500,000 API requests
  included; extra sessions are $2.50 per 1,000 and extra API requests are
  $0.15 per 1,000. MapTiler's own SDK JS uses session-based tracking, while
  direct third-party SDK usage such as MapLibre can be request-sensitive. The
  session example therefore must not be treated as a guaranteed direct-
  MapLibre cost. It adds a commercial account, token, quota, and provider
  dependency.
- **Assessment:** credible future candidate, but no v1.4 migration trigger.

### Stadia Maps

- **Feasible:** yes as a MapLibre tile/style provider.
- **Advantages:** open-standard MapLibre integration, fixed credit pools, and
  commercial paid plans. The current published plans list Free at 200,000
  credits/month for non-commercial use, Starter at USD $20/month with
  1,000,000 credits, and Standard at USD $80/month with 7,500,000 credits.
  Standard vector or raster basemap tiles cost one credit per tile.
- **Risks:** credit consumption depends on viewport tile requests rather than
  one simple map-load number; styles, tokens, attribution, quota limits, and
  service operations still need to be selected and tested. The free plan is
  not suitable for a commercial public product.
- **Assessment:** credible future candidate; not enough benefit to migrate now.

### PMTiles / Protomaps / self-hosting

- **Feasible:** technically possible with MapLibre and object storage/CDN.
- **Advantages:** control over data packaging, cache policy, and provider
  dependency; PMTiles can package vector tiles for range requests.
- **Risks:** WeMilkTea would own data updates, tile generation, style hosting,
  CDN behavior, regional performance, monitoring, and licensing/attribution.
  That operational surface is disproportionate to the current store-map need.
- **Assessment:** explicitly deferred; not an MVP provider choice.

## 4. Data compatibility and implementation effort

All compared client renderers can consume the existing latitude/longitude
values. No provider needs to change `locations`, `brands`, `search_public_stores`,
or the PostGIS coordinate parsing path. Provider-specific place IDs must not be
introduced into that canonical data contract.

A safe future migration would require a narrow provider-neutral boundary around
the current map needs: create/destroy, resize, center/zoom, fit bounds, marker
selection, marker focus, and explicit failure state. The current Google loader
would remain behind that boundary during the transition.

Estimated future sequence if a later product decision changes the outcome:

1. Add the provider-neutral map boundary and contract tests without changing UX.
2. Migrate `/stores`, retaining the list fallback and all WM-98 state behavior.
3. Migrate Store detail only after the discovery map is stable.
4. Remove the Google loader/key only after production observation confirms parity.

Likely future files would be the map adapter, `/stores` and detail integration,
provider-specific style/configuration, environment validation, tests, and
deployment documentation. This spike intentionally does not add them.

## 5. Licensing, attribution, and operations

MapLibre GL JS is BSD-3-Clause licensed, but the basemap data and service have
separate terms. OpenStreetMap data requires attribution under ODbL. The public
`tile.openstreetmap.org` service is donation-funded, best-effort, has no SLA,
requires attribution and normal browser referer behavior, and prohibits bulk
prefetching. It must not be treated as a production CDN for WeMilkTea.

Any future OSM-derived deployment must select a provider whose commercial terms,
tile quotas, attribution requirements, caching rules, SLA, and outage behavior
are explicitly accepted. “MapLibre + OSM” is not a sufficient production
architecture.

## 6. Cost observations

These are directional published-list-price comparisons, not a forecast. They
assume only the stated map-load/session volume, USD pricing, no taxes, no other
SKUs, and no account-specific credits:

| Approx. monthly map initializations |                 Google Dynamic Maps* |      Mapbox web map loads* |                                            MapTiler Flex sessions-only* |                    Stadia standard vector tile usage* |
| ----------------------------------: | -----------------------------------: | -------------------------: | ----------------------------------------------------------------------: | ----------------------------------------------------: |
|                               1,000 |           $0 within listed free tier | $0 within listed free tier |                                                        $30 minimum plan | 1 credit per requested tile; within listed 1M credits |
|                              10,000 |           $0 within listed free tier | $0 within listed free tier |                                                        $30 minimum plan |                             tile count, not map count |
|                              50,000 | about $280 for 40,000 billable loads | $0 within listed free tier | $92.50 session-model example; direct MapLibre cost is request-sensitive |                             tile count, not map count |

\* Google and Mapbox meter map-load events under their own definitions;
MapTiler's own SDK JS can use sessions while direct third-party SDK usage can
be request-sensitive; Stadia meters tile/API credits. The $92.50 MapTiler
figure is only a session-model example: $30 plus 25,000 additional sessions at
$2.50 per 1,000, not a guaranteed direct-MapLibre cost. The figures are
therefore not apples-to-apples and are useful only to show that provider
selection cannot be made from renderer licensing alone.

## 7. Accessibility and performance risks

The current list is the reliable accessible representation and must remain
available when a map SDK, WebGL context, tile provider, style, or network call
fails. A future MapLibre/Mapbox implementation would need keyboard marker
focus, selected-store announcement, reduced-motion compatibility, no
pointer/hover-only behavior, and a deterministic map-to-list fallback.

MapLibre/Mapbox add a WebGL bundle and vector-tile/style network chain. Actual
bundle size, first map render, mobile memory, tile cache behavior, and style
switch performance require a prototype against the chosen provider. No
provider-specific prototype was justified or run in this spike because the
NO-GO decision preserves an already working path.

## 8. Prototype and dependency result

No temporary package, token, map style, production traffic, schema change, or
runtime prototype was added. The existing Google implementation and official
provider documentation were sufficient to make the current decision. A future
GO decision must include a small real-browser prototype before production
replacement, measuring mobile/desktop render, resize, selection, dark/light
style switching, failure fallback, tile requests, and bundle impact.

## 9. Sources consulted

All sources below were checked on 2026-09-02:

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing?authuser=2)
- [Google Maps Platform SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details?hl=en)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [Mapbox GL JS pricing](https://docs.mapbox.com/mapbox-gl-js/guides/pricing/)
- [MapLibre GL JS documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre GL JS API](https://maplibre.org/maplibre-gl-js/docs/API/)
- [MapLibre v5-to-v6 migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
- [MapLibre GL JS license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/)
- [MapTiler Cloud terms](https://www.maptiler.com/terms/cloud/)
- [Stadia Maps pricing](https://stadiamaps.com/pricing/)
- [Stadia Maps products](https://stadiamaps.com/products/maps)
- [Stadia Maps limits](https://docs.stadiamaps.com/limits/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenStreetMap vector tile usage policy](https://operations.osmfoundation.org/policies/vector/)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)

## 10. Scope and acceptance

This spike does not implement a map replacement, change the current Google
integration, add a dependency, alter data/RLS, change deployment settings, or
start another ticket. The explicit outcome is **NO-GO for v1.4 migration**;
the current Google renderer remains the approved implementation until a later
ticket establishes a product or operational reason to revisit it.
