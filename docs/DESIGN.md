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
