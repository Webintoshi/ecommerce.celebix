# Customer Panel Products Complete Design

## Decision

Extend the existing catalog, catalog-onboarding, and media boundaries additively. Keep tenant authority in the authenticated server session, preserve migrations 001 through 116 byte-for-byte, and deliver the complete product workflow in one branch and one pull request.

## Product editing

`ProductDraftSession` is the single browser-owned draft boundary for product creation. It retains product fields, merchandising choices, variant drafts, selected `File` objects, and media alt text while the merchant switches between quick and advanced create. Drafts remain in memory only and are never encoded into URLs, cookies, local storage, or session storage.

Every mutable product form uses a shared dirty-state/navigation guard. Browser unload, link navigation, mode switches, cancel buttons, and modal dismissal must require explicit confirmation when unsaved values exist. Successful persistence resets the guard.

On optimistic version conflict, the submitted local draft remains rendered. The latest server projection is fetched into a separate snapshot. The merchant may continue editing the local draft, compare it with the server snapshot, or explicitly replace it with the server version. No conflict path silently overwrites or closes a form.

Product merchandising has its own `loading`, `ready`, and `error` states and a retry command. A merchandising outage does not hide the base product detail.

## Product list and bulk lifecycle

Global search, filters, and sort continue to use `catalog_list_products_v3`. The HTTP and client contracts add page sizes 20, 50, and 100. The UI keeps a cursor stack, exposes previous and next navigation, restores the page size and page cursor from URL state, and clears cursor history whenever the query dimensions change.

Migration 117 adds one atomic bulk mutation and safe-removal projection. Bulk commands bind one idempotency operation, every product ID and expected version, the authenticated store, and a finite action (`active`, `draft`, or `archive`). One invalid, unauthorized, cross-tenant, or stale item aborts the whole transaction. Owner/admin may archive; editor may publish/draft only; analyst cannot mutate.

Permanent removal remains unavailable unless the server eligibility projection proves that the archived product has no order, inventory, purchasing, transfer, pricing, storefront, or pending media-cleanup dependency. The final removal function repeats the proof while holding the product lock. Ineligible products remain archived.

## Media lifecycle

Migration 118 changes media archive from immediate physical destruction to a retention lifecycle: `active -> archived -> cleanup_eligible -> object_deleted`. Archived media retains its object during the fixed retention window and may be restored with its version. Cleanup first proves eligibility in PostgreSQL, then deletes the exact tenant-namespaced object through the existing storage adapter, then records deletion proof. A missing proof never removes durable metadata.

The media list can explicitly include archived entries for authorized managers. The UI shows retention status, restore, and cleanup eligibility without exposing object keys.

## Storefront preview

The server projects the verified primary storefront hostname with the product. Active products open the canonical storefront URL directly. Draft products use a five-minute HMAC-SHA-256 capability token bound to store ID, product ID, principal ID, product version, issue time, and expiry. The token is issued and verified only by Customer Panel server modules with a dedicated keyring and domain-separated preimage. The authenticated preview page revalidates the current session and exact binding before rendering a customer-facing product projection. Tokens are never logged or persisted, so migration 119 is unnecessary.

## Security and compatibility

- Store owner and admin: create/edit, bulk publish/draft, archive/restore, and eligibility-gated permanent removal.
- Editor: create/edit and bulk publish/draft; archive, restore, and permanent removal denied.
- Analyst: read only.
- Unauthorized mutation returns 403 before repository access.
- Cross-tenant IDs return the same 404 result as missing IDs.
- Old application code remains valid against migrations 117 and 118.
- Code-only rollback leaves migrations 117 and 118 installed and preserves old catalog/media APIs.
- `apps/admin/**`, production infrastructure, historical migrations, and unrelated modules remain unchanged.

## Rollout

After merge, verify Customer Panel Coolify application identity, configured branch, and current SHA. Resolve only staging build configuration blockers without logging secrets. Take and restore-test a staging database backup. Apply 117 then 118 before deploying the exact merge SHA. Verify health, running SHA, browser console/network cleanliness, the complete role matrix, cross-tenant denial, and controlled `ATLAS-QA-PRODUCT-<timestamp>` workflows. Clean up or safely archive every QA product.
