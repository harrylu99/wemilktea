# WM-33 Accessibility QA

Reviewed 14 August 2026 against WCAG 2.2 AA-oriented web accessibility
practices. This is an engineering QA pass, not a formal WCAG audit or
certification.

## Scope

Reviewed the eight public routes and the Suggest Store flow:

- Home `/`
- Search `/search`
- Stores `/stores`
- Store Detail `/stores/gong-cha-newmarket`
- Drinks `/drinks`
- Drink Detail `/drinks/gong-cha/brown-sugar-pearl-milk-tea`
- Daily Picker `/picker`
- Picker Result `/picker/result/gong-cha/brown-sugar-pearl-milk-tea?store=gong-cha-newmarket&craving=milk-tea`
- Suggest Store open, invalid, success/error-capable, Escape, and close states

Shared public Header, search fields, filter/category controls, Drink and Store
Cards, image fallbacks, map fallbacks, sticky actions, Picker controls, loading
and error states, and the Suggest Store dialog were included.

WM-33 also rechecked the corrected final Figma references before this pass:

| Screen       | Mobile   | Tablet   | Desktop  |
| ------------ | -------- | -------- | -------- |
| Stores       | `76:250` | `76:295` | `76:351` |
| Store Detail | `81:547` | `81:597` | `81:653` |

## Automated tooling

- Playwright Chromium, using the WM-32 configuration and projects for 390px,
  768px, and 1280px viewports.
- `@axe-core/playwright` `4.13.0` via
  [`e2e/accessibility.playwright.ts`](../e2e/accessibility.playwright.ts).
- Nine representative axe scans per browser project: eight public routes plus
  the open Suggest Store dialog.
- The final suite contains 19 tests across three projects: 27 axe scans plus
  route-title, state, focus, reduced-motion, and journey checks; 57 cases
  passed.
- No axe rules were disabled or broadly excluded.

Run the dedicated suite against local seeded data with:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<local-publishable-key> \
bun run e2e -- e2e/accessibility.playwright.ts
```

## Manual keyboard QA

Keyboard-only browser journeys completed:

- Home → Search result → Drink Detail → Store Detail.
- Home → Stores → Suggest Store → invalid submission → Escape/close.
- Home → Picker → choose a craving → draw → Picker Result → View drink → Pick
  again.
- Mobile menu open, navigation, Escape, and trigger focus restoration.
- Stores filter disclosure open, Escape, and trigger focus restoration.

The Picker uses native radios with visible custom labels, retains one selected
option, and keeps the no-match recovery message and Surprise Me option
available. Reduced-motion browser emulation skips the draw transition.

## Semantics

- Each rendered public route exposes one primary `h1` and a primary `main`.
- The shared Header uses `header`, labeled `nav` landmarks, native links for
  navigation, and native buttons for actions. Active `NavLink` items expose the
  current page state through React Router's `aria-current` behavior.
- Mobile menu state now exposes `aria-expanded` and `aria-controls`; Escape
  closes it and returns focus to the trigger.
- Search controls have programmatic names. On routes without an inline search
  field, Header Search is a real link to Search rather than a no-op button.
- URL-backed category/filter buttons expose `aria-pressed`. Picker choices use
  native radio semantics within a fieldset and a visible text label; decorative
  craving icons are hidden from assistive technology.
- Drink and Store Cards are direct semantic links with meaningful product/store
  context. No clickable outer `div` or duplicate nested navigation target was
  introduced.
- Store Detail's sticky directions action is contained in a labeled
  complementary landmark so it remains associated with the page structure.

## Forms/dialogs

Suggest Store retains the existing modal behavior with `role="dialog"`, an
accessible title, `aria-modal`, initial close-button focus, Tab/Shift+Tab
containment, Escape close, and trigger focus restoration. The focusable list
excludes the hidden honeypot field.

All six visible fields have programmatic labels. Required Store name and
Suburb/area fields expose native required state while the form keeps custom
validation in control. Invalid submission sets `aria-invalid`, associates the
field error with `aria-describedby`, keeps errors visible, and moves focus to
the first invalid field. Submission progress disables duplicate submission;
success is announced through the existing polite live region and exposes a
clear return action.

The Stores filter is an inline disclosure rather than a modal dialog. Its
trigger exposes `aria-expanded`/`aria-controls`; Escape closes it and restores
focus without trapping unrelated page navigation.

## Picker

Native radio inputs remain in the accessibility tree despite visual hiding.
The redundant per-option live “Selected” message and extra radiogroup role were
removed so checked state is announced once by the native control. Picker
drawing and no-match messages use focused status/alert regions rather than
announcing the decorative stage repeatedly. Picker Result fortune text is
content, not an automatic alert. Reduced-motion users bypass the visual draw
transition.

## Images

Informative permitted product/store images retain concise metadata-derived alt
text, falling back to the product/store name when canonical alt text is absent.
Decorative fallback artwork, map surfaces, expressive Picker icons, and
redundant placeholder labels are hidden with `aria-hidden="true"`. The readable
store address and directions link remain outside the visual map fallback, so
location use does not depend on map graphics. Live R2 delivery and live Google
Maps DOM remain release QA items because their credentials are not configured
locally.

## Focus

Global `:focus-visible` styling remains present and was exercised on links,
buttons, radios, fields, dialog controls, and sticky actions. The Drink Detail
Find this drink action scrolls to and focuses the Available at heading while
respecting reduced motion. Sticky actions remain in normal keyboard order and
do not create a focus trap. Route titles and page headings update on direct and
SPA navigation; no tested journey left focus on a removed control.

## Contrast

The initial axe pass found repeated serious `color-contrast` failures in
decorative fallback labels: brand green `#526B50` on warm fallback surfaces
measured between `1.53:1` and `3.59:1`. These labels are decorative, but their
rendered text still failed automated contrast checks. The fallback label color
was changed to `#111711`; the final axe scans report no contrast violations.

No runtime dark-theme switch was added. The currently reachable runtime is the
existing light theme; dark design tokens remain outside this ticket.

## Automated findings

Initial axe findings were resolved as follows:

- `FIX NOW` — repeated fallback-label contrast failures: corrected shared
  fallback label usage across Home, Search, Stores, Drinks, Drink Detail, and
  Picker Result.
- `FIX NOW` — Store Detail mobile sticky action was outside a landmark: wrapped
  the action in a labeled complementary landmark.
- `FIX NOW` — Stores and Drinks lacked route-specific document titles: added
  `Stores | WeMilktea` and `Drinks | WeMilktea`.
- `FIX NOW` — Header Search was a no-op on routes without an inline search:
  those instances now navigate to Search.
- `FIX NOW` — mobile menu and Stores filter disclosure lacked complete Escape
  and focus-return behavior: added controlled-state metadata and restoration.
- `FIX NOW` — Suggest Store invalid submission left focus on the submit button:
  focus now moves to the first invalid field.
- `NO ACTION` — map marker buttons remain exposed because they have meaningful
  “Show [store] on the list” actions; purely visual map surfaces remain hidden.

## Responsive carry-over

Stores and Store Detail were rechecked against the corrected final frames:

```text
Stores       76:250 / 76:295 / 76:351
Store Detail 81:547 / 81:597 / 81:653
```

No responsive carry-over defect was found in this prerequisite check.
The corrected frames' list/map order and illustrative unsupported metadata remain
documented as design/data deviations in [`RESPONSIVE_QA.md`](./RESPONSIVE_QA.md),
not WM-33 accessibility bugs.

## Known limitations

- This report does not claim WCAG certification or replace assistive-technology
  testing with NVDA, JAWS, VoiceOver, or TalkBack on release builds.
- Google Maps keyboard/screen-reader behavior must be verified when the live
  restricted browser key is configured. The current fallback is usable without
  live Maps.
- R2 image success/error and final alt metadata must be verified against live
  deployment objects.
- Picker Matcha, Fruit Tea, and Refreshing coverage remains catalogue work, not
  an accessibility defect.

## Release recommendations

Before launch, repeat the axe and keyboard suites against the deployed public
origin, inspect real R2 image failures and alt metadata, and verify the live
Google Maps boundary separately. Include a short VoiceOver or equivalent
screen-reader smoke pass on Home, Picker, Store Detail, Drink Detail, and
Suggest Store.

## WM-34 handoff — Deployment

Deployment is not started by WM-33. WM-34 should prepare:

- **Production environment:** separate public and admin Cloudflare Workers
  with Static Assets, Wrangler SPA fallback, Bun build output `dist`, and production
  Supabase project URL/keys.
- **Supabase Cloud:** apply reviewed migrations in order, load the approved
  production seed/catalogue expectations, configure Auth site/redirect URLs for
  Admin, verify RLS/public publication boundaries, and deploy the required Edge
  Functions.
- **Cloudflare Workers:** public config `apps/web/wrangler.jsonc`, admin config
  `apps/admin/wrangler.jsonc`, build command `bun run build`, and assets directory
  `dist`.
- **Public browser variables:** `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_R2_PUBLIC_BASE_URL`, and the restricted
  `VITE_GOOGLE_MAPS_BROWSER_KEY` for the public app. The admin app needs the
  Supabase pair and browser-safe R2 base URL.
- **R2:** configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL` only as
  server-side Edge Function secrets; verify upload, read, replacement, and
  fallback behavior with permitted objects.
- **Maps:** create a restricted browser key with HTTP referrers and only the
  required Maps APIs; verify Stores and Store Detail map rendering and
  keyboard fallback behavior.
- **Edge Function secrets:** configure `GOOGLE_PLACES_API_KEY` and exact
  `ADMIN_APP_ORIGIN` for discovery, plus the R2 values for `image-storage`.
  Never place service-role, Places, or R2 secrets in Vite variables.
- **Migration/seed:** run migrations through the Supabase deployment workflow,
  verify published canonical brands/locations/products and location prices, and
  confirm Picker Result deterministic routes against current RLS.
- **Release smoke tests:** direct-load every public route, search/filters,
  Store Detail directions/share, Drink Detail Find this drink, Picker → Result
  → View drink/Pick again, Suggest Store invalid/success/error, R2 image
  fallback, and Maps fallback/live rendering.
- **Regression commands:**

  ```sh
  bun test
  bun run e2e
  bun run e2e -- e2e/accessibility.playwright.ts
  bun run lint
  bun run typecheck
  bun run build
  bun run format:check
  git diff --check
  supabase db lint --local --schema public --fail-on error
  supabase db advisors --local
  ```
