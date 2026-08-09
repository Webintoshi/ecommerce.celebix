# Responsive Category Showcase Layout Design

Status: Kullanıcı tarafından yazılı olarak onaylandı

Date: 2026-08-09

## Goal

Replace the starter storefront's hardcoded tall category cards with a merchant-selectable, responsive category showcase. A merchant who uploads an asset as `Kategori görseli` must separately choose how those category images are presented on the homepage.

## Root Cause

The asset workspace currently records only the image role. The published `category_grid` section has no layout field, and the storefront renderer always applies four desktop columns with a `4 / 5` image ratio. Selecting `Kategori görseli` therefore cannot change the long vertical presentation.

Asset purpose and homepage composition are separate authorities:

- the asset record determines which durable image belongs to a category;
- the `category_grid` composition section determines how those category images are presented.

The implementation must preserve that separation.

## Approved Models

The existing homepage category section gains one finite layout choice:

```ts
type CategoryShowcaseLayout = "duo" | "grid";
```

### `duo` — İki büyük

- Desktop and tablet: two large cards per row.
- Mobile: one full-width card per row.
- Media ratio: `3 / 2` on desktop and `4 / 3` on mobile.
- Intended for an editorial, image-led jewelry storefront.

### `grid` — Grid

- Desktop: four cards per row.
- Tablet and normal mobile widths: two cards per row.
- Very narrow widths below 340px: one card per row.
- Media ratio: `1 / 1` at every width.
- This is the compatibility default for existing compositions and newly initialized stores.

Neither model may stretch the original asset. Storefront images use `object-fit: cover`, retain their focal center, and stay clipped inside the selected aspect ratio.

## Customer-Panel Experience

The layout selector belongs in the existing homepage composition editor, inside the category showcase section. It must not be placed in the R2 upload form.

The editor presents two visual choice cards rather than an abstract dropdown:

- `İki büyük` shows a two-column thumbnail.
- `Grid` shows a four-cell thumbnail.

The selected card has a clear border, check indicator, and concise responsive explanation. The existing heading and category selection controls remain available. A ten-year-old user should be able to understand the effect before saving.

The live preview must use the same normalized layout value as the public storefront. It must not maintain a separate browser-only preference.

## Contract and Persistence

The canonical starter-theme `category_grid` config becomes:

```ts
Readonly<{
  kind: "category_grid";
  enabled: boolean;
  heading: string;
  categoryIds: readonly string[];
  layout: CategoryShowcaseLayout;
}>
```

The public category-grid presentation carries the same exact layout value. Parsers accept only `duo` and `grid`; unknown strings, duplicate authority, and additional fields remain rejected.

Legacy compositions without `layout` normalize deterministically to `grid`. Existing stores therefore preserve a grid presentation while changing from the problematic vertical `4 / 5` crop to square cards. Saving or publishing the design persists the explicit normalized value.

No browser header, query parameter, cookie, local storage value, asset metadata, or image dimension may override the published layout.

## Storefront Rendering

The category renderer exposes the validated layout through a finite class or `data-layout` value. CSS owns responsive geometry:

- `grid`: 4 columns desktop, 2 columns tablet/mobile, 1 column below 340px, square media;
- `duo`: 2 columns desktop/tablet, 1 column mobile, wide media;
- no horizontal overflow at 320px;
- category title and call-to-action remain readable over every crop;
- focus, hover, reduced-motion, and 48px interactive-target behavior remain intact.

The existing category IDs, image bindings, public links, ordering, and exact tenant/store projection remain unchanged.

## Security and Compatibility

- Published PostgreSQL-backed theme composition remains the only storefront authority.
- Tenant/store identifiers do not enter browser-controlled state.
- R2 object ownership, category-asset binding, and asset validation are unchanged.
- Existing category links and accessibility names are preserved.
- No new dependency, external service, production configuration, credential, migration, or deployment is introduced by this design.
- Unsupported or missing layout data fails closed to the documented `grid` compatibility value; arbitrary CSS class injection is impossible.

## Testing

Implementation follows red/green TDD.

- Contract tests prove exact `duo` and `grid` acceptance, rejection of unknown values, immutable projection, and legacy `grid` normalization.
- Composition model tests prove new-store defaults and draft save/publish round trips.
- Customer-panel tests prove both visual selector cards, selected state, understandable help text, and preview parity.
- Storefront renderer tests prove the published layout is applied and asset/category ordering is unchanged.
- CSS/static tests prove exact desktop/tablet/mobile column counts, `3 / 2`, `4 / 3`, and `1 / 1` ratios, and the 340px single-column safety boundary.
- Responsive tests cover 320, 390, 768, 1024, 1025, and 1440px with zero horizontal overflow.
- Regression includes customer-panel and storefront tests, typecheck, production builds, static-security scans, secret scans, and `git diff --check`.

## Success Criteria

- Category images no longer render as unavoidable long vertical cards.
- Merchants can visually choose `İki büyük` or `Grid` from the homepage category section.
- The preview and live storefront render the same persisted selection.
- `duo` and `grid` adapt cleanly on mobile without overflow or unreadable overlays.
- Existing image assignments, category relationships, and tenant isolation remain intact.
- Existing compositions without the new field render as square `Grid` without manual repair.
