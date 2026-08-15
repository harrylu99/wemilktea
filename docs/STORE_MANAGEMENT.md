# Store management

WM-20 manages canonical WeMilktea locations after candidate review.

```text
Candidate approval
  -> canonical location (draft)
  -> admin store management
  -> published public location
```

## Canonical ownership

The Stores screens manage only WeMilktea-owned canonical fields: the brand relationship, display name, slug, address, suburb, PostGIS coordinates, and an independently verified source URL. Google Place ID is shown as a read-only external identity. Store management does not fetch, copy, or persist Google display content.

## Publication

Only a valid `draft` location can be published. A published location requires a valid brand, name, slug, address, suburb, and geographic point; images, products, and menus are deliberately not required.

`publish_location` also makes the parent brand published in the same transaction. This is necessary because public location RLS requires both the location and brand to be published. `unpublish_location` returns the location to `draft` but intentionally does not unpublish the brand, which may have other public locations or products.

## Database operations

The browser calls these authenticated admin-only RPCs:

- `get_location_management_detail` returns a canonical location with PostGIS coordinates converted for editing.
- `update_location_management` validates and saves canonical fields, preserving Google Place ID and detecting a stale `updated_at` value.
- `publish_location` validates and publishes a draft location.
- `unpublish_location` removes a published location from public visibility.

Candidate history, discovery observations, and Google retention boundaries are not changed by these operations.
