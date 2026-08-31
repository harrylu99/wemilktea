# WeMilktea V1 product definition

WeMilktea helps people discover milk tea in Auckland and helps the internal team build and maintain the catalogue.

## Public WeMilktea

V1 includes these routes and flows:

- Home
- Search
- Stores and store detail
- Drinks and drink detail
- Daily Milk Tea Picker and picker result
- Suggest a Store
- Milk Tea Moments Gallery

The public experience is focused on discovering stores and drinks. V1.4 also includes Milk Tea Moments: a lightweight public Gallery with community contributions and reactions. Public users do not need a traditional visible account or profile flow; anonymous identity is an implementation mechanism for write ownership. WeMilktea is not becoming a general social network.

## WeMilktea Admin

The internal portal supports:

- Store discovery
- Candidate review
- User-submission review
- Store management
- Product management

Admin is an operational tool, not a public-facing application.

## Core content model

Canonical WeMilktea data includes stores, their geographic location, drinks/products, editorial or publication state, images that WeMilktea may use, and user-submitted store suggestions. Google Places may seed and enrich candidates, but reviewed WeMilktea records remain canonical in Supabase.

## Non-goals

Do not add V2 concepts or unapproved product areas. In particular, the Moments approval does not imply comments, followers, direct messages/chat, notifications, social profiles or network graphs, reviews, ordering/payment, delivery, loyalty, or a standalone general-purpose backend.
