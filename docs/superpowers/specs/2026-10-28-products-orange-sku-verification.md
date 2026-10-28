# Product action color and SKU correction

The user requested orange action buttons and an unconstrained SKU presentation.
This deliberately overrides the visual system's default graphite primary action.
The existing product-list function inventory and Anti-slop during-mode direction
remain applicable: ENERGY2 / RHYTHM2 / MOTION1. No new behavior or assets.

## Scope and validation

Runtime scope is the list CSS module and one explicit CSS class added to the
existing create-product link. The entire TSX file is otherwise byte-identical to
accepted release3d7543e1f6a34ca64a9abc9cae9e187596009695. No API, controller,
permission, price, stock, ranking, global token, font or payment change.

- Orange `--cp-brand` fill and graphite `--cp-text-primary` labels/icons:
  computed4.668:1 normal-text contrast. White labels would fail; hover retains
  the same readable colors. Disabled bulk actions retain their disabled style.
- The component class follows the existing creation link into the desktop portal
  and mobile toolbar. Enabled bulk Apply and empty-state creation also use orange.
- SKU column expands96→192px, the tablet table minimum becomes1160px, inherited
  clipping/ellipsis are removed and long values wrap without losing characters.
  Mobile SKU keeps its full row and flexible value width.
- Actual browser1440/1024/390: zero document overflow. A labeled synthetic64-character
  SKU remains complete; a20-character SKU stays on one desktop line. Tablet table
  scrolling remains bounded. Mobile create action is orange.
- Browser-computed primary and enabled bulk colors are rgb(254,97,0) and
  rgb(43,43,43). Screenshots: task visualization directory,
  `products-orange-sku-{1440,1024,390}.png`.
- Existing five mounted product presentation tests and12 local transport tests
  pass. Only fixture data changes to exercise long SKU values; no merchant data writes.
- Independent Atlas review approves actual source and all three screenshots.

## Anti-slop delivery gate, root review

### Hard gate

- R-02 PASS: no new visible prose punctuation; unavailable-value presentation unchanged.
- R-03 PASS: measured zero page overflow at1440/1024/390, including64-character SKU.
- R-17 PASS: existing real metrics/data bindings unchanged.
- R-18 PASS: no testimonials or invented production people.
- R-23 PASS: no new assets/navigation; synthetic fixture values visibly labeled.
- R-24 PASS: original links unchanged.
- R-25 PASS: orange/graphite4.668:1, inherited graphite focus retained.
- R-26 PASS: exact same callbacks/routes, five mounted interaction tests pass.
- R-27 PASS: existing loading/error/empty behavior retained; empty action recolored.
- R-28 PASS: no FAQ.
- R-32 PASS: existing keyboard behavior unchanged; focus rules retained.
- R-33 PASS: source patches, no external UI replacement script.
- R-34 PASS: existing fixed light theme retained.
- R-35 PASS: actual UI run, action-state color checks and responsive screenshots;
  exact-candidate production build is separately bound before queuing.
- R-36 PASS: no new claims.
- R-37 PASS: user direction and inherited task inventory precede the correction.
- R-38 PASS: no fabricated production content.

### Purpose gate

- R-01 PASS: no glow or gradient.
- R-04 PASS: original relevant action icons unchanged.
- R-06 PASS: user-approved Urbanist and existing SKU typography retained.
- R-07 PASS: no background pattern.
- R-08 PASS: no new arrows.
- R-09 PASS: no new badges.
- R-10 PASS: no glass.
- R-12 PASS: no added shadows.
- R-13 PASS: no glow.
- R-14 PASS: existing task-led hierarchy retained.
- R-19 PASS: interaction-only motion unchanged.
- R-22 PASS: no new illustration.

### Liveliness

- Dials PASS:2/2/1 inherited and respected.
- Consistency PASS: compact operational screen retained.
- Focal point PASS: creation action receives the requested orange emphasis.
- Space PASS: SKU gets real comparison width; other facts remain readable.
- Accent PASS: orange emphasizes actual actions; secondary controls remain soft neutral.
- Identity PASS: existing font, canvas, graphitic navigation and product imagery retained.
- Design Read PASS: deliberate correction of the approved product-list direction.

### Craftsmanship and quality locks

- C-1 PASS: color follows direct human feedback; width removes actual truncation.
- C-2 PASS: behavior unchanged.
- C-3 PASS: no filler sections.
- C-4 PASS: long SKU, portal/mobile CTA and disabled/selected states verified.
- C-5 PASS: no fabricated claims or metrics.
- R-05 PASS: existing catalog composition preserved.
- R-11 PASS: no radius changes.
- R-15 PASS: existing concrete action labels retained.
- R-16 PASS: no new marketing language.
- R-20 PASS: product-specific comparison information remains primary.
- R-21 PASS: existing brand light theme retained.
- R-29 PASS: existing brand orange and graphite tokens only.
- R-30 PASS: no borrowed product shell.
- R-31 PASS: all visual changes have a recorded user/task reason.

Backend files changed: NONE. Publication uses fresh source-bound build, native,
provider, configuration and authenticated live evidence for both shared panels.
