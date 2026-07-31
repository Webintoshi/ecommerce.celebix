# Starter Commerce Cart, Checkout, and Policy Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı

**Design base:** `bbe68885986279f8642f1852ac3db74eb8bc06ab`

**Target application:** `apps/storefront-shared` with tenant administration in `apps/customer-panel`

**Visual donors:** the current starter storefront and the read-only checkout/cart surfaces in `apps/storefront-base`

## Goal

Turn the shared starter storefront into a truthful, tenant-isolated commerce surface with:

- durable add-to-cart and buy-now actions;
- a verified cart page;
- a two-stage delivery and payment page;
- bank transfer and merchant-enabled cash on delivery;
- fixed search, favorites, account, and cart header actions;
- seven merchant-editable legal and membership pages rendered in the footer;
- server-authoritative price, stock, shipping, payment-method, order, and policy data.

This feature extends the shared SaaS runtime. It does not copy the legacy storefront application, restore Supabase authority, trust browser totals, or activate production.

## Existing system and donor boundary

The repository already contains three related but distinct surfaces:

1. `apps/storefront-shared/app/odeme/hizli/**` is a durable token-bound quick-order flow. It cannot be reused as a normal cart because the quote is issued by a merchant quick link and bound to a redemption credential.
2. `apps/storefront-shared/app/api/cart/route.ts` captures abandoned-cart facts but does not provide a customer-readable or mutable cart.
3. `apps/storefront-base/app/sepet/page.tsx` and `apps/storefront-base/app/odeme/page.tsx` contain the desired cart and two-stage checkout interaction model, but depend on legacy Supabase, legacy APIs, browser totals, and single-store assumptions.

The third surface is a read-only visual and interaction donor. No Supabase client, legacy authentication context, legacy payment API, local price calculation, old route namespace, or donor data model crosses into `apps/storefront-shared`.

## Architectural decision

The implementation uses a durable shared-commerce authority rather than a client-only cart or a copied legacy checkout.

- PostgreSQL owns the cart, selected variants, quantities, checkout intent, price resolution, stock checks, shipping quote, payment-method eligibility, order creation, inventory reservation, and terminal state.
- The browser owns no tenant, store, price, stock, discount, shipping-price, payment-status, or order-status authority.
- Public requests are bound to the already authenticated storefront proxy hostname.
- Anonymous customers receive random opaque credentials. Only digests are persisted; raw credentials never appear in logs, database rows, RSC payloads, analytics, URLs, or admin pages.
- Every durable row carries `store_id`; every SQL function independently revalidates the hostname-to-store relationship under row lock where mutation occurs.

## Delivery slices

The work is implemented and reviewed in three ordered slices while remaining one coherent feature:

1. **Public shell and content:** header actions, search, favorites, fixed policy definitions, public policy pages, and footer links.
2. **Durable cart and checkout:** cart credential, cart mutation/read, buy-now intent, checkout quote, delivery form, built-in payment selection, order creation, and receipt.
3. **Integrated acceptance:** responsive styling, accessibility, recovery behavior, disposable PostgreSQL rehearsals, and isolated staging browser verification.

No slice may substitute mock data for an unfinished later slice. Until its durable authority exists, the related action remains fail-closed and is not presented as working.

## Public header and navigation

The starter header retains the merchant wordmark/logo and primary navigation. A fixed utility group appears at the upper right in this order:

1. **Arama** — opens or links to `/search`.
2. **Favoriler** — links to `/favorites` and shows the current verified favorite count.
3. **Hesabım** — links to `/account` and exposes only orders bound to the current anonymous customer credential.
4. **Sepetim** — links to `/cart` and shows the canonical cart item count.

All controls use visible or accessible Turkish labels, SVG icons, at least 48×48 px targets, keyboard focus styles, and no hover-only meaning. Mobile uses the same utility actions without removing search, favorites, account, or cart. Counts use `aria-live="polite"` without announcing unrelated renders.

## Search

`/search` queries only active, publicly available products for the trusted storefront hostname.

- Query text is trimmed UTF-8, control-character free, and bounded to 100 characters.
- Empty queries render guidance and do not issue a repository search.
- Results are capped and cursor-paginated with deterministic ordering.
- Search matches normalized product title, SKU, brand name, category name, and public tags using a PostgreSQL-owned projection.
- Inactive, archived, cross-store, unavailable, or unresolved-price products never appear.
- The browser cannot supply a store ID or broaden the hostname scope.

## Favorites

Favorites are browser-persistent but never authoritative.

- The browser stores only a versioned, hostname-scoped list of public product IDs with a strict item bound.
- `/api/favorites/resolve` rehydrates the list through the public repository on every favorites-page load and after a mutation.
- Missing, archived, inactive, cross-store, or malformed product IDs are removed from the canonical response.
- A favorite action changes only the local preference. It never reserves stock, changes ranking, or grants product access.
- Storage events synchronize counts between tabs. One tenant hostname cannot read or display another hostname's favorites.

## Anonymous customer and account surface

This phase does not invent password authentication or claim cross-device membership. `/account` is a real browser-bound guest account surface.

- The first successful checkout establishes a `__Host-celebix_customer` credential with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` attribute.
- PostgreSQL stores only its digest and binds it to one store.
- Orders created by the same credential are listed with bounded public receipt fields.
- The route never accepts customer ID, email, store ID, or order ID as authority.
- Clearing the credential removes browser access but does not delete the merchant's order or customer record.
- Full verified customer registration, password reset, cross-device login, and customer profile editing are explicitly outside this feature and require a separate identity design.

## Durable cart credential and state

The first cart mutation establishes `__Host-celebix_cart` with the same secure cookie properties as the customer credential.

The durable cart records:

- cart ID and store ID;
- credential digest and key ID;
- active/converted/expired status;
- bounded expiry and timestamps;
- one row per selected product variant;
- quantity and stable insertion order;
- version and replay-safe operation records.

The cart does not persist a browser-provided price. Canonical reads resolve the current active product, variant, price list, currency, availability, media, and stock on each request. A product whose price or availability can no longer be proven remains visibly unavailable and cannot proceed to checkout.

Cart mutations require exact same-origin JSON requests with bounded bodies, no cookies other than the expected storefront credentials, and no private authority headers. Each mutation carries a random operation ID and fingerprint. Duplicate operations replay; mismatched fingerprints fail without mutation.

## Add to cart

Product cards and product details expose **Sepete ekle** only for purchasable products.

- Product detail requires an explicit available variant where more than one variant exists.
- Quantity begins at one and is bounded by current stock and the configured per-line limit.
- The request contains only public product ID, variant ID, quantity, and operation ID.
- PostgreSQL proves product/variant/store consistency and returns the canonical cart summary.
- Success updates the header count and presents an accessible confirmation with links to continue shopping or open the cart.
- Out-of-stock, changed-price, invalid-variant, expired-cart, ambiguous-commit, and unavailable results have finite Turkish messages and no blind retry.

## Buy now

**Şimdi satın al** creates a separate one-item checkout intent from the selected canonical variant and quantity.

- It does not clear, replace, merge, or otherwise mutate the normal cart.
- The intent receives its own opaque, short-lived credential and server-resolved quote.
- The browser is redirected to `/checkout?intent=buy-now`; the query selects only the intent kind and never contains a token, product ID, price, store ID, or customer data.
- An ambiguous write does not retry or redirect. The customer remains on the product page with a safe recovery message.

## Cart page

`/cart` renders a server-resolved cart with:

- primary product image, product title, variant title, and canonical unit price;
- quantity decrement/increment and remove actions;
- unavailable/change notices per line;
- subtotal, shipping status, and total derived by the server;
- **Alışverişe devam et** and **Ödemeye geç** actions;
- an empty-cart state linking to `/products`.

Quantity changes use the latest cart version and replay-safe operation IDs. Stale versions return canonical cart state rather than silently overwriting another tab. The checkout action is disabled until every line is purchasable and the quote can be proven.

## Checkout page

`/checkout` adapts the visual hierarchy of `apps/storefront-base/app/odeme/page.tsx` to the existing starter design system. It is not a source-code port.

### Step 1: Teslimat

The form collects bounded:

- email;
- first name and last name;
- Turkish phone number;
- country fixed to Türkiye for this phase;
- city, district, address, and optional postal code;
- selected active shipping method;
- optional order note.

The server resolves shipping methods and prices from the store's durable shipping settings. The browser-supplied labels or prices are ignored. Invalid or unsupported addresses remain on step one with field-specific feedback.

### Step 2: Ödeme

The page requests the store's current public built-in payment methods.

- **Banka havalesi** is available only when the merchant has an active, complete configuration with a checksum-valid Turkish IBAN, bank name, account holder, and bounded instructions.
- **Kapıda ödeme** appears only when the merchant explicitly activates it.
- Provider-backed card methods are not silently inserted into this first cart-checkout slice. The existing hosted quick-order providers remain unchanged and can be integrated through a later, provider-specific cart authority.
- If no valid built-in payment method is active, checkout fails closed before order creation.

The UI shows only public method fields. Internal payment-method IDs, profile IDs, tenant IDs, provider credentials, evidence digests, and configuration metadata never cross into client components.

## Order creation and payment state

The final submit sends the delivery payload, selected public payment-method kind, cart/intent version, and one operation ID. PostgreSQL performs one serializable authority transition:

1. lock and revalidate the cart or buy-now intent;
2. prove store, hostname, active product/variant, price, stock, shipping, and payment method;
3. recompute subtotal, shipping, discount, and total;
4. create or reuse the customer and addresses within the same store;
5. create the order and immutable order items;
6. reserve/decrement inventory with the existing inventory-source discipline;
7. bind the order to the anonymous customer credential;
8. convert the cart/intent exactly once;
9. persist the operation result and commit.

Bank-transfer orders are created with an accepted order state and `payment_status = pending`. Cash-on-delivery orders are also `payment_status = pending`; they do not become paid until a later authorized merchant workflow records collection. Neither method is falsely marked completed during checkout.

`commit_unknown` remains fail-closed. A single read-only recovery by operation ID may determine whether the order exists. No second write is issued.

## Receipt and bank-transfer instructions

`/checkout/success` requires the current anonymous customer credential and an opaque receipt credential. It shows:

- public order reference;
- ordered items and canonical totals;
- delivery summary;
- selected payment method;
- bank name, account holder, and IBAN for bank transfer;
- merchant instructions and the exact order reference to place in the transfer description.

The receipt credential is not reusable across stores or orders. Refresh is safe and does not create another order. Direct order IDs or email-address lookups do not grant access.

## Fixed policy and membership pages

Every store has exactly these seven definitions:

| Key | Public route | Turkish label |
| --- | --- | --- |
| `privacy_security` | `/policies/privacy-security` | Gizlilik ve Güvenlik |
| `distance_sales` | `/policies/distance-sales` | Mesafeli Satış Sözleşmesi |
| `kvkk` | `/policies/kvkk` | KVKK |
| `payment_delivery` | `/policies/payment-delivery` | Ödeme & Teslimat |
| `cookie_usage` | `/policies/cookies` | Çerez Kullanımı |
| `returns_exchanges` | `/policies/returns-exchanges` | İade & Değişim |
| `membership` | `/policies/membership` | Üyelik |

The definitions are code- and database-pinned. Merchants cannot add an eighth fixed policy, delete one, rename its key, change its public route, or access another store's content.

The customer panel's **İçerik → Politikalar** view renders all seven in a fixed order. Each record has a Markdown editor, preview, draft/published status, version, last-updated timestamp, and publish action. Markdown is parsed with the same safe allowlist used by product descriptions: no raw HTML, scripts, iframes, event handlers, style injection, remote forms, or unsafe URLs.

No donor legal text is copied and no default legal claim is invented. A newly created store receives seven draft records with empty content. The footer always shows all seven links; an unpublished page returns a truthful, non-indexed “Bu metin mağaza tarafından henüz yayımlanmadı” page rather than fabricated policy content or a broken link.

Published public projections contain only key, label, route, sanitized rendered content, and updated time. Internal record IDs, operation IDs, membership IDs, and draft history are excluded.

## Footer

The starter footer retains merchant identity and support details, then adds a **Yasal ve Bilgilendirme** navigation group containing all seven links in the fixed order above. Desktop uses balanced columns; mobile uses a linear accessible list. Links remain visible regardless of publication status so new merchants can verify every required destination before launch.

## Components and contracts

Implementation boundaries remain small and independently testable:

1. `public-commerce` contracts define canonical cart, quote, payment-method, receipt, policy, search, and favorite projections.
2. PostgreSQL repositories own public reads and replay-safe workflow writes. No application module queries SaaS tables directly.
3. Cart and anonymous-customer credential modules own generation, hashing, key rotation, cookie serialization, and zeroization.
4. Route handlers own HTTP method, exact path, same-origin, content type, bounded body, cookie, and response-header policy.
5. Client cart controls receive only public product/variant facts and route responses, never `TenantContext` or a database authority object.
6. Checkout form components own local form state only. The canonical quote always comes from the server.
7. Policy administration reuses the authenticated merchant-admin authority but introduces fixed policy definitions and bounded Markdown fields instead of a free-form browser-owned kind.
8. Header, footer, cart drawer/confirmation, search, favorites, account, cart, checkout, and receipt surfaces share the current starter theme tokens and responsive shell.

## Error and recovery policy

- Unknown host, invalid proxy authority, or cross-store credentials fail before repository access.
- Invalid cart or customer credentials are expired locally and replaced only on a new explicit mutation.
- Missing cart renders an empty state; malformed or cross-store cart credentials do not reveal existence.
- Stock or price drift returns a refreshed canonical quote and requires customer confirmation.
- No active shipping or payment method prevents order creation.
- Definitive validation errors may be corrected and resubmitted with a new operation ID.
- Ambiguous writes are recovered once by read-only operation lookup; they are never blindly retried.
- Policy repository unavailability returns the shared 503 surface; unpublished content is a distinct truthful state.
- Logs contain finite error codes, route stage, and request correlation only. Customer data, addresses, email, phone, raw credentials, cart contents, IBAN, and order notes are not logged.

## Security invariants

- Store/tenant authority comes only from the authenticated storefront proxy hostname and PostgreSQL relationships.
- Browser `Host`, `Origin`, `Referer`, `Forwarded`, `X-Forwarded-*`, query parameters, hidden inputs, local storage, and RSC props cannot select a store.
- Mutation routes require exact same-origin requests and reject private/internal headers, unexpected cookies, bodies on GET, transfer encoding, duplicate headers, and oversized content.
- Application and host-resolver roles retain no direct table privileges.
- Cart, receipt, and customer credentials use independent key purposes and digests.
- Fixed policy Markdown is sanitized before persistence and again projected through a finite renderer.
- CSP remains nonce-bound and does not add `unsafe-inline`, wildcard form destinations, generic `https:`, or third-party script authority.
- Production modes and routes remain disabled until a separate production-readiness decision.

## Testing strategy

Implementation follows red-green-refactor for every behavior.

### PostgreSQL 16

Disposable harnesses prove:

- migrations apply after `070`, assertions pass, rollback restores the exact prior schema, and reapply succeeds;
- per-store cart, item, checkout intent, anonymous customer, receipt, order, policy, and operation isolation;
- app/workflow/host ACLs and forced RLS;
- exact credential digest/key-purpose binding;
- cart mutation replay, fingerprint mismatch, version conflicts, expiry, and cleanup;
- concurrent add/update/remove and double-submit produce one canonical result;
- price/stock/shipping/payment revalidation under lock;
- bank-transfer and cash-on-delivery state correctness;
- single-write `commit_unknown` recovery;
- fixed seven-policy uniqueness, draft/publish/version behavior, and cross-store denial;
- backup/restore, cleanup, and absence of external connections.

### Unit and in-process

Tests cover:

- cookie parsing/serialization, key rotation, malformed credentials, and safe expiry;
- exact request schemas and bounded UTF-8 fields;
- cart and buy-now reducers/orchestration;
- search normalization and favorite reconciliation;
- checkout delivery validation and public method projection;
- Markdown allowlist and policy route mapping;
- finite errors, unavailable states, and no private ID leakage;
- header counts, footer order, unpublished policy truthfulness, and account credential isolation.

### Browser and accessibility

Authenticated merchant and public storefront acceptance covers:

- add to cart from card and detail;
- explicit variant selection;
- quantity change, remove, empty state, and multi-tab version recovery;
- buy now without mutating the cart;
- two-stage checkout with bank transfer and optional cash on delivery;
- double-submit and replay protection;
- success receipt and browser-bound account order list;
- search and favorites behavior;
- all seven admin policy editors and public footer routes;
- keyboard traversal, Escape/focus behavior, labels, live regions, 48×48 targets, 4.5:1 contrast, reduced motion, zero horizontal overflow, and no dock/form overlap;
- desktop 1440×900 and 1025×768, breakpoint 1024×768, mobile 390×844 and 320×720;
- clean DOM, RSC, network, console, runtime-log, secret, forbidden-ID, and cross-tenant scans.

## Rollout

1. Verify the exact implementation base, clean worktree, donor read-only diff, and migration manifest checksums.
2. Run both new migrations and their rollback/reapply cycles in disposable PostgreSQL 16.
3. Run focused, workspace, cumulative Phase 3, typecheck, build, static-security, and secret scans.
4. Capture a pre-migration isolated-staging database backup.
5. Apply migration and assertions before deploying application code whose preflight requires them.
6. Deploy only the isolated customer-panel and shared storefront staging services from one immutable SHA when separately authorized.
7. Complete genuine browser acceptance with one disposable store/customer context and revoke credentials after evidence collection.
8. Production database, credentials, DNS, deployment, merge, and payment-provider activation remain untouched.

## Acceptance criteria

The feature is complete only when:

- cart, buy-now, cart page, checkout, bank transfer, optional cash on delivery, receipt, search, favorites, browser-bound account, header utilities, seven policy editors/pages, and footer links all use real shared authority;
- client-supplied totals or tenant identifiers cannot affect a quote or order;
- order and inventory mutation is replay-safe and concurrency-safe;
- all seven policies are tenant-isolated, editable as safe Markdown, and visible at fixed footer routes;
- the donor checkout look-and-flow is adapted to the starter theme without donor authentication or APIs;
- disposable PostgreSQL, regression, typecheck, build, accessibility, responsive, browser, and security gates pass;
- no source, deployment, migration, credential, DNS, or data mutation reaches production.
