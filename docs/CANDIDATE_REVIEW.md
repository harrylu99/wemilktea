# Candidate review

WM-19 converts a Google discovery identity into reviewed WeMilktea data without automatically publishing anything.

```text
Google Place ID
  -> candidate
  -> admin review
  -> approve as draft location | merge with canonical location | reject
  -> WM-20 publication and general store management
```

## Google reference versus canonical data

`candidate-google-detail` fetches Google Place Details only after an authenticated administrator opens a candidate. The response is transient, read-only reference data and is labelled **Google Maps** in the admin UI. It is not written to `store_candidates`.

An administrator must separately enter independently verified WeMilktea canonical data: brand, display name, slug, suburb, address, coordinates, and optional verification reference URL. Only this canonical data is written to `brands` and `locations`.

## Resolution operations

The browser calls three admin-only database RPCs. Each validates the allow-listed administrator, locks the candidate, and completes its mutation in one transaction:

- `approve_store_candidate` resolves an existing or new brand, creates a `draft` location, associates the candidate's durable Google Place ID, and records the review audit fields.
- `merge_store_candidate` links the candidate to an existing location and associates the Place ID only if there is no conflicting existing Place ID.
- `reject_store_candidate` retains the candidate and records a constrained rejection reason and review audit fields.

Only `new` and `possible_duplicate` candidates can be resolved. A second or competing resolution fails cleanly; no second location is created.

## Deployment

Deploy `candidate-google-detail` with the same server-only Google Places key and `ADMIN_APP_ORIGIN` configuration as `store-discovery`:

```sh
supabase functions deploy candidate-google-detail
```

The function uses the caller's JWT and RLS-scoped Supabase client to read the candidate. It does not require the service-role key.
