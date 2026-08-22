# Customer Panel Remaining Pages Visual Refresh

## Objective

Bring the merchant admin pages that have not received a dedicated visual pass into the established Celebix admin language without changing any feature, permission, request, mutation, route, or data contract.

## Scope

The work covers the remaining product operations, discounts, marketplaces, accounting, SEO, settings, content and marketing editors, draft-order editor, print view, setup, login, and unauthorized surfaces.

The first implementation package covers:

- Shared list and record-editor presentation used by discounts, marketplaces, accounting, SEO, content, marketing, administrators, and notifications.
- Catalog resource list and editor presentation used by collections, brands, attributes, extras, definitions, and product tags.
- Operational product surfaces for reviews, barcode labels, purchasing, inventory counts, transfers, price lists, and bulk upload.

Later packages cover the remaining settings, draft-order and system surfaces after the first package is visually verified.

## Visual Direction

- Preserve the current light Celebix admin palette and `#FE6100` primary accent.
- Use white operational surfaces on the existing neutral page background.
- Use restrained 6-8px radii, light borders, and minimal elevation.
- Keep page headings compact and appropriate for a working admin tool.
- Prefer open page sections, tables, toolbars, and form sections over decorative card grids.
- Keep destructive actions visually separated from primary actions.
- Maintain deliberate desktop density while providing clean 768px and 390px responsive layouts.
- Reuse the existing Lucide icon family; do not introduce decorative artwork or gradients.

## Component Treatment

### Lists

- Standardize page header, count context, search/filter toolbar, row hierarchy, status treatment, and action alignment.
- Keep real columns and values unchanged.
- Preserve every existing row action and destination.
- Convert to responsive stacked rows only where the existing table cannot fit safely on small screens.

### Forms

- Group existing fields into visually clear sections without changing field names, defaults, validation, or submission.
- Standardize labels, help text, input heights, focus states, and sticky or footer actions where already supported.
- Do not introduce wizard steps, new fields, autosave, or changed save behavior.

### States

- Normalize loading, empty, error, disabled, and read-only presentation using existing state components.
- Keep existing messages and recovery actions unless a purely presentational wrapper is required.

## Behavior Guardrails

- No backend, API, database, migration, authentication, payment, order, or storefront changes.
- No new actions, filters, metrics, fields, routes, fake data, or feature flags.
- No changes to fetch calls, hooks, state transitions, permission checks, event handlers, form parsing, or submit payloads.
- No store-specific hardcoding.
- Existing links, archive/delete behavior, save behavior, and disabled states remain byte-for-byte equivalent wherever practical.

## Implementation Boundaries

Allowed files are limited to `apps/customer-panel/**` presentation components and CSS modules required by the selected page package. Shared components may be adjusted only when every consuming screen remains behaviorally unchanged.

The implementation should favor CSS changes and small semantic wrappers. Logic-bearing TSX sections must not be refactored merely for style.

## Verification

- Review the diff to confirm presentation-only scope.
- Run customer-panel typecheck and focused component tests affected by markup changes.
- Run the local customer-panel and inspect representative list, form, empty, loading, and error states.
- Check desktop, 768px tablet, and 390px mobile for overflow and action collisions.
- Confirm existing buttons, links, handlers, fields, and request payload construction remain unchanged.
- Do not deploy as part of this visual implementation unless separately directed.

## Acceptance Criteria

- Remaining screens read as one Celebix merchant operating system rather than disconnected modules.
- Tables and forms are faster to scan and remain operationally dense.
- No feature behavior or data flow changes.
- No horizontal page overflow at the target responsive widths.
- No unrelated files or parallel worktree changes are included.
