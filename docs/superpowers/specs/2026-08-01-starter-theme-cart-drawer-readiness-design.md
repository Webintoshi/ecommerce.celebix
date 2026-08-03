# Starter Theme Cart Drawer and Checkout Readiness Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı

**Design base:** `43c5da913c542bc7b253c172173a712cc519ba0b`

**Target:** `apps/storefront-shared` and the existing shared SaaS PostgreSQL commerce authority

**Visual reference:** Shopify Theme Store Lyra/Glossy slide-out cart interaction; no donor source code is copied

## Problem

The starter storefront currently updates the cart count after an add operation but gives no visible cart surface. The header cart utility is a page link, so customers must leave the product context to inspect the cart. On the full cart page, every non-ready cart is described as a stock problem even when all lines are available and the actual blocker is missing shipping or payment configuration.

The Güzide staging cart reproduces both defects: the add operation succeeds, no drawer opens, every selected line is available, and the cart displays “Stok bilgilerini kontrol edin.” The store has a valid shipping setting but no active, valid payment method. The displayed explanation is therefore false.

## Decision

Build one accessible, responsive side-cart using the canonical cart returned by the existing server mutations. Add operations and the header cart control open the same drawer. Quantity and remove operations continue through the existing replay-safe cart endpoints; browser code never calculates price, stock, shipping, tenant, store, or payment authority.

Extend the canonical cart projection with a required `checkoutBlocker` field:

```ts
type PublicCartCheckoutBlocker =
  | "empty_cart"
  | "stock_unavailable"
  | "shipping_unavailable"
  | "payment_unavailable"
  | null;
```

The server chooses exactly one value with this precedence:

1. `empty_cart` when item count is zero;
2. `stock_unavailable` when any canonical line is unavailable;
3. `shipping_unavailable` when no valid shipping projection exists;
4. `payment_unavailable` when no active and valid payment method exists;
5. `null` only when checkout is ready.

The contract rejects inconsistent combinations: `checkoutReady` is true if and only if `checkoutBlocker` is null.

## Side-cart interaction

`CartStatusProvider` remains the single browser cart state owner and gains drawer state. It exposes:

```ts
type CartStatus = Readonly<{
  cart: PublicCart | null;
  loading: boolean;
  drawerOpen: boolean;
  refresh(): Promise<void>;
  replaceCart(cart: PublicCart, options?: Readonly<{ openDrawer?: boolean }>): void;
  openDrawer(trigger?: HTMLElement | null): void;
  closeDrawer(): void;
}>;
```

`SideCartDrawer` is mounted once inside the provider. It renders the exact canonical image, title, variant, quantity, unit price, line total, subtotal, shipping and total. It provides decrement, increment and remove actions, “Sepeti görüntüle” and “Ödemeye geç” destinations. It never accepts or stores price values supplied by a component.

Successful card and product-detail add operations call `replaceCart(cart, { openDrawer: true })`. The header cart utility becomes a button with `aria-haspopup="dialog"` and opens the drawer; the full `/cart` route remains reachable from inside the drawer.

The drawer uses `role="dialog"`, `aria-modal="true"`, an accessible title, a backdrop, an explicit close button, Escape handling, body-scroll locking and focus restoration to the element that opened it. Opening focuses the close button and keyboard focus remains within the drawer while it is open. Interactive targets are at least 48×48 px. Motion is disabled to approximately `0.01ms` under `prefers-reduced-motion`.

## Cart and checkout messaging

The full cart page uses the blocker rather than the boolean alone:

- `stock_unavailable`: show the real stock/price-change warning and do not offer checkout.
- `shipping_unavailable`: show “Teslimat yöntemi henüz yapılandırılmadı.”
- `payment_unavailable`: show “Ödeme yöntemi henüz yapılandırılmadı.”
- `null`: show the normal checkout CTA.

For a configuration blocker, the cart and drawer may still link to `/checkout` so the customer can inspect delivery and order information. Final order submission remains fail-closed. The checkout page displays the exact server error, does not invent a payment option, and cannot create an order without a valid method.

The cart client parses only the finite JSON error shape `{ code }` on non-success responses and maps only known public error codes. Malformed, oversized or unknown errors remain `request_failed`; server, SQL and driver details never reach the browser.

## PostgreSQL migration

Append migration `073`. It replaces only `saas.storefront_cart_projection` and `saas.storefront_intent_projection`, preserving their signatures, security-definer configuration, role grants and every existing cart field. The down migration restores the exact migration-072 definitions. Assertions prove blocker precedence, projection consistency, unchanged ACLs and rollback/reapply. The manifest pins all three migration files.

No durable table, credential, payment method, shipping method, product, order or customer data is added by this migration.

## Security and truthfulness

- Trusted hostname and opaque cookie authority remain unchanged.
- The browser cannot select a store, tenant, price, stock state, shipping price, payment state or readiness reason.
- No fake IBAN, bank account, COD activation or payment provider is created.
- Missing payment configuration is shown honestly and order creation remains impossible.
- Cart cookies, credentials, operation IDs and internal IDs never enter drawer text, URLs, analytics or logs.
- Production is not touched.

## Verification

Red/green tests cover contract consistency, SQL precedence, client error parsing, auto-open, header open, quantity/remove, empty/error/loading states, focus/Escape/backdrop/focus restoration, body lock, truthful blocker copy, responsive CSS, reduced motion, forbidden authority scans and unchanged route authority.

The complete gate is:

- contracts and SaaS data tests/typechecks;
- storefront focused and workspace tests/typecheck/build;
- PostgreSQL 16 cart/checkout harness with migration 073 rollback/reapply;
- starter-commerce in-process and static-security suites;
- `git diff --check` and tracked secret/forbidden-authority scans;
- exact-SHA Güzide-only staging deploy;
- clean-browser add → drawer → cart → checkout verification at desktop and mobile widths.

Güzide staging may truthfully stop at payment configuration. Full paid or pending-order completion is not claimed until the merchant supplies a real authorized method.
