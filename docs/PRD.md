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

The public experience is focused on discovering stores and drinks. It is not an account, social, ordering, loyalty, or delivery product in V1.

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

Do not add V2 concepts or unapproved product areas. In particular, V1 does not imply accounts for public users, social features, reviews, ordering/payment, delivery, loyalty, or a standalone general-purpose backend.
