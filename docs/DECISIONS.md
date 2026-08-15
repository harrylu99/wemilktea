# Engineering decisions

| Decision                                     | Status   | Rationale                                                                                  |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| One Bun-workspace monorepo                   | Accepted | Keep shared engineering context while preserving deployment independence.                  |
| Separate public and admin applications       | Accepted | The audiences, visual concerns, and access levels are different.                           |
| Supabase PostgreSQL instead of MongoDB       | Accepted | Relational catalogue data, access control, and managed platform services fit the V1 model. |
| PostGIS for geographic data                  | Accepted | Store discovery needs reliable geographic queries.                                         |
| Cloudflare R2 for owned/permitted images     | Accepted | Image binaries do not belong in PostgreSQL.                                                |
| No general-purpose backend service initially | Accepted | Supabase covers V1 data/auth needs; privileged integrations use a server-side boundary.    |
| Google Places is discovery/enrichment only   | Accepted | WeMilktea owns its reviewed canonical records and must respect provider terms.             |
