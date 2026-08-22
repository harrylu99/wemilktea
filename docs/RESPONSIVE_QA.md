# WM-32 Responsive QA

Reviewed 14 August 2026 against the approved public references in
[Design references](./DESIGN.md). The review covered the nine public screens,
their loading/empty/error or fallback states where available, 390px mobile,
768px tablet, 1280px desktop, and intermediate widths 375, 430, 600, 767,
769, 1024, 1279, 1281, and 1440px.

## Browser QA tooling

- Playwright Test `1.62.1` with Chromium.
- Config: [`playwright.config.ts`](../playwright.config.ts)
- Suite: [`e2e/responsive.playwright.ts`](../e2e/responsive.playwright.ts)
- Representative screenshots are emitted to ignored `test-results/` output;
  there are no pixel-perfect golden snapshots.

Run against a local seeded Supabase stack with:

```sh
supabase db reset --yes
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<local-publishable-key> \
bun run e2e
```

Install the browser once with `bunx playwright install chromium`. Use the
publishable key printed by `supabase status`; do not commit it.

The suite covers page-level overflow, shared header composition, Picker option
touch sizing, long-content wrapping, valid direct detail routes, mobile sticky
actions, URL-backed filter state after reload, console/page errors, Suggest
Store validation/error/success/close/Escape/focus return, and representative
review screenshots.

## Figma comparison

WM-33 rechecked the final Stores and Store Detail references before the
accessibility pass. The corrected frames expose the same intentional V1
content/design deviations already documented for unsupported data; no
responsive layout failure was found and no scope-expanding redesign was made.

| Screen       | Mobile   | Tablet   | Desktop  |
| ------------ | -------- | -------- | -------- |
| Stores       | `76:250` | `76:295` | `76:351` |
| Store Detail | `81:547` | `81:597` | `81:653` |

| Screen        | Status          | Notes                                                                                                                                                                                                                                                   |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home          | KNOWN DEVIATION | Responsive structure and overflow pass. Canonical truthful sections/copy differ from illustrative Figma sample content; unsupported rankings were not restored.                                                                                         |
| Search        | PASS            | Focused URL-backed Drink and Store search remains grouped, keyboard accessible, and responsive without the former editorial surface.                                                                                                                    |
| Stores        | KNOWN DEVIATION | Corrected final frames are list-first and include illustrative unsupported filters/map switching. The implementation keeps canonical supported filters, the map fallback, and the existing map/list order; responsive overflow and touch behavior pass. |
| Store Detail  | KNOWN DEVIATION | Corrected final frame includes illustrative opening status, distance, ratings, and contact content not supported by V1. Canonical detail, fallback map, directions, and mobile action remain responsive.                                                |
| Drinks        | FIXED           | Compact card layout and horizontal category row pass; long drink/brand/category text now wraps instead of clipping.                                                                                                                                     |
| Drink Detail  | KNOWN DEVIATION | Canonical availability and image fallback pass. Unsupported ratings, opening status, distance, flavour profile, and “best for” content remain omitted.                                                                                                  |
| Picker        | PASS            | Two-column mobile options, selected state, labels, draw action, and honest no-match states pass.                                                                                                                                                        |
| Picker Result | PASS            | Deterministic canonical result route, selected store/price, stale route, actions, and mobile sticky action pass.                                                                                                                                        |
| Suggest Store | KNOWN DEVIATION | No named current modal/sheet node was exposed by the connected Figma snapshot; the existing dialog contract was tested at reduced mobile height and desktop/tablet widths.                                                                              |

Desktop Figma references demonstrate dark tokens, but the public app has no
runtime theme switch or system-theme branch. QA confirmed viewport width does
not select a different theme; the current runtime remains its existing light
theme. This is documented rather than expanded into a new WM-32 feature.

## Responsive fixes

- Removed content-clipping `truncate`/overflow behavior from shared drink and
  store card names and metadata.
- Changed the public Drink Card from a fixed height to a compact minimum height
  so long names can wrap naturally.
- Applied the same wrapping behavior to Home store previews, Stores cards,
  Store Detail drink cards, and Drink Detail available-store cards.
- Restored trigger focus when Suggest Store closes through Escape.

No new product features, catalogue claims, map provider behavior, or theme
controls were added.

## Responsive findings

- Mobile 390px and narrow 375px Picker labels remained visible, wrapped safely,
  and retained touch-sized option containers.
- Tablet 768px preserved the desktop navigation threshold and Stores split
  layout without page overflow.
- Desktop 1280px and 1440px retained visible navigation and usable map/list
  proportions.
- All tested public routes had `scrollWidth <= clientWidth`; intentional inner
  horizontal chip rows remain scrollable.
- Suggest Store remained usable at a 390×520 keyboard-sized viewport. Validation,
  submission error, success, Escape, close, and focus return passed.
- Missing image metadata rendered stable fallback surfaces. Live valid/broken R2
  delivery was not integration-tested because R2 credentials are not configured.
- Google Maps browser key was unavailable, so Stores and Store Detail were
  verified through their canonical fallback map surfaces and usable links.

## Verification

- `bun run e2e`: 28 passed, 2 intentionally skipped duplicate intermediate
  matrix runs; 30 test cases across mobile/tablet/desktop projects.
- `bun test`: 63 passed.
- `bun run lint`: passed.
- `bun run typecheck`: passed.
- `bun run build`: passed for public and Admin apps; existing large-chunk
  warnings remain.
- `bun run format:check`: passed.
- `git diff --check`: passed.
- `supabase db reset --yes`: passed against local development data.
- `supabase db lint --local --schema public --fail-on error`: no schema errors.
- `supabase db advisors --local`: existing multiple-permissive-policy warnings;
  no WM-32 schema change was made.

## Remaining backlog

- Picker catalogue coverage remains incomplete for Matcha, Fruit Tea, and
  Refreshing; this is content readiness, not a responsive defect.
- Live R2 image upload/render verification remains outstanding.
- Live Google Maps rendering remains outstanding until a restricted browser key
  is configured.
- Existing public/Admin bundle-size warnings remain a separate performance item.

## WM-33 handoff

Focus the accessibility pass on semantic/contrast review of the shared header,
map fallback markers, filter dialogs, Picker radio group, sticky actions, image
fallback semantics, and Suggest Store modal announcements/focus containment.
