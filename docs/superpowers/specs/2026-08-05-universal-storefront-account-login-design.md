# Universal Storefront Account Login Design

**Date:** 2026-08-05  
**Status:** Approved visual direction  
**Target:** `apps/storefront-shared` customer account authentication surfaces

## Objective

Replace the current dated customer login presentation with one compact, modern, responsive account experience shared by every existing and future Celebix storefront. The page must remain category-neutral. It must not contain store-specific products, photography, campaign copy, or sector language.

## Selected Direction

Use the approved **adaptive brand split** direction:

- a brand panel carries only the resolved store logo, display name, and primary published color;
- a white authentication panel contains the active task;
- desktop uses a balanced split layout;
- mobile converts the brand panel into a short top band and keeps the form visible without scrolling on an ordinary phone viewport;
- no cards, product galleries, benefit lists, promotional claims, or decorative content grids are added.

The visual companion reference is `.superpowers/brainstorm/44211-1785919066/content/adaptive-brand-complete-v3.html`. The accepted implementation reduces its copy further as specified below.

## Visible Copy

The initial screen contains only:

- store logo or a safe store-name fallback;
- `Giriş yap veya hesap oluştur`;
- `E-posta adresi`;
- `Bağlantı gönder`;
- `Şifre gerekmez`;
- `Mağazaya dön`.

The brand panel may contain the short line `Hesabınız, alışverişiniz.` No explanatory paragraph or benefit list is shown.

The sent state contains only:

- `E-postanı kontrol et`;
- a masked recipient address;
- resend countdown/action;
- change-email action.

The verification state contains only:

- `Güvenli giriş`;
- the primary continue action when a ticket exists;
- the six-digit code fallback;
- one bounded error or status message when required.

Security, rate-limit, expired-code, and provider errors remain specific enough to recover but do not add permanent explanatory copy.

## Shared Store Authority

The page remains inside `apps/storefront-shared` and resolves the store exclusively from the trusted request hostname. It consumes the same `storefront` and published `design` projection as the rest of the storefront.

Brand resolution order matches the existing header:

1. published design logo when a versioned design is active;
2. presentation logo;
3. escaped display-name fallback.

Colors come from the existing published design tokens. The primary color drives the brand panel and primary action. Text/background tokens remain authoritative elsewhere. If a configured combination cannot produce accessible control contrast, the authentication surface uses the nearest safe black-or-white foreground without changing tenant data.

No browser-provided `store_id`, `tenant_id`, slug, logo URL, color, or return origin is trusted.

## Component Boundaries

- `AccountAuthShell`: server-rendered category-neutral layout, resolved branding, store return link, and compact footer treatment.
- `AccountAuthForm`: existing client interaction state for email submission, sent state, resend countdown, and status announcements.
- login and verification pages: provide the resolved store/design data and exact flow state to the shared shell.
- account-scoped CSS/module: layout, theme token consumption, focus states, responsive behavior, reduced motion, and high-contrast fallback.

The shell owns presentation only. Challenge issuance, email delivery, verification, session creation, return-path validation, and tenant isolation remain in the existing server routes and PostgreSQL-backed identity runtime.

## Data and Interaction Flow

1. The request hostname resolves the active store and published design.
2. The login page renders the shared branded shell.
3. Email submission calls the existing enumeration-safe start endpoint.
4. Success replaces the form with the compact sent state and resend timer.
5. The email link opens the verification page in the same shell.
6. Ticket confirmation or the six-digit fallback posts to the existing browser verification route.
7. Successful authentication returns to the validated same-origin `returnTo` path.
8. Existing/new accounts remain one unified flow; the UI never discloses account existence.

Guest checkout remains independent and is never redirected through this page.

## Responsive and Accessibility Rules

- Desktop: split layout, maximum readable form width, no vertically centered content that clips on short screens.
- Tablet: proportions compress without changing information order.
- Mobile: brand band first, form second; no horizontal overflow; primary action and email field remain above the fold at 390 × 844 and usable at 320 px width.
- Logo uses intrinsic dimensions and bounded `object-fit: contain`.
- Inputs retain semantic labels, email keyboard, autocomplete, visible focus, and inline live status.
- Buttons meet a 44 px minimum target size.
- Color contrast meets WCAG AA for text and controls.
- Motion is limited to subtle state transitions and disabled by `prefers-reduced-motion`.

## Security and Error Behavior

The redesign must not weaken the existing CSP, exact-origin form authority, trusted-host resolution, cookie policy, challenge limits, enumeration-safe responses, masked-recipient handling, or same-origin return-path validation.

Raw email addresses may appear only in the active browser form and provider-bound server flow. The sent UI renders a masked address. Logs, analytics, CSS data attributes, and error envelopes never receive raw credentials, tickets, codes, or email addresses.

Unknown hosts, inactive stores, unavailable design authority, invalid tickets, expired codes, provider outages, and rate limits keep their existing fail-closed behavior. The UI maps them to short recoverable Turkish messages.

## Verification

Implementation acceptance requires:

- focused source/component tests for store logo fallback, published colors, compact copy, sent state, verification state, and no store-specific content;
- full storefront account/runtime regression tests;
- storefront typecheck and production build;
- exact-host tests proving two stores render different allowed branding through the same component without leaking tenant data;
- browser verification of email start, sent state, ticket confirmation, code fallback, login, return path, logout, and second login;
- desktop, 390 × 844, and 320 px responsive screenshots;
- direct visual comparison against the accepted adaptive-brand reference, with the approved copy reduction treated as intentional;
- no regressions to guest cart or guest checkout.

## Rollout

The implementation ships once in the shared storefront application. Existing and newly provisioned starter/custom storefront domains inherit it automatically after the shared deployment. No per-store deployment, copied page, seeded product image, or manual configuration is introduced.

