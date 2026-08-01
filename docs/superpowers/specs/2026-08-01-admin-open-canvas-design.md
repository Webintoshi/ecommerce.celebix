# Admin Open Canvas Design

## Goal

Replace the merchant admin's large rounded cards and nested boxed surfaces with a quiet, full-width working canvas. The interface should feel like an operational application: page identity stays in the fixed top bar, controls sit directly on the canvas, and data tables use spacing and dividers instead of decorative containers.

## Scope

This is a shared customer-admin presentation standard and therefore applies to every tenant, including Güzide Kuyumcu. It covers:

- list and table routes such as orders, products, customers, discounts, quick-order links, and operational records;
- detail routes that currently wrap an entire workflow in one large card;
- settings and forms that use oversized cards only as page decoration;
- desktop, tablet, and mobile layouts;
- loading, empty, error, and pagination states inside these routes.

It does not change backend APIs, live-data authority, tenant isolation, permissions, navigation, or workflow behavior.

## Approved Experience

### Open page canvas

The main content area is the page surface. A route must not add a second rounded, bordered, shadowed container around all of its content. Content uses the shell's shared horizontal gutters and begins with the first useful control, action, or data region.

The fixed top bar remains the only page-level identity. Body headings that merely repeat the route name, such as `Tüm Siparişler` under `Siparişler`, are removed. Subsection headings remain only when they distinguish genuinely separate tasks or datasets.

### Flat toolbars

Search, sorting, filters, column selection, and export actions sit in one or two full-width toolbar rows. Toolbars are separated from adjacent content by spacing or a single neutral horizontal divider; they do not have an outer border, rounded shell, shadow, or contrasting card background.

Inputs, selects, buttons, and menus retain their own boundaries because those boundaries communicate interactivity. Interactive targets remain at least 48 pixels high, preserve keyboard focus treatment, and keep existing accessible labels.

### Full-width data regions

Desktop tables sit directly on the canvas and use:

- one quiet table-header background;
- horizontal row dividers;
- optional row hover feedback;
- no surrounding card border, corner radius, or drop shadow;
- horizontal scrolling only when the available width cannot contain required columns.

Status badges may remain pill-shaped because their shape carries semantic state. Menus, popovers, dialogs, and alerts may retain contained surfaces because they must appear above or apart from the canvas.

### Mobile behavior

Mobile data must not become a stack of decorative cards. Each record becomes a full-width list row separated by a divider, with the most important identity and status first and secondary facts in a compact grid below. Filters may stack vertically, but the stacked controls remain on the page canvas without a surrounding card.

### Details, settings, and forms

Detail and form pages use vertical sections separated by whitespace or horizontal rules. A local bordered surface is allowed only when containment has functional meaning, for example payment-provider credentials, an irreversible-action warning, a drag-and-drop upload target, or a preview with its own visual boundary.

Decorative nesting is prohibited: a page card must not contain toolbar cards, table cards, or field-group cards. Existing business functionality and live values remain unchanged while the visual wrappers are removed.

## Shared Design Rules

The implementation introduces a shared open-surface convention rather than route-specific CSS overrides:

- page canvas: transparent or inherited background, zero outer border, zero outer radius, and zero outer shadow;
- section separation: spacing plus a single `#E8EDF4`-class divider when needed;
- content gutters: owned by the shared shell and aligned across routes;
- table rows: full-width with stable column alignment and neutral dividers;
- controls: individually bordered with existing Celebix orange emphasis for primary actions;
- semantic surfaces: overlays, alerts, previews, compact metrics, and status badges remain intentional exceptions.

These rules prevent broad selectors from accidentally removing necessary borders from inputs, dialogs, dropdowns, or accessible focus states.

## Initial Reference Implementation

The orders route is the visual reference for the shared migration:

1. Remove the `listSurface` card frame.
2. Remove the repeated `Tüm Siparişler` body heading.
3. Place primary search, status, and sorting controls directly in the first toolbar row.
4. Place date, payment, delivery, column, and CSV controls in the second toolbar row.
5. Separate the toolbar region and table with neutral dividers only.
6. Render the table directly on the canvas.
7. Convert mobile order cards into divider-based full-width rows.

The same shared convention is then applied to the remaining customer-admin routes without changing their data flow or actions.

## Component Boundaries

- `PanelPageShell` owns page gutters and the open canvas.
- `PanelPageHeader` continues publishing identity and actions to the fixed top bar without rendering duplicate body copy.
- Shared panel surface styles expose an explicit open-workspace primitive for lists, tables, forms, and details.
- Route components own only their functional layout: toolbars, fields, table columns, states, and actions.
- Existing compact components retain local containment only when it communicates a real boundary.

## Accessibility and Responsive Requirements

- Heading hierarchy remains valid after duplicate headings are removed; tables keep accessible labels.
- Every form control keeps a visible or screen-reader label.
- Focus indicators, minimum target sizes, keyboard menus, and status semantics remain intact.
- No toolbar control overlaps, clips, or forces the page wider than the viewport.
- Desktop tables remain tables; mobile records remain navigable full-width list rows with a clear detail action.

## Verification

- A failing-first component/style test proves that the orders list no longer renders the duplicate body heading or boxed list surface.
- Shared-style tests prove the open surface has no outer border, radius, or shadow while controls retain their borders and focus treatment.
- Responsive rendering tests cover desktop toolbars, table overflow, and divider-based mobile rows.
- Existing route and data tests prove that filtering, sorting, column selection, CSV export, pagination, and detail navigation still work.
- Browser verification covers Güzide Kuyumcu orders at desktop and mobile widths, followed by representative product, customer, settings, and detail pages using the shared convention.
- Browser console and network inspection show no new relevant errors.

## Acceptance Criteria

1. No customer-admin route wraps its entire working area in a decorative rounded card.
2. Page-level titles appear only in the fixed top bar; redundant body titles are absent.
3. Orders filters and table are full-width, aligned, and separated by dividers instead of an outer box.
4. Mobile order records use full-width divided rows rather than cards.
5. Inputs, buttons, menus, dialogs, alerts, previews, and semantic badges retain necessary functional boundaries.
6. Existing live data and all page actions behave exactly as before the visual migration.
7. The convention is shared across tenants and representative admin list, detail, form, and settings routes pass visual verification.
