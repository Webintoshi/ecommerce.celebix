# Categories implementation · 2026-09-26

## Delivered

Approved HTML direction implemented in the shared Customer Panel `/products/categories`:

- Exact `#f8f7f5` canvas, open list with thin separators, graphite actions, hidden page heading.
- Category tree, Turkish search, missing-image and archive filters, compact row actions.
- Desktop inspector; tablet/mobile modal sheet with inert background, focus trap, Escape and return focus.
- Controlled category draft, unsaved-change confirmation and captured original version.
- Persistent category image, alt text, upload/drop, existing category asset library, remove and retry.
- Image preparation centers a 3:4 frame with an encoded maximum of 1536 × 2048; supported input JPG/PNG/WebP up to 5 MB. No animation or additional frontend library.
- Explicit sibling ordering mode with drag handles, keyboard move buttons, save and cancel. Parent/child relationships are not changed by dragging.
- Collapsed SEO fields use existing `seo_category_entry` records. Custom canonical paths and draft status are retained. If category save succeeds and SEO fails, retry saves only SEO.
- Existing archive, deletion impact and explicit permanent-deletion confirmation remain connected to their existing server authority.

## Contract and storage

Atlas reviewed the required additive contract and SQL migration `202609260160_category_images_and_order`.

`CatalogCategory.image` is optional read data. Image writes carry only asset ID and alt text; an omitted image preserves the existing image, explicit null clears it. Asset ownership, category kind, active state and URL namespace are validated. Referenced category assets cannot be archived.

`POST /api/catalog/onboarding/categories/order` accepts complete active sibling sets and their original versions. All changed groups validate before any write. The operation ledger supports replay and uncertain-COMMIT recovery. Category create/update/archive/order clients retain the same proof for an unchanged retry after an uncertain response.

Category images are central category metadata. They do not automatically publish a category in the homepage showcase. Child navigation already uses category position; root navigation and homepage showcase retain the explicit order in design settings.

## Verification

- DOM behavior tests: read-only access/focus; media failure and editor scope; order cancel/save/full group/original versions; dirty-dialog cancellation; remote refresh versus captured version; partial category/SEO save retry.
- Media tests: invalid file rejection; preserved upload selection/proof and updated category alt text on retry.
- Pure helpers: image framing/file limits, category tree, sibling order payload and SEO metadata/retry preservation.
- Existing merchant API client tests pass.
- Atlas contract/data/client, HTTP/runtime, runtime-preflight and migration-source tests pass.
- Disposable PostgreSQL harness: 15 scenarios pass, including migration apply/assertions/empty rollback, image validation/preservation/clear, asset archive guard, atomic multi-group order, stale membership/version rejection, concurrent update winner and concurrent same-operation replay. No live database was used. The dedicated order-ledger immutable guard is tested against the actual migration-144 onboarding guard baseline.
- CUA browser checked the actual Manager in a temporary local in-memory fixture at 1440×1000, 1024×768 and 390×844. No horizontal overflow. Verified desktop save, dirty cancel retaining values, mobile Escape/focus restoration/inert cleanup, tablet 400px sheet, native drag-and-drop ordering save, missing-image filter and no console errors in the final test tab. Temporary fixture and public assets were removed.
- Shared storefront build passes including its TypeScript check. Legacy admin build passes with build-only public Supabase placeholders; this does not verify live login. No environment file changed. The separate legacy admin typecheck fails in untouched files (missing storeHost/Zoom/react-beautiful-dnd, null/undefined CategoryForm inputs, Stripe version and duplicate CategoryInfo exports); no category implementation/shared-package file appears in those diagnostics. That existing build configuration skips TypeScript validation.
- Customer Panel standalone `npm run typecheck --workspace @celebix/customer-panel` passes, exit 0. Final-source production rebuild passes, exit 0: webpack compiled in 37.8 s, TypeScript finished in 29.0 s, 90 static pages generated. No temporary QA route is present in the final route table.

## Release order

This coding task has not deployed or changed a live database.

1. Apply SQL160 and its assertions with the existing migration workflow before starting the new runtime; it requires the migration at preflight.
2. Update every instance serving the shared Customer Panel before the first category image is assigned. Old strict category parsers do not accept the new image projection.
3. Verify category image create/update/remove and ordering on the release tenants. Verify existing archive/delete impact and SEO permissions.

The down migration refuses rollback if image or order-ledger data exists. Preserve that data and use the project's reviewed rollback process; do not force-drop it.
