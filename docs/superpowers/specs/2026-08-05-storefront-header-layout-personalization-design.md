# Storefront Header Layout Personalization Design

Status: Kullanıcı tarafından yazılı olarak onaylandı

Date: 2026-08-05

## Goal

Give every merchant four bounded desktop header layouts in the existing starter-theme design workspace while preserving PostgreSQL storefront-design authority, the canonical navigation tree, the existing logo controls, and the fixed accessible mobile menu.

The feature must support these layouts:

1. `centered`: navigation on the left, logo centered, utilities on the right. This is the current layout and the backward-compatible default.
2. `logo_left`: logo on the left, navigation beside it, utilities on the right.
3. `logo_top`: logo centered on the first row, navigation centered below it, utilities on the first row at the right.
4. `menu_top`: navigation centered on the first row, logo centered below it, utilities on the first row at the right.

## Scope

In scope:

- one canonical `headerLayout` field in the schema-v2 starter composition and schema-v3 public presentation;
- strict parsing, defaults, immutable projection, and backward compatibility;
- a merchant-facing `Header yerleşimi` control in the existing starter-theme visual editor;
- an immediate admin preview of the selected arrangement;
- live storefront rendering for all four layouts;
- responsive, keyboard, reduced-motion, overflow, and minimum-target regression coverage;
- isolated customer-panel and shared-storefront staging deployment from one exact pushed SHA.

Out of scope:

- editing navigation labels independently of canonical categories;
- browser-owned menu or tenant authority;
- free-form grid/CSS input;
- per-breakpoint merchant layout overrides;
- a second header implementation;
- changes to `apps/admin/**`, Owner, migrations, DNS, production, or infrastructure.

## Canonical Contract

Add the finite type:

```ts
export type StarterThemeHeaderLayout =
  | "centered"
  | "logo_left"
  | "logo_top"
  | "menu_top";
```

`StarterThemeVisualV2` gains the required field:

```ts
headerLayout: StarterThemeHeaderLayout;
```

The schema-v2 composition parser accepts `headerLayout` as an optional input solely for legacy compatibility. When absent, it returns `centered`. When present, it must be exactly one of the four values. Unknown strings, non-strings, extra properties, getters, arrays, or prototype-altered objects remain rejected by the existing strict parser.

All new defaults, legacy projections, editor-normalization paths, and schema-v2-to-public-schema-v3 publication paths use `centered`. Existing persisted records therefore keep their current desktop arrangement until a merchant deliberately selects and publishes another layout.

Schema-v1 and public schema-v2 presentations continue rendering with `centered`; they are not migrated or rewritten.

## Authority and Data Flow

The authority chain remains:

```text
authenticated merchant action
  -> customer-panel design draft
  -> strict storefront composition parser
  -> existing publish operation
  -> durable PostgreSQL storefront-design publication
  -> public schema-v3 presentation
  -> CampaignHeader
```

No request header, hostname fragment, cookie, query parameter, local storage value, media URL, client breakpoint, or DOM attribute may become layout authority. The DOM `data-header-layout` value is only a projection of the validated durable presentation.

The existing canonical navigation tree remains the only source for menu items and nesting. Layout selection changes placement, never menu membership, category slugs, destinations, or authorization.

## Customer-Panel Experience

The existing `Görsel sistem` panel gains a control labelled `Header yerleşimi` with these Turkish labels:

| Value | Label |
| --- | --- |
| `centered` | Ortalı klasik |
| `logo_left` | Logo solda |
| `logo_top` | Logo üstte, menü altta |
| `menu_top` | Menü üstte, logo altta |

The control follows the current disabled/read-only authority. Changing it updates the draft through the existing immutable `patch` flow and updates the local preview immediately. It does not publish automatically; the existing single `Yayınla` action remains the only publication boundary.

The preview must show the same relative regions as the storefront:

- navigation;
- logo or store name;
- search/favorites/account/cart utilities;
- the selected one-row or two-row arrangement.

The preview uses the same finite data value and no free-form styles. It must remain comprehensible at desktop and mobile preview widths.

## Storefront Composition

`CampaignHeader` reads the layout only from the validated presentation:

- public schema version 3: `presentation.visual.headerLayout`;
- public schema version 2: `centered`;
- unsupported/schema-v1 campaign header behavior remains unchanged.

The server header places `data-header-layout` on the existing header root. `CampaignHeaderClient` retains one semantic DOM order and one navigation implementation; CSS grid areas control presentation. This avoids duplicate links, duplicate focus stops, hydration branches, or a second mobile-navigation authority.

Desktop grid behavior:

| Layout | Row 1 | Row 2 |
| --- | --- | --- |
| `centered` | navigation / centered logo / utilities | none |
| `logo_left` | logo / navigation / utilities | none |
| `logo_top` | centered logo with utilities at right | centered navigation |
| `menu_top` | centered navigation with utilities at right | centered logo |

The existing `headerWidth`, `headerStyle`, `logoSize`, and `logoAlignment` settings remain independent:

- `headerWidth` continues bounding the shared container;
- `headerStyle` still selects overlay or solid behavior;
- `logoSize` still supplies the bounded image height;
- `logoAlignment` controls the logo content inside its assigned area without changing the selected layout.

For centered stacked layouts, `logoAlignment` remains durable but the visual area itself is centered. Selecting `left` aligns the logo within its bounded logo area; it never moves utilities or navigation.

## Responsive Behavior

At viewport widths of `1024px` or less, all four desktop layouts collapse to the same trusted mobile header:

- logo/store name at the left;
- search, favorites, account, cart, and menu controls at the right as space permits under the existing compact rules;
- canonical menu content inside the existing modal drawer;
- no desktop navigation row;
- logo image maximum height `48px`;
- every interactive target at least `48x48px`;
- zero horizontal overflow.

Mobile behavior is not configurable. This prevents merchants from creating an unusable or authority-splitting mobile layout.

Desktop layouts must also preserve:

- keyboard traversal in semantic DOM order;
- hover and focus-within mega-menu access;
- Escape, backdrop, close-button, focus-trap, and focus-restoration behavior in the mobile drawer;
- approximately `0.01ms` transition duration under reduced motion;
- no cumulative layout shift from duplicated header trees.

## Overlay and Sticky Behavior

Both one-row and two-row layouts use the existing header root and bar:

- `overlay` covers the banner without inventing a second CSP or runtime path;
- non-home overlay pages remain opaque;
- the intersection sentinel continues switching to the fixed opaque header;
- both rows become part of the fixed header together;
- announcement-bar offset remains unchanged.

The two-row layouts may be taller on desktop, but their row heights must be bounded by the selected logo size plus a compact navigation row. They must not reserve a blank row when navigation is empty.

## Failure Behavior

- Invalid persisted or request values fail through the existing strict storefront parser.
- Missing legacy values normalize to `centered`.
- A failed design save or publish keeps the current durable publication and existing controlled error handling.
- A missing logo renders the canonical display name in the same selected layout.
- Missing navigation items do not produce an empty second row; utilities and logo remain usable.
- The storefront never guesses a layout from screen width beyond the fixed mobile breakpoint rule.

## Test Strategy

### Contract tests

- all four exact values parse and remain immutable;
- missing legacy value becomes `centered`;
- unknown, empty, case-altered, whitespace-altered, array, getter, and extra-property inputs fail closed;
- defaults and schema-v2-to-schema-v3 publication preserve `headerLayout`;
- legacy schema-v1/public-schema-v2 projections remain `centered`.

### Customer-panel tests

- the visual editor exposes the four labels and exact values;
- role-disabled/read-only behavior is preserved;
- immutable patching changes only `headerLayout`;
- preview projects `data-header-layout` and uses the four layouts;
- legacy editor fixtures normalize to `centered`;
- no browser tenant/store authority is introduced.

### Storefront tests

- schema-v3 forwards the durable layout and schema-v2 defaults to `centered`;
- one semantic header tree is retained;
- each layout has a bounded CSS grid-area rule;
- mobile resets all layouts to the existing compact structure;
- navigation URLs and active-path checks remain canonical;
- utilities, mega-menu, drawer, focus, and reduced-motion protections remain unchanged.

### Verification matrix

- `npm test --workspace @celebix/saas-contracts`;
- focused customer-panel composer/model tests;
- `npm test --workspace @celebix/customer-panel`;
- `npm test --workspace @celebix/storefront-shared`;
- typecheck for all three workspaces;
- customer-panel and storefront-shared builds;
- `git diff --check`;
- `apps/admin/**` diff count `0`;
- forbidden browser-authority and secret scans.

### Browser acceptance

Verify all four arrangements after isolated staging publication at:

- `1440x900` desktop;
- `1025x768` desktop boundary;
- `1024x768` mobile-shell boundary;
- `390x844` mobile;
- `320x720` narrow mobile.

For each relevant viewport record layout data attributes, actual logo/menu/utility rectangles, horizontal overflow, target sizes, console errors, and responsive fallback. Restore the merchant's original published layout after testing unless the user explicitly selects a new permanent layout.

## Git and Deployment Boundaries

- Continue on `codex/customer-panel-storefront-shortcut`.
- Use small reviewable documentation, contract, customer-panel, and storefront commits.
- Push without force-push.
- Deploy only the isolated staging customer-panel and shared storefront from one exact SHA.
- Do not deploy Owner or production.
- Do not modify migrations, infrastructure, credentials, DNS, or `apps/admin/**`.
