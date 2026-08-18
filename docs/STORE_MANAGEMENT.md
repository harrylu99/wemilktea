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

## Archive and permanent deletion

`archive_location` removes a draft or published location from public visibility
by setting `publication_status = 'archived'`. It preserves the canonical row,
Google identity, catalogue relationships, images, candidate history, and
external provenance. `restore_archived_location` returns an archived location
to `draft`; it never publishes automatically.

`delete_location_if_safe` is a separate admin-only operation for accidental or
test records. It allows only draft or archived locations with WeMilktea-owned
provenance and no catalogue, image, external integration, or candidate-review
history. Protected records must be archived instead. The checks run in the same
transaction as the delete, and no dependent records are cascade-deleted by
this workflow.
