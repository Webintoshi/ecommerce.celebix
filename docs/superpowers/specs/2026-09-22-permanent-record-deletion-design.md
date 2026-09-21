# Permanent Record Deletion Design

**Date:** 2026-09-22  
**Status:** Approved design, pending implementation plan  
**Scope:** Customer Panel orders, products, and catalog categories

## Objective

Give an authorized merchant the final choice between reversible archiving and permanent deletion. Permanent deletion removes the selected record from the operational Celebix data model while keeping the database consistent, preventing cross-tenant effects, and leaving only a minimal immutable deletion audit record.

The platform must not replace the merchant's decision with a business-policy denial. Dependencies are shown as impact, then handled by the deletion workflow. Technical uncertainty, stale versions, authorization failure, or an incomplete cleanup still fail closed.

## User Experience

Order detail, product detail, and category management expose two distinct actions:

- **Arşivle:** reversible and unchanged from the existing behavior.
- **Kalıcı sil:** irreversible and available only to `store_owner` and `admin` memberships.

Permanent deletion uses one compact confirmation dialog:

1. Load a current server-owned impact preview.
2. Show the exact record, the records that will be deleted or detached, retained historical snapshots, and any external systems that will remain unchanged.
3. Require the merchant to type the current order number, product title, or category name.
4. Require one explicit irreversible-action checkbox.
5. Submit one idempotent versioned deletion operation.

The dialog must not expose tenant IDs, database identifiers, payment credentials, provider tokens, or internal dependency names. It uses merchant-language summaries such as “2 varyant ve 4 görsel silinecek.”

The record disappears only after the server reports a committed deletion. A pending or ambiguous result is never presented as success. Keyboard focus returns to the originating list after success and to the confirmation control after a recoverable failure.

## Authorization

Add two explicit merchant actions:

- `orders.delete`
- `catalog_admin.delete`

Only `store_owner` and `admin` receive these actions. `editor` and `analyst` never see deletion controls and receive a server-side `membership_denied` response if they call the endpoints directly.

Every request derives `TenantContext` from the existing server session. Browser-provided store, tenant, principal, membership, plan, role, or provider authority is rejected. Mutation origin, custom admin hostname, same-origin credential, request body, and operation identifier rules remain fail-closed.

## Shared Deletion Contract

All three record families use the same public concepts while retaining resource-specific implementations.

### Impact preview

```ts
type PermanentDeletionImpact = Readonly<{
  resourceKind: "order" | "product" | "category";
  resourceId: string;
  expectedVersion: number;
  confirmationLabel: string;
  effects: readonly Readonly<{
    kind: string;
    count: number;
    disposition: "delete" | "detach" | "retain_snapshot" | "external_unchanged";
  }>[];
}>;
```

The finite effect vocabulary is defined per resource in `@celebix/saas-contracts`. Unknown effects fail closed instead of being rendered as trusted text.

### Deletion command

```ts
type PermanentDeletionCommand = Readonly<{
  operationId: string;
  expectedVersion: number;
  confirmation: string;
}>;

type PermanentDeletionResult = Readonly<{
  resourceKind: "order" | "product" | "category";
  resourceId: string;
  deleted: true;
  auditId: string;
  replayed: boolean;
}>;
```

The server compares `confirmation` with the current canonical label after locking the record. A stale label or version returns a conflict and does not delete anything.

## Immutable Deletion Audit

Create one owner-controlled `saas.record_deletion_operations` ledger. Each committed operation stores only:

- store ID;
- deletion operation ID;
- resource kind and opaque resource ID;
- principal and membership IDs;
- committed timestamp;
- request fingerprint;
- finite outcome and replay metadata.

It stores no customer name, email, phone, address, product title, category name, order total, payment data, free-form reason, provider credential, or deleted row payload. Update, delete, and truncate are blocked by an immutable trigger. The app role receives execution access only through reviewed security-definer functions and receives no table access.

## Order Deletion

### Visible behavior

Every order can be selected for permanent deletion by an authorized owner or administrator, regardless of payment, fulfillment, or archive state. The impact preview clearly states that Celebix is deleting its local operational record and will not cancel, refund, void, ship, or otherwise mutate an external payment or fulfillment provider.

### Atomic database behavior

The deletion function locks the order and its deletion operation, verifies tenant ownership, version, confirmation, and idempotency fingerprint, then removes internal records in a declared order. The deletion set includes order-scoped notes, notifications, delivery attempts, shipping projections, archive state, ordinary order events, operation rows, order items, and the order record itself.

References from non-order aggregates are handled explicitly:

- converted draft records detach `converted_order_id` while retaining the draft audit history;
- recovered abandoned carts detach `recovered_order_id` and retain their own lifecycle state;
- analytics inputs that are derived from order tables disappear with the order and are not replaced with fabricated aggregates;
- cache entries for the exact store and order are invalidated after commit.

Foreign keys are changed only where necessary to support these documented detachments. No blanket `ON DELETE CASCADE` is added to shared commerce tables.

Provider calls are forbidden during deletion. A PayTR, Iyzico, cargo, email, or other external record may continue to exist outside Celebix after local deletion; the impact preview labels each detected provider family as `external_unchanged`.

## Product Deletion

### Existing foundation

The repository already contains product removal eligibility, versioned removal, operation fingerprinting, and safe media cleanup primitives. The Customer Panel route is currently a deliberate `404`, and the permanent-removal UI is disabled. Implementation reuses and extends this foundation rather than creating a second product deletion system.

### Deletion behavior

An authorized merchant can permanently delete an active, draft, or archived product. The UI internally archives an active or draft product as part of the same deletion workflow; the merchant is not required to perform a separate archive step.

Before relational deletion, every owned media object is unpublished and proven absent through the existing R2 cleanup saga. A storage failure leaves the operation retryable and the product hidden through existing archive state; it never reports deletion success and never repeats a confirmed object write.

Product variants, media metadata, merchandising profiles, category/brand/collection/tag relations, channel profiles, pricing policies, barcode records, and product-scoped operation records are deleted in the reviewed workflow. Past order lines retain their immutable title, SKU, quantity, price, currency, tax, discount, and other purchase snapshots while their live product or variant reference is detached. Past order content must not disappear merely because its catalog source was deleted.

The storefront and Customer Panel caches for the exact tenant and product are invalidated after commit. Storefront list, search, and direct product access must no longer offer the deleted product for sale.

## Category Deletion

An authorized merchant can permanently delete an active or archived category.

The impact preview reports linked products and child categories. Commit behavior is deterministic:

- product-category relations for the selected category are deleted; products remain unchanged;
- direct child categories are reparented to the deleted category's parent;
- if the deleted category is a root, its direct children become roots;
- sibling order is preserved, and collisions use the existing stable position plus ID ordering;
- storefront category showcase and design references to the deleted category are detached and surface as missing selections in draft design rather than silently selecting another category;
- the category record and category-scoped operation rows are deleted.

The workflow locks the selected category and direct children before applying reparenting. A concurrent category edit produces `version_conflict` and no partial tree mutation.

## API Surface

Add exact same-origin routes:

- `GET /api/orders/:orderId/deletion-impact`
- `POST /api/orders/:orderId/delete`
- `GET /api/catalog/products/:productId/deletion-impact`
- `POST /api/catalog/products/:productId/delete`
- `GET /api/catalog/onboarding/categories/:categoryId/deletion-impact`
- `POST /api/catalog/onboarding/categories/:categoryId/delete`

The existing disabled product `/remove` route and repository methods remain compatibility adapters during rollout. They must not create a second authorization or mutation path. Older callers either receive the existing response or delegate to the same internal deletion service after compatibility checks.

Responses are exact, `no-store`, secret-free JSON. Supported public errors are:

- `unauthenticated`
- `membership_denied`
- `not_found`
- `invalid_input`
- `invalid_confirmation`
- `version_conflict`
- `operation_mismatch`
- `cleanup_pending`
- `cleanup_failed`
- `unavailable`

Unknown repository or provider errors map to `unavailable` without reflecting database, storage, or provider details.

## Concurrency and Idempotency

Each deletion receives one UUID operation ID that is stable across retries of the same user intent. The database fingerprint binds store, resource kind, resource ID, expected version, and canonical confirmation value.

Lock order is deletion operation, parent resource, direct dependent resources, then shared relation tables. A replay with the same fingerprint returns the committed public result. Reusing an operation ID for another resource or payload returns `operation_mismatch`. Ambiguous network results trigger one read-only recovery; they never cause an automatic second destructive write.

## Compatibility

Archive and restore behavior remains available and unchanged. List and detail clients that do not know about permanent deletion continue to work. The new actions are additive to the authorization contract, and explicit role sets ensure editors and analysts do not inherit them.

No storefront API gains a deletion endpoint. Storefronts only observe the post-commit absence of deleted products and categories. No browser receives database or provider authority.

## Testing

Implementation must follow test-driven development and cover:

- action matrix for owner, administrator, editor, and analyst;
- exact request authority, custom admin domains, origin, session, and private-header rejection;
- impact preview parsing and unknown-effect rejection;
- typed confirmation, stale version, operation replay, mismatch, and ambiguous recovery;
- disposable PostgreSQL deletion for active and archived orders, products, and categories;
- paid, shipped, refunded, inventory-adjusting, externally referenced, and archived order deletion without provider calls;
- order draft and abandoned-cart detachment;
- product media cleanup success, failure, replay, and eventual relational deletion;
- preservation of historical order-line snapshots after product deletion;
- category product detachment, child reparenting, root deletion, ordering, and concurrent edit conflict;
- tenant isolation and cross-store opaque not-found behavior;
- exact cache invalidation and storefront absence;
- keyboard, focus, responsive confirmation dialog, loading, error, and success states;
- legacy client compatibility for the existing product removal surface.

Affected validation includes shared contract tests, data repository tests, SQL assertion and disposable PostgreSQL suites, Customer Panel tests/typecheck/build, storefront contract regressions, and an independent deletion-focused review.

## Rollout

Ship contracts and database support before enabling UI controls. The feature remains hidden until all required functions pass runtime preflight. A deployment must not perform a deletion automatically and must not change payment credentials, provider modes, DNS, migration hooks, or Auto Deploy settings.

Live acceptance uses newly created disposable QA records only. It must not delete an existing customer order, product, category, payment, shipment, or media object without a separate exact-record instruction from the user.

