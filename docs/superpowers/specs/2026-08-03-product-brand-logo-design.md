# Product Brand Logo Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı  
**Date:** 2026-08-03  
**Base:** `694c7f1603f7788bff539a687e6b34550b0e9dc9`

## Goal

Merchants can attach one durable, store-scoped logo to each catalog brand from the existing `/products/brands` administration flow. The product-detail storefront renders that logo in the brand position and never falls back to visible brand-name text when no logo is available.

## Decisions

- Reuse the existing PostgreSQL-backed, R2-published storefront asset authority.
- Upload brand logos as the existing `logo` storefront asset kind. Do not add another media table or accept an arbitrary public URL.
- Persist only an optional `logoAssetId` in the brand resource configuration. Preserve the existing optional `website` field.
- Keep the brand name and slug in the public product projection for accessible alternative text and the existing brand-search destination.
- Product-detail presentation is logo-only. If the selected brand has no valid active logo, render no brand surface.
- Do not use the store-wide design logo as an implicit product-brand fallback.

## Data and Authority Flow

1. The authenticated brand editor uploads a JPEG, PNG, or WebP file through the existing same-origin `/api/storefront-assets` endpoint with `kind=logo`.
2. Existing image validation enforces the current 5 MiB limit, bounded dimensions, real image bytes, supported media types, store-derived R2 object keys, and an authenticated persistent panel session.
3. The returned `StorefrontAsset.id` becomes `brand.config.logoAssetId`. The browser never supplies a store ID, object key, R2 origin, or public media URL as authority.
4. The catalog brand save continues through the existing catalog-admin repository and durable operation path.
5. A versioned PostgreSQL migration extends the public product projection. It resolves `logoAssetId` only when it is a canonical UUID referencing an active `logo` asset in the same persisted store.
6. The public product contract exposes an optional bounded `brand.logo` projection containing only `url`, `mediaType`, `altText`, `width`, and `height`.
7. The product-detail component renders the logo with the brand name as `alt` text and retains the brand-search link. Invalid, missing, archived, wrong-kind, and cross-store assets produce no public logo.

## Admin Experience

### Brand editor

- Show a `Marka logosu` field only for `kind="brand"`.
- Load active `logo` assets through the existing store-scoped asset API.
- Support upload, selection of an already uploaded logo, preview, replacement, and removal.
- Accepted formats are JPEG, PNG, and WebP, up to 5 MiB.
- A successful upload remains selected if the subsequent brand save fails, allowing a safe retry without another upload.
- Removal deletes `logoAssetId` from the brand configuration; it does not silently archive a potentially reused asset.
- Preserve current website, description, product relationships, optimistic version checks, authorization, and navigation behavior.

### Brand list

- Resolve `logoAssetId` against the authenticated store's active asset list.
- Show a contained thumbnail next to each brand name when available.
- Never render a remote URL copied directly from brand configuration.

## Storefront Experience

- The product-detail brand slot displays only the resolved logo.
- The logo is contained within a bounded desktop/mobile box and does not enlarge the purchase column.
- The logo link continues to search for the canonical brand name.
- Accessible name comes from the persisted brand name, not merchant-controlled HTML.
- No-logo products show no brand label, placeholder, broken image, or empty interactive element.
- The existing product title, SKU, price, quantity, cart, buy-now, gallery, and mobile layout contracts remain unchanged.

## Failure and Recovery

- Upload validation or storage failure leaves the brand record unchanged.
- An ambiguous storefront-asset write follows the existing single recovery behavior; there is no automatic second write.
- A catalog save failure does not publish an untrusted URL. An unattached uploaded asset remains tenant-scoped and can be selected on retry.
- An archived or missing logo is omitted from public projections without failing the whole product page.
- Cross-store IDs and wrong asset kinds resolve to no logo and disclose no asset metadata.

## Security Boundaries

- Tenant/store authority comes only from the persistent panel session and `TenantContext`.
- No browser-provided store ID, tenant ID, R2 key, hostname, forwarded header, or public URL selects the logo.
- PostgreSQL joins require exact `store_id`, active status, and `asset_kind='logo'`.
- The public contract rejects unknown logo fields, malformed URLs, unsupported media types, invalid dimensions, and non-canonical payloads.
- Image rendering uses an ordinary `img` element and never injects HTML or SVG markup.

## Test Strategy

- Contract tests: optional canonical logo accepted; malformed, over-broad, and unknown logo data rejected; no-logo compatibility retained.
- Admin tests: upload uses same-origin credentials and an idempotency key; only parsed active logo assets may be selected; remove/retry behavior is stable; no browser tenant authority appears.
- Repository/PostgreSQL tests: exact same-store active logo projects; missing, archived, wrong-kind, malformed, and cross-store references are omitted; migration rollback and reapply succeed.
- Storefront component tests: the product detail renders a logo-only brand link; brand name is used only as accessible text; missing logo renders no brand surface.
- Regression: catalog-admin, storefront assets, public storefront, storefront-shared, customer-panel, TypeScript, production builds, static-security scans, and `git diff --check`.
- Rendered acceptance: authenticated admin upload/preview/save and a fresh storefront product-detail load at desktop and mobile widths, with clean console and zero horizontal overflow.

## Delivery Boundaries

- No production deployment, credential mutation, unrelated dependency, `apps/admin/**` change, or store-wide design-logo rewrite.
- The implementation may add the versioned migration, manifest/assertions, focused contracts/repository/UI tests, admin brand UI changes, and storefront product projection/rendering changes required by this design.
- Staging deployment is a separate final action after local and disposable PostgreSQL verification pass.

