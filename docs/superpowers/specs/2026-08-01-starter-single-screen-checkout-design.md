# Starter Single-Screen Checkout Design

**Status:** Kullanıcı tarafından görsel yönü onaylandı; yazılı spec incelemesi bekleniyor
**Date:** 2026-08-01
**Target:** `apps/storefront-shared` Starter theme
**Branch:** `codex/starter-theme-commerce-foundation`

## Problem

Starter checkout currently presents delivery and payment as two client-side steps on the theme's warm paper background. This separates information that should be visible together, makes the order summary feel detached, and leaves the payment-unavailable state looking like an unfinished page. The existing `apps/storefront-base/app/odeme/page.tsx` surface contains useful visual ideas, but it is a legacy Supabase-powered donor and cannot be copied into the shared SaaS runtime.

## Goals

- Render contact, delivery address, shipping method, payment method, order summary, and the final action on one page.
- Give exact `/checkout` a white, premium, uncluttered canvas without changing the rest of the Starter theme.
- Keep the canonical PostgreSQL cart quote and persisted store configuration as the only authority.
- Preserve truthful fail-closed behavior when stock, shipping, or payment is unavailable.
- Keep the checkout usable at 320px and visually balanced through desktop widths.
- Make the side cart's configuration message compact and helpful without hiding the blocker.

## Non-goals

- No payment-provider credential, migration, contract, repository, SQL, Owner, customer-panel, or production change.
- No browser-provided tenant, store, price, shipping, or payment authority.
- No card-number form inside Celebix. Card-capable gateways continue through their approved hosted or 3-D Secure boundary.
- No copying of legacy Supabase calls, abandoned-cart local storage, authentication, coupon code, or old APIs from `apps/storefront-base`.
- No fake payment method for Güzide. A missing method remains visibly unavailable and the terminal submit remains disabled.

## Chosen Experience

### Desktop

Exact `/checkout` uses a white page shell with a compact checkout header and a two-column content grid:

1. The left column is one continuous form containing four numbered sections: contact, delivery address, shipping, and payment.
2. The right column is a sticky order summary containing canonical product media, title, variant, quantity, line total, subtotal, shipping, and total.
3. One final full-width action sits below payment methods and includes the canonical total when checkout is ready.

The old delivery/payment progress tabs and `step` state are removed. All fields and truthful availability states are visible without an intermediate click.

### Mobile

At narrow widths the layout becomes one column. The compact order summary appears before the final action, does not overlap form controls, and may use a native disclosure only if the complete total and item count stay visible. There is no horizontal overflow. Primary controls, quantity controls, links acting as controls, and dismiss controls expose at least a 48×48px target.

### Visual language

- Page background: `#ffffff`.
- Primary text: near-black; supporting text: neutral gray.
- Surfaces: white with subtle neutral borders; no beige page wash or decorative gradients.
- Section numbering, labels, focus rings, errors, and active method cards use the store accent only where contrast remains at least 4.5:1.
- Product media uses canonical persisted media and a neutral placeholder only when media is absent.
- Reduced-motion mode keeps transition and animation durations at approximately `0.01ms`.

## Component Boundaries

### `CheckoutForm`

`CheckoutForm({ intentKind })` remains the sole client coordinator. It:

- fetches one canonical `PublicCheckoutQuote` through `storefrontCartClient.quote`;
- owns the form draft, validation presentation, selected payment kind, terminal pending state, and one stable operation ID;
- renders every checkout section simultaneously;
- submits only when the quote is checkout-ready, the form is valid, and an exact returned payment method is selected;
- accepts only the existing same-origin success redirect contract.

The `step` and `delivery` states are removed. Validation runs on terminal submit and focuses the first invalid field without losing entered values.

### `CheckoutSummary`

`CheckoutSummary({ summary })` remains a pure public-projection renderer. Its presentation is expanded for canonical media and mobile placement, but it never calculates or accepts browser-authored totals.

### Availability panel

A small checkout availability component maps only the finite blocker set:

- `empty_cart` → cart empty;
- `stock_unavailable` → stock or price changed;
- `shipping_unavailable` → shipping configuration unavailable;
- `payment_unavailable` → payment configuration unavailable.

It never exposes repository, provider, SQL, or configuration detail. For shipping/payment configuration blockers the form remains inspectable, but the terminal action stays disabled. Stock and empty-cart blockers also prevent terminal checkout.

### Side cart

The side cart retains the exact blocker and safe `/checkout` link. Its configuration message becomes a compact neutral information card rather than a dominant error panel. It must not say or imply that payment is active when the quote says otherwise.

## Data and Submission Flow

1. The browser requests a quote with the existing same-origin cart credential.
2. The server resolves the exact trusted hostname, cart, product media, totals, shipping readiness, and payment methods from durable authority.
3. The browser renders the immutable public quote and collects only contact/address/note plus a choice from returned payment methods.
4. The browser submits the existing version-bound checkout command with one stable operation ID.
5. The server revalidates cart version, stock, pricing, shipping, and payment before committing.
6. Only an exact same-origin `/checkout/success` redirect is accepted as success.

No quote failure, unavailable method, timeout, malformed response, or redirect mismatch creates an order or changes browser location.

## Loading and Failure States

- Initial loading shows a structured white summary skeleton, not a permanent “Yükleniyor” heading.
- Quote failure shows one bounded retry action and does not present an empty cart.
- Configuration blockers show the exact truthful Turkish copy and a disabled terminal action.
- Field errors are adjacent, announced, and do not erase user input.
- Submit ambiguity remains a generic safe failure; no automatic second write occurs.

## Expected Files

- Modify `apps/storefront-shared/app/checkout/page.tsx` for the exact checkout page shell.
- Modify `apps/storefront-shared/components/CheckoutForm.tsx` for the single-screen form.
- Modify `apps/storefront-shared/components/CheckoutSummary.tsx` only as needed for media and responsive presentation.
- Modify `apps/storefront-shared/components/SideCartDrawer.tsx` only for the compact truthful configuration notice.
- Modify `apps/storefront-shared/app/globals.css` for checkout-scoped white presentation and responsive rules.
- Modify focused tests under `apps/storefront-shared/components/**` and existing storefront integration/static-security suites.

Any contract, repository, SQL, migration, dependency, payment-adapter, Owner, customer-panel, infrastructure, or production change requires a separate decision.

## Test Strategy

### TDD behavior tests

- A single form renders contact, delivery, shipping, payment, summary, and terminal action together.
- No delivery/payment step switch or back button remains.
- Terminal submit validates all fields in one pass.
- Only a returned canonical payment method can be selected and submitted.
- Missing payment keeps the final action disabled and creates no order.
- Missing shipping, stock mismatch, empty cart, quote failure, and malformed response remain fail-closed.
- Successful completion still requires the existing exact same-origin redirect.
- Side cart remains truthful and links safely to checkout for configuration blockers.

### Presentation and accessibility

- Exact checkout canvas computes to white.
- 320, 390, 768, 1024, and 1440px viewports have zero horizontal overflow.
- Required controls have at least 48×48px targets.
- Keyboard order follows the visual order and the first invalid field receives focus.
- Error/status messages use appropriate live-region semantics.
- Primary CTA contrast is at least 4.5:1.
- Reduced-motion CSS remains approximately `0.01ms`.

### Regression

- `@celebix/storefront-shared` full tests, typecheck, and production build.
- Existing cart/checkout in-process and static-security suites.
- PostgreSQL cart/checkout harness when data-bound behavior changes; visual-only changes do not alter its scenario count.
- `apps/admin/**` diff count remains zero.
- Forbidden browser authority, legacy Supabase, raw credential, and secret scans remain clean.

## Staging Acceptance

After a separately observed exact-SHA staging deployment:

- Güzide `/checkout` is a white single-screen experience.
- The existing cart item image, variant, quantity, and totals are visible.
- `payment_unavailable` is shown truthfully and terminal submit is disabled.
- No order is created while unavailable.
- Side cart, `/cart`, `/checkout`, and back navigation remain coherent.
- Desktop and mobile screenshots show no overlap or horizontal overflow.
- Console/runtime logs contain no unexpected errors or secret-bearing values.

Production deployment and mutation remain forbidden.
