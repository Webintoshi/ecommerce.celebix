# Compact social platform selector

User requested recognizable social icons without taking more space in the manual
sales source dialog. The existing selection, optional reference, Apply/Cancel,
edit lock and focus behavior remain intact.

- Six pinned Simple Icons SVG paths are embedded locally; no new dependency,
  external font or runtime download. Manual uses Pencil; Other uses Ellipsis.
- Neutral 16 px icons with visible platform labels. Selected choice retains the
  existing orange treatment and `aria-pressed` state.
- Four columns on desktop, two at 640 px and below; minimum 44 px touch targets.
- Source scope: the sales console and its scoped stylesheet only. No API,
  contracts, financial calculations, authentication or provider configuration.

Verification:

- Existing sales console behavior suite: 42 passed.
- Customer panel TypeScript check: passed.
- Customer panel production build: passed. Independent visual review: passed,
  no actionable findings.
- Browser fixture at 1440, 1024 and 390 px: zero horizontal overflow and console
  errors; eight labeled decorative icons; one selected choice; Apply/Cancel,
  Escape and focus restoration passed.
- All six embedded SVG paths match Simple Icons 13.21.0 exactly. Provenance is
  recorded in `docs/licenses/social-platform-icons.md`.

Screenshots and measured results are private task evidence, outside versioned
product assets. Shared rollout uses the existing NET then SITE release transport
with an exact source pin and preserved native219 and payment authorities.
