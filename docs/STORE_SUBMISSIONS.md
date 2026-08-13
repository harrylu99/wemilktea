# Store submissions

The public Stores page includes a contextual Suggest a store dialog. It writes
only a pending `store_submissions` row; it never creates a brand, location,
candidate, or published record.

## Public flow

```text
/stores
  → Suggest a store
  → validated responsive dialog/sheet
  → pending store_submissions row
  → admin Submissions queue
  → trusted verification and the existing candidate/canonical workflow
```

The browser sends the user-provided fields through the Supabase anonymous
client. RLS permits only inserts that remain `pending` with no review fields.
There are no public select, update, or delete policies. Database constraints
repeat the important size, URL, email, and required-field checks.

The Google Maps URL is user-provided reference text. WM-23 makes no Google
Places or Maps API request and does not resolve a URL to a Place ID. Submitter
email is optional and is visible only to authorized admins through the private
submissions policy.

## Fields and lifecycle

Required fields are `store_name` and `suburb`. Optional fields are
`google_maps_url`, `official_url`, `notes`, and `submitter_email`.

The existing status vocabulary is retained: `pending`, `approved`, `rejected`,
and `duplicate`. Public submissions always start as `pending`; moderation and
canonical creation remain separate workflows.

## Admin visibility

`/submissions` is an admin-only read-only queue for this ticket. It shows
pending suggestions and reviewed history, including user-provided reference
links and notes. It does not provide a shortcut to publication.
