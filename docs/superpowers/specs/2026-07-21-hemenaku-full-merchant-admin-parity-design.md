# Hemenaku Full Merchant Admin Parity Design

**Date:** 2026-07-21

**Status:** User-approved for continuous implementation

**Implementation branch:** `codex/hemenaku-admin-presentation-transplant-implementation`

**Implementation starting point:** `cf7b0eecf708ce833918195c7cc542f79499d4aa`

**Immutable read-only donor:** `apps/admin` from `fc6c5318b47f045a7cefcedc7612d5b10563ba32`

**Target:** `apps/customer-panel`

## 1. Outcome

Build the shared merchant administration product in `apps/customer-panel` with the same information architecture, presentation language, responsive behavior, and supported merchant workflows as the pinned Hemenaku admin donor. This is a controlled transplant, not a second admin application and not a runtime dependency on `apps/admin`.

Parity means all donor menu families become real tenant-scoped vertical slices:

1. Giriş / dashboard
2. Siparişler: all orders, quick order, abandoned carts
3. Müşteriler: all customers, segments, tags, new customer
4. Ürünler: all products, new product, collections, brands, attributes, extras, reviews, definitions, bulk upload
5. İndirimler: all discounts, new discount, lucky wheel
6. Pazarlama: overview, email, phone, WhatsApp
7. İçerik: blog, pages, policies
8. Pazar Yerleri
9. Ayarlar: general, language, payment, shipping, administrators
10. Muhasebe: overview and invoicing integration
11. SEO Araçları: SEO control, sitemap, social preview, code integrations, fast indexing

The existing shell, dashboard, product, variant, media, session, and `TenantContext` implementation remains the foundation. A navigation destination is activated only in the same reviewed slice that supplies its persistent authority, API, error states, and security tests.

## 2. Non-negotiable boundaries

- `apps/admin/**` stays byte-for-byte unchanged and is read only through `git show fc6c5318...:<path>`.
- The current working-tree version of `apps/admin` is not donor authority; it differs materially from the pinned donor.
- The only browser-facing merchant application is `apps/customer-panel`.
- No donor/admin iframe, reverse proxy, `/api/admin/**` bridge, `apps/admin-shared`, Supabase client, legacy Logto admin session, or donor database adapter is introduced. A provider-owned payment iframe is permitted only when an official payment protocol requires it, only on a public checkout route, and only with exact-origin CSP, server-owned configuration, and callback-authoritative settlement; it is never a vehicle for the donor or another admin application.
- Authority remains `__Host-celebix_panel` -> durable PostgreSQL session -> current membership/store revalidation -> server-only `TenantContext`.
- Browser requests never provide tenant/store/principal/membership IDs or authority headers.
- Full `TenantContext`, identity subjects, tenant/store/principal/membership/plan and other authority UUIDs, database configuration, secrets, or provider material never cross into client components or browser payloads. Narrow opaque resource IDs required by a real merchant action, such as a catalog variant or quick-order link ID, may cross only in safe DTOs and are always reauthorized server-side; they are never tenant/store authority.
- State-changing same-origin APIs require exact Origin validation and fail closed.
- Production deployment, production data/credential mutation, and merge remain outside this implementation program.
- No menu entry, KPI, record, send operation, integration status, or success state is fabricated.

## 3. Architecture

Each missing domain follows one repeated vertical-slice boundary:

```text
immutable shared contract
  -> store-scoped PostgreSQL schema and assertions
  -> SECURITY DEFINER functions with explicit role/feature checks
  -> constrained @celebix/saas-data repository
  -> customer-panel server runtime preflight
  -> authenticated same-origin HTTP handler
  -> immutable browser DTO and command client
  -> donor presentation adapter
  -> navigation activation
```

Presentation components consume immutable view models and command ports. They never import repositories or `TenantContext`. Every server repository call receives `TenantContext` and derives store, membership, plan, and feature authority from it.

The current catalog/media modules remain independent. New domains reference products through store-composite authority and snapshot names/prices where historical correctness requires it; they do not reach the legacy `public` schema.

## 4. Shared action policy

The shared roles are `store_owner`, `admin`, `editor`, and `analyst`. Legacy donor roles are presentation reference only.

| Role | Read | Operational mutation | Configuration/integration | Destructive/archive |
| --- | --- | --- | --- | --- |
| `store_owner` | all enabled modules | allowed | allowed | allowed |
| `admin` | all enabled modules | allowed | allowed except ownership/staff-owner changes | allowed with version/idempotency proof |
| `editor` | catalog/content/customer/order operational views | catalog/content and fulfillment operations only | denied | archive only where explicitly granted |
| `analyst` | read-only enabled reports, catalog, orders, customers | denied | denied | denied |

Database functions enforce actions; hiding a control is never authorization. Every denial has a stable safe outcome and leaves no mutation.

## 5. Persistence conventions

- Every tenant-owned row contains `store_id` and every foreign relationship that crosses tenant data uses a store-composite key.
- Every merchant mutation uses an operation UUID, canonical fingerprint, immutable result payload, and replay/conflict behavior.
- Mutable records have monotonic versions and optimistic concurrency.
- Financial values are integer minor units plus a canonical three-letter currency; floating-point money is forbidden.
- Order/customer/content history uses immutable events or snapshots where later source edits must not rewrite history.
- Deletes are soft archive/revoke unless the domain has a separately proved privacy deletion workflow.
- Workers and webhooks require store-owned idempotency, signed input authority, bounded claiming, retry state, and audit-safe payloads.
- All list endpoints are bounded, cursor-based, deterministically ordered, and store filtered.
- SQL roles keep direct table writes denied to `celebix_saas_app`; the app uses the approved function surface only.

## 6. Domain delivery order

### Slice A — shared policy and orders

Add the reusable action decision, order/customer snapshot model, order items, immutable order events, internal notes, status/payment/shipping transitions, export projection, quick-order payment links, and abandoned-cart read/archive state. Deliver this as three reviewed sub-slices: A1 core order list/detail, A2 quick-order link management plus public storefront redemption, and A3 abandoned carts. A destination becomes visible only after its own repository and HTTP isolation pass; the parent group may appear as soon as its first genuine child is active.

### Slice B — customers

Add store-scoped customers, addresses, consent, notes, tags, segments, import/export, activity summary, and privacy-safe archive. Activate the donor `Müşteriler` group.

### Slice C — remaining product administration

Extend the existing catalog authority with collections, brands, attributes, customization extras, reviews/moderation, definitions, and durable bulk-import jobs. Preserve existing product/variant/media behavior. Activate every pinned donor product submenu only when backed.

### Slice D — discounts and promotions

Add discount rules, eligibility, coupon usage, lifecycle, and lucky-wheel configuration/prize/spin audit. Activate `İndirimler`.

### Slice E — content and typed storefront settings

Add blog, pages, locked policy identities, publication versions, localized content, general settings, language, shipping, payment configuration, and administrator membership management. Activate `İçerik` and `Ayarlar` destinations incrementally.

### Slice F — marketing and analytics

Add consent-scoped audience selection, campaigns, templates, delivery attempts, provider-safe jobs, abandoned-cart recovery, and real analytics aggregates. Phone/WhatsApp are not marked send-capable until a provider adapter and delivery log exist.

### Slice G — marketplace, accounting, and SEO

Add encrypted provider connections, store-owned sync jobs, marketplace listings/orders, invoice/payment reconciliation, verified sitemap/code state, social projections, and signed indexing jobs. External network execution remains disabled by default and separately activated per environment.

### Slice H — final dashboard and parity gate

Replace every current unsupported dashboard slice only with durable aggregate results. Complete exact donor navigation, responsive states, keyboard/focus behavior, permissions, screenshots, security scans, and full regressions.

## 7. First visible slice: Orders

The complete order family uses these target routes:

- `/orders`
- `/orders/quick-links`
- `/orders/abandoned-carts`
- `/orders/[orderId]`

The first implementation cycle is A1 and activates only `/orders` plus `/orders/[orderId]`. A2 then activates `/orders/quick-links`; A3 activates `/orders/abandoned-carts`.

The shared model includes:

- `orders`: store, public order number, source, customer snapshot, money totals, currency, order/payment/fulfillment status, shipping snapshot, version, timestamps;
- `order_items`: product/variant references when still available plus immutable name, SKU, unit price, quantity, discount and total snapshots;
- `order_events`: immutable actor/action/from/to metadata without secrets;
- `order_notes`: merchant-only text with author membership and archive state;
- `order_operations`: idempotent operation fingerprint and immutable result;
- `quick_order_links` and items: a server-generated token digest, bounded expiry, product/variant and customer/address snapshots, allowed payment configuration, opened/paid/cancelled lifecycle, and an optional converted order;
- `abandoned_carts` and items: opaque public cart reference, customer/contact snapshot, money totals, lifecycle, expiry and recovery state.

Quick-order links reproduce the pinned donor behavior rather than inventing a direct order-entry form. In A2 the merchant selects real products/variants and enters bounded contact/address intent; the server revalidates active catalog rows and snapshots the verified catalog plus normalized contact/address values. The optional existing-customer selector is deliberately deferred to Slice B, where it must resolve through the real tenant-scoped customer repository before the server snapshots it; A2 never invents customer search or accepts a customer ID. The server calculates totals and generates an opaque credential. Raw credential bytes are never persisted: PostgreSQL receives the digest used for lookup plus a server-only A256GCM sealed envelope bound to the link/store/digest/key so authenticated create or duplicate replay can reveal the original URL without minting a replacement. The public URL is constructed only from the verified storefront hostname. Link redemption is implemented in the shared storefront runtime before the menu destination is activated. Browser-supplied totals and storefront hosts are never authority.

An order is created only by a server-owned checkout/redemption transaction. It checks inventory and totals server-side and commits order, items, stock movement, operation result, quick-link conversion when applicable, and order event atomically.

Order transitions use an explicit state machine. Invalid transitions, stale versions, disabled `orders` entitlement, insufficient role, cross-store IDs, replay mismatch, expired membership, or unavailable runtime fail without mutation.

## 8. HTTP and presentation contract

All merchant-panel endpoints live under `/api/orders/**`, use same-origin credentials, reject private authority headers, and expose safe DTOs only. Public storefront redemption/status routes and provider callback/internal reconciliation routes are narrow exceptions because they run on the verified storefront/callback authority rather than the merchant-panel origin; they must use exact paths, exact host/proxy authority, workflow-only PostgreSQL functions, and no browser tenant/store authority. Required merchant routes are list/create quick order, detail, status transition, payment transition, shipping update, notes, export, and abandoned-cart list/detail/archive.

The donor markup and interaction geometry are adapted from the pinned SHA. The target keeps its `/orders` route language, current panel shell, topbar portal, drawer/dock behavior, 1025px desktop boundary, 48px targets, reduced-motion gate, and controlled empty/loading/error states.

Dashboard order cards remain unsupported until the order aggregate endpoint exists in the same slice; then they display only exact persisted totals and timestamps.

## 9. Testing and evidence

Every slice follows RED -> GREEN -> REFACTOR and an independent task review.

Required evidence per domain:

- contract parser and immutability tests;
- migration apply/assert/rollback/reapply and manifest checks;
- PostgreSQL 16 tenant isolation, role/grant, concurrency, replay and state-machine tests;
- repository projection and error classification tests;
- HTTP method/path/query/origin/header/body/size/error tests;
- browser DTO secret/private-ID scans;
- UI loaded/empty/loading/error/conflict/permission tests;
- navigation exact/near-match/encoded-path negative tests;
- customer-panel workspace, TypeScript and production build;
- Owner and existing phase regressions when shared packages or migrations change;
- `apps/admin/**` direct-tree diff against the implementation start remains zero;
- donor SHA re-verification before every presentation transplant;
- no production/deployment mutation.

## 10. Definition of complete parity

The program is complete only when all pinned donor navigation destinations that are genuinely implemented at the pinned SHA have equivalent tenant-safe target routes and durable behavior, all known donor placeholders remain truthfully unavailable until implemented, every navigation item is authority-backed, all visual/accessibility/security gates pass, and `apps/admin/**` remains untouched.

The current shell/product implementation is a valid foundation, not completion. Orders is the next independently shippable milestone; subsequent slices continue automatically under this design.
