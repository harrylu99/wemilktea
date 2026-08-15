# Daily Milk Tea Picker

The public Picker lives at `/picker` and turns one lightweight craving into
one actionable answer. It does not behave like a search page and does not
persist a daily result.

## Craving rules

The six stable keys and their current canonical rules are:

| Key          | Label       | Rule                                                                                                                                                        |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matcha`     | Matcha      | Exact published category slug `matcha`. The current seed has no Matcha category, so this can honestly return no match until that canonical category exists. |
| `milk-tea`   | Milk Tea    | Exact published category slug `milk-tea`.                                                                                                                   |
| `fruit-tea`  | Fruit Tea   | Exact published category slug `fruit-tea`.                                                                                                                  |
| `creamy`     | Creamy      | Exact lower-cased `products.discovery_tags` value `creamy`.                                                                                                 |
| `refreshing` | Refreshing  | Exact lower-cased `products.discovery_tags` value `refreshing`; no inference from names or descriptions.                                                    |
| `surprise`   | Surprise Me | All eligible products, without category/tag matching.                                                                                                       |

The current seed has reliable `creamy` metadata on Taro Milk Tea. It does not
have `matcha` or `refreshing` examples, so those choices show the honest
no-match state rather than selecting unrelated drinks.

## Candidate eligibility

Products enter the pool only through the public Supabase boundary: the product,
brand, and category must be published, and at least one `location_products`
relationship must be available for a published location and parent brand. The
location relationship carries its public price/currency and canonical store
identity for the second selection step.

## Selection algorithm

The picker filters the eligible product pool by craving, chooses one product
uniformly, and then chooses one eligible location for that product uniformly.
It never samples product/store pairs, so products with more branches are not
more likely to win. The pure `pickRecommendation` function accepts an injected
random source for deterministic tests. Production uses browser crypto randomness
when available, with a non-security-sensitive fallback to `Math.random()`.

The result route is:

`/picker/result/:brandSlug/:productSlug?store=:locationSlug&craving=:cravingKey`

Only stable canonical slugs and the craving key are carried, so direct links and
refreshes do not depend on React location state. WM-31 must revalidate the
product/location relationship against current public RLS.

WM-31 resolves this route into one current drink/store result. If the selected
store is no longer published or available for the drink, it shows a stale-result
state and asks the user to pick again; it never silently substitutes a store.
See [PICKER_RESULT.md](./PICKER_RESULT.md) for the result contract and
unsupported illustrative Figma content.

## Interaction and accessibility

One native radio is selected at a time. The draw button prevents duplicate
activation, briefly shows the ritual state, and navigates without an artificial
multi-second delay. Reduced-motion users skip the visual transition. Loading,
query failures, no eligible products, and no-match cravings have explicit
messages and recovery links.

The Picker has no geolocation, Google API, account, daily lock, history, or
personalization dependency.
