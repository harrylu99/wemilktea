# Public Search

`/search` is the focused public utility for finding published WeMilktea drinks
and stores across Auckland. It does not contain editorial content,
recommendations, categories, or picker promotion.

## URL state

The optional `q` query parameter is URL-backed:

- `/search` shows the search prompt.
- `/search?q=matcha` searches canonical Drinks and Stores.

Typing, clearing, refresh, Back, and Forward preserve the expected query state.
Search results are `noindex, follow` and `/search` is intentionally excluded
from the generated sitemap.

## Search fields

Unified Search intentionally matches visible entity names only: Drink search
matches product name, and Store search matches store display name. Hidden
metadata such as brand, category, description, discovery tags, suburb, and
address does not affect unified Search results. The page loads the existing
bounded public catalogue once and filters the normalized result in the browser.

The `/drinks` and `/stores` page-local filters retain their richer catalogue
search behavior. Moving unified Search filtering to Supabase/PostgreSQL later
is a possible scale improvement, but any server-side implementation should
preserve this visible-name contract.

## Legacy Explore route

The old `/explore` route remains only as a migration redirect:

- `/explore` redirects to `/`.
- `/explore?q=matcha` redirects to `/search?q=matcha`.
- Unsupported Explore-only parameters do not crash; a query is preserved when
  present, otherwise the route resolves to `/`.

Redirects replace the current history entry so they do not create a loop.
