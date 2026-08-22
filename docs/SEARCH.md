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

Drink search reuses the published Drinks boundary and matches product name,
brand, category, description, and discovery tags. Store search matches display
name, brand, suburb, and address. The page loads the existing bounded public
catalogue once and filters the normalized result in the browser.

## Legacy Explore route

The old `/explore` route remains only as a migration redirect:

- `/explore` redirects to `/`.
- `/explore?q=matcha` redirects to `/search?q=matcha`.
- Unsupported Explore-only parameters do not crash; a query is preserved when
  present, otherwise the route resolves to `/`.

Redirects replace the current history entry so they do not create a loop.
