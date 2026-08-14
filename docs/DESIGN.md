# Design references

Approved public WeMilktea designs live in the [WeMilktea Figma file](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea).

## Stores frames

- Mobile: [27:825](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=27-825)
- Tablet: [27:1085](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=27-1085)
- Desktop: [27:1129](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=27-1129)

## Store Detail frames

- Mobile: [27:851](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=27-851)
- Tablet: [27:1173](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=27-1173)
- Desktop: [27:1209](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=27-1209)

## Public Drinks frames

- Mobile: [83:656](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=83-656)
- Tablet: [83:697](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=83-697)
- Desktop: [83:743](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=83-743)

## Public Drink Detail frames

- Mobile: [84:752](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=84-752)
- Tablet: [84:791](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=84-791)
- Desktop: [84:829](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=84-829)

The Drink Detail frames are the visual source of truth. Illustrative ratings, opening status, distance, “best for” copy and flavour profile content are intentionally omitted until canonical V1 data supports them.

## Public Explore frames

- Mobile: [80:409](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=80-409)
- Tablet: [80:452](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=80-452)
- Desktop: [80:526](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=80-526)

Explore follows these frames for hierarchy, search, filters, and editorial spacing. The current canonical schema has no collections, ratings, review counts, or temporal ranking fields, so the implementation uses a truthful “Worth trying” drink section and canonical store links instead of fabricating those concepts.

## Public Home frames

- Mobile: [74:145](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=74-145)
- Tablet: [74:196](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=74-196)
- Desktop: [74:248](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=74-248)

These are the final Home frames. The desktop frame demonstrates dark tokens as a valid theme example; responsive width does not select a theme. Home uses the application’s existing theme tokens at every breakpoint.

## Admin Products

- Desktop Products list: [166:982](https://www.figma.com/design/ZmTLK1qabFtL4YU9Mi51JI/Wemilktea?node-id=166-982)

The connected Figma snapshot currently exposes the Products list node above. A separate approved Product Detail/Edit/Create node was not discoverable in the current connected page snapshot, so WM-25 follows the existing Admin Store Management field grouping and tokens for the detail form, availability section, and image section. Replace this note with the approved detail/image/availability node IDs when that design is published to the connected file.

## Suggest Store flow

The connected Figma snapshot currently exposes the public Stores and Store
Detail frames above, but does not expose a named `Suggest a Store` modal/sheet
node yet. WM-23 therefore uses the existing public dialog tokens and records
the product copy and responsive behaviour in code/docs without inventing a
node ID. Add the approved mobile, tablet, desktop, validation, and success
node IDs here when that Figma flow is published to the connected file.

Figma is the visual source of truth for approved public screens. The Stores
implementation follows the mobile, tablet, and desktop frames independently;
it does not infer desktop behaviour from the mobile frame alone.

## Map and credential boundary

The approved public map provider is Google Maps JavaScript API. The browser
uses the optional `VITE_GOOGLE_MAPS_BROWSER_KEY`, which must be restricted by
HTTP referrer and required Google Maps APIs. This key is intentionally separate
from the server-only `GOOGLE_PLACES_API_KEY` used by Supabase Edge Functions
for discovery and transient candidate detail. Neither credential belongs in
source control.

The map visualises canonical published location coordinates from Supabase. It
does not call Google Places to build the public catalogue. If Maps cannot load,
the accessible canonical store list remains available with a map fallback.
