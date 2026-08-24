# Public Web engineering instructions

Follow the repository-root `AGENTS.md` in addition to these Public Web-specific rules.

## Code Review Rules

### Responsive layout vs input capability

- Do not infer the active responsive layout from hover, pointer, or touch capability. Use the actual layout/breakpoint state to decide which UI surfaces are visible; use pointer/hover capability only for hover-specific affordances.
  Safe path: when behavior depends on whether Map and List are simultaneously visible, base it on the active responsive layout rather than `(hover: hover)` or `(pointer: fine)`.

### Hidden responsive surfaces

- A user action must remain actionable in the currently visible responsive surface. Do not programmatically scroll, focus, or depend on a companion UI surface that is hidden by the active breakpoint.
  Safe path: when Map and List become separate mobile views, marker selection must expose Store context/actions within Map view; document scrolling must remain stable.

### Discovery state continuity

- Responsive view changes must preserve the active discovery result state. Search, filters, Near Me, and Store visibility must remain consistent across List/Map switches, and selections that no longer exist in the filtered result set must not remain stale.
  Safe path: derive both result views from the same filtered Store collection and clear invalid selection state when that collection changes.
