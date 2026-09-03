# Commerce Analytics and Cart Recovery Design

Date: 2026-09-03
Status: Approved for implementation and staging by Atlas

## Objective and safety boundary

Extend the existing Celebix analytics and durable abandoned-cart systems into a tenant-safe commerce analytics workspace and a controlled cart-recovery workflow. This delivery reuses self-hosted Umami, the SaaS PostgreSQL database, the analytics delivery outbox/worker, the durable Storefront cart projection, and the optional fail-open `@celebix/saas-cache` runtime. It does not introduce a second analytics product, event database, cart model, Redis resource, or session-replay system. `apps/admin/**` is outside scope.

Production remains out of scope. Staging mutations are limited to prefixed QA fixtures and never use real customer data or real payment credentials.

## Existing architecture

`saas.store_analytics_connections` binds one store to one Umami website and already exposes tenant-scoped Customer Panel, host-resolver, and workflow authorities. Storefront loads a hostname-bound tracker configuration and fails open when the tracker is unavailable. Canonical paid orders enqueue a purchase delivery through `saas.analytics_delivery_outbox`; the Storefront analytics worker leases, retries, dead-letters, and delivers those records. `saas.storefront_carts` and `saas.storefront_cart_items` are synchronized into the existing durable `saas.abandoned_carts` projection. Merchant reads use server-established `TenantContext` and `MerchantAction`, never a client-supplied store identifier.

The implementation extends these records additively with storefront hostname reconciliation, versioned commerce event envelopes, lifecycle episodes, attribution snapshots, recovery-token digests, contact attempts, operational delivery status, and currency-aware aggregate reads.

## Source-of-truth boundaries

Umami owns anonymous pageviews, visitors, sessions, device/country/referrer breakdowns, safe UTM dimensions, and behavioral funnel events. Umami event counts may support behavior and attribution analysis, but never establish an order, payment, refund, cart transition, inventory value, customer identity, or revenue.

SaaS PostgreSQL owns carts, checkout sessions, customer bindings, orders, payment capture, refunds, actual gross/net revenue, cart lifecycle, recovery attempts, token digests, audit records, delivery idempotency, and financial aggregates. Catalog and checkout services remain authoritative for current product availability, stock, prices, tax, shipping, discounts, and currency. Different currencies are returned as distinct buckets; the system performs no synthetic conversion.

Redis caches only parsed analytics read models. Keys include the environment namespace, opaque store ID, date range, timezone, currency, filters, and schema version. TTLs are 30 seconds for overview/products, 30–60 seconds for funnel, and 60 seconds for acquisition. Redis is never a cart, order, token, outbox, or idempotency authority; failures bypass cache and read the sources of truth.

## Event contract

The shared schema version is `1`. The envelope allowlist is `schemaVersion`, `eventName`, `occurredAt`, `anonymousSessionRef`, `cartRef`, `checkoutRef`, `orderRef`, `productId`, `variantId`, `categoryId`, `quantity`, `currency`, `valueMinor`, `paymentMethod`, `shippingMethod`, `campaign`, `source`, `medium`, and `safeErrorCode`. Unknown keys, unknown event names, invalid timestamps, invalid currency/minor units, excessive strings, and oversized payloads are rejected before delivery.

Browser events are `storefront_view`, `product_view`, `category_view`, `search`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `checkout_address_completed`, `shipping_method_selected`, `payment_method_selected`, `checkout_validation_error`, `coupon_applied`, `whatsapp_click`, and `phone_click`. Browser events are behavior-only and cannot mutate commerce state. A browser attempt to emit `purchase`, `payment_failed`, `refund`, `order_cancelled`, `cart_abandoned`, `cart_resumed`, `cart_recovered`, `recovery_message_queued`, `recovery_message_sent`, or `recovery_message_failed` is rejected.

Server events use the existing delivery outbox and worker. Their unique event key is derived from event kind plus the canonical entity and transition identity, so retries and replay do not create a second ledger record. `purchase` and `cart_recovered` are emitted only after the canonical payment attempt is captured and the order transaction commits. Pending bank transfer is not paid revenue.

## Privacy and minimization

Umami receives no customer name, email, phone, postal address, raw customer/cart/checkout/order ID, cookie, auth token, recovery token, payment details, IP copy, or free-form note. Cross-system references are environment-specific HMAC values with a versioned key identifier and cannot be reversed to raw identifiers. Recovery-token material is returned once to an authorized caller; PostgreSQL stores only a SHA-256/HMAC digest.

Search terms are normalized, limited to 64 characters, restricted to Unicode letters/numbers/space and safe punctuation, and redacted when they resemble email, telephone, URL, card-number, token, or other high-risk content. Redaction failure produces the fixed value `redacted`, never the original text. Referrers retain only a normalized hostname. UTM values use length and character allowlists. Application logs and APIs expose safe error codes, never provider credentials or raw event payloads containing identifiers.

## Store-to-Umami provisioning

One store has at most one active Umami website. Reconciliation preserves its website ID during custom-domain changes, computes the active storefront hostname set from verified storefront domains plus the environment-specific fallback host, and excludes every admin hostname. Provisioning and custom-domain changes invoke the same idempotent reconcile service. The connection records tracker version, last reconcile/success times, and a safe error code. Staging and production bindings remain separate through environment-scoped configuration. Website ID is not accepted as client authority, and a cross-tenant lookup is reported as not found.

## Cart lifecycle

The durable cart projection uses `active`, `candidate`, `abandoned`, `resumed`, `converted_pending_payment`, `recovered`, and `expired`. Defaults are 30 minutes to candidate, 24 hours to abandoned, and 72 hours for recovery links. Store settings enforce candidate 15–360 minutes, abandonment 1–168 hours, and link lifetime 1–168 hours. Automatic messaging is disabled by default, has at most three attempts per episode, and requires at least six hours between attempts.

A cart is eligible only when the store is active, it contains at least one currently valid line, is not expired/revoked, has not converted to an order, and has no paid/captured order. Empty carts cannot become candidate or abandoned. The worker claims eligible rows with `FOR UPDATE SKIP LOCKED`; transitions use deterministic event keys and episode uniqueness. `active → candidate → abandoned`; activity after abandonment produces `resumed`; a resumed cart can later create a new numbered episode. Checkout alone may produce `converted_pending_payment`, but only captured payment produces `recovered`. UTC is stored and the merchant timezone is applied at presentation boundaries.

Each abandonment episode stores its number, candidate/abandoned/resumed/recovered times, optional linked order, and immutable attribution snapshot. Replayed or concurrent evaluation can commit only one transition/event for an episode.

## Attribution

The first cart creation and checkout start capture safe first/last source, medium, campaign, referrer hostname, landing-path group, and device group. First touch is immutable; last touch changes only when a later valid campaign is present. Orders copy the attribution snapshot during canonical creation. Cart, Umami session, and order correlation uses opaque HMAC references. Missing attribution is explicitly presented as direct/unknown.

## Metric formulas

- Unique visitors and pageviews are Umami metrics.
- Paid conversion is captured orders created in range divided by unique storefront visitors in the same range; zero or unavailable visitors yields “unavailable”, not zero percent.
- Add-to-cart rate is unique `add_to_cart` sessions divided by unique `product_view` sessions.
- Checkout conversion is captured orders divided by unique `begin_checkout` sessions.
- Cart abandonment is distinct eligible carts entering `abandoned` divided by distinct product-bearing carts evaluated for inactivity.
- Checkout abandonment is eligible checkout starts without captured payment at threshold divided by eligible checkout starts.
- Recovery rate is previously abandoned carts linked to captured orders divided by abandoned carts eligible for recovery.
- Recovered gross revenue is the gross amount of captured orders linked to an abandoned episode; refunded amount is reported separately; net equals gross minus refunds.
- Average order value is captured gross revenue divided by captured order count.

Every financial numerator comes from PostgreSQL, is represented in integer minor units, and is grouped by currency. Previous-period values use an immediately preceding range with equal duration and the same timezone boundary.

## Customer Panel information architecture

`/analytics` retains the existing traffic and commercial summaries and adds tabs for Overview, Funnel, Carts & Checkout, Acquisition, and Products. Shared controls include a bounded date range (maximum 13 months), previous-period comparison, timezone, currency bucket, and stable partial-data status.

Overview combines Umami traffic with PostgreSQL orders, paid conversion, AOV, abandonment, recovery, and gross/refunded/net recovered revenue. Funnel renders the defined steps without manufacturing zero values when traffic is unavailable. Carts & Checkout offers paginated, store-scoped lifecycle/episode filters, value buckets, safe attribution, masked contact data by role, and recovery actions. Acquisition shows first/last-touch and safe referrer/UTM groups. Products uses set-based aggregates and never calls Umami once per product.

`/settings/analytics` exposes status, thresholds, recovery lifetime, tracking policy, optional messaging limits, and auto-recovery state without revealing Umami credentials or internal website IDs. Store owner/admin may read and mutate. Analyst may read analytics and masked cart detail but cannot mutate. Editor retains the existing merchant-action policy and receives no implicit privilege expansion. Unauthorized mutation is `403`; cross-tenant entities are `404`.

## Recovery tokens and communication

A token is host/store/cart/episode bound, expires by store policy, is revocable, and is single-purpose. Only its digest, key version, expiry, revoke/use timestamps, and audit metadata are stored. A valid link resolves the hostname to the same store, checks digest/expiry/revocation/conversion, then revalidates every line against the current catalog, price, and stock. Archived items are omitted, quantities are reduced with a visible explanation when required, and stale prices are never silently restored. The flow creates or safely resumes a current cart and rotates the token when policy requires.

Manual recovery is always available to owner/admin as generate/copy link, mark contacted, and add a bounded note. Email appears only when configured infrastructure and recorded consent exist. WhatsApp produces a user-initiated `wa.me` link only when policy and consent permit; no server automation is implied. Automated recovery is off by default and remains disabled when provider infrastructure or consent is absent. Attempts use an idempotency key and states queued/sent/failed without exposing message bodies in analytics.

## API and failure behavior

The Customer Panel provides tenant-authorized reads at `/api/analytics/overview`, `/funnel`, `/abandoned-carts`, `/acquisition`, `/products`, and `/status`. Recovery mutations extend the existing abandoned-cart route family. Requests validate session, membership, merchant action, same origin for mutations, date range, timezone, currency, page size, and timeout; no client store ID is trusted.

Umami timeout or outage returns HTTP 200 partial/degraded analytics: PostgreSQL commercial cards remain available, traffic fields are unavailable, and empty data is distinct from provider failure. Storefront tracker load/event errors never block page, cart, checkout, order, or payment flows. Worker outage accumulates durable outbox records; restart leases and delivers the backlog. Health reports PostgreSQL as required and Umami/worker as independently degraded, including bounded pending, claimed, retry, dead-letter, oldest-age, last-success, and latency metadata. Dead-letter requeue is an authorized, idempotent workflow operation.

## Migration and rollback

Migration `124` is additive and extends existing analytics/cart tables rather than duplicating them. It introduces store settings, storefront host bindings, lifecycle episodes, attribution snapshots, recovery-token digests, recovery attempts/notes, generalized event keys, operational indexes, and store-scoped read/transition functions. Tables force RLS, have no `PUBLIC` grants, use composite store foreign keys, explicit currency/minor units, UTC timestamps, bounded payloads, and role-specific function grants.

Disposable PostgreSQL 16 rehearsal applies the canonical chain through `123`, then `124`, assertions, old application/new schema, new application/new schema, code-only rollback/new schema, tenant isolation, grants, idempotency, and concurrent claim behavior. Down migration is permitted only before recovery/event rows exist; otherwise it raises a guard. Standard rollback is code-only with `ANALYTICS_COMMERCE_ENABLED=false`, `CART_RECOVERY_ENABLED=false`, and `AUTO_CART_RECOVERY_ENABLED=false`; existing Umami websites and real cart/order data are preserved.

## Operations, backup, and staging QA

The existing Coolify Umami stack is audited for exact version/digest, `/api/heartbeat`, persistent PostgreSQL storage, CPU/RAM, connections, disk, and log retention. A daily encrypted off-site database backup receives a documented retention policy and restore runbook. A staging restore drill targets an isolated database and verifies core tables and event counts without writing production.

Automated tests cover contracts, privacy, bindings, lifecycle/concurrency, tokens, worker retry/dead-letter/requeue, metrics, authorization, APIs, UI states, and responsive behavior. Staging uses only `ATLAS-QA-COMMERCE-ANALYTICS-*` fixtures, temporary thresholds, and a controlled non-real payment fixture. QA verifies the full UTM → cart → abandonment → recovery → captured-order path, Umami partial outage, worker backlog recovery, 1440/1024/390 layouts, browser console/network, and cleanup. Temporary thresholds are restored, tokens revoked, the QA product archived, and auto messaging remains off.
