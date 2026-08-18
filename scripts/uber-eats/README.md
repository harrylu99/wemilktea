# WM-50 Uber Eats sandbox spike

This client proves only the server-side sandbox path required by WM-50:

1. `client_credentials` OAuth with the `eats.store` scope;
2. authorized-store enumeration through `GET /v1/eats/stores`;
3. Store Details retrieval through `GET /v1/eats/stores/{store_id}`;
4. one complete menu retrieval through `GET /v2/eats/stores/{store_id}/menus`.

The environment is explicit and selects a paired endpoint set. Use
`UBER_EATS_ENV=sandbox` for a Testing application. Production requires the
explicit value `production`; there is no production fallback.

It does not write to Supabase, call React applications, modify canonical data, or
persist the Uber response.

## Run locally

```sh
cp scripts/uber-eats/.env.example scripts/uber-eats/.env.local
# Populate scripts/uber-eats/.env.local locally, then:
bun --env-file=scripts/uber-eats/.env.local run scripts/uber-eats/test-connection.ts
```

The command prints only OAuth status/scope, store ID/name, response shape, and
entity counts. It never prints the client secret, access token, or complete menu.
The local `.env.local` is ignored by the repository's existing `.env.*` rule.

## WM-50 live result

The provisioned test store was authorized and its Store Details endpoint returned
the expected store. The menu endpoint returned HTTP 200 with root keys
`menus`, `categories`, `items`, and `modifier_groups`. The observed response had
one menu, one category, one item, and an empty `modifier_groups` object.

The sanitized structural analysis is committed at
`scripts/uber-eats/samples/menu-structure.json`. It contains field names and
counts only; no raw menu values or sensitive response data were stored.
