# Task 9 implementation report

Status: DONE

Commit subject: `test(checkout): prove fixed one-page flow`

## Delivered

- Added a deterministic production `next build` / `next start` browser fixture backed by a disposable local PostgreSQL 16 cluster.
- Seeded two isolated tenants on different exact hosts and theme keys with different store names, products, prices, shipping rates, discount behavior, and payment methods.
- Used the repository's signed proxy authority and a strict non-superuser database role. No Supabase service, provider credential, card data, real provider request, or paid transaction is used.
- Added a raw WebSocket Chrome DevTools Protocol acceptance runner; Playwright and Puppeteer are not dependencies.
- Proved the fixed `/odeme` DOM, field order, section order, computed layout tokens, CSS digest, and normalized structure digest are identical across both themes.
- Proved delivery validation/focus, explicit delivery reapply, free/paid shipping, valid/invalid discounts, provider/bank-transfer/COD selection, consent enforcement, duplicate-submit containment, server idempotency, and placed/processing/failed/paid result states.
- Proved fake hosted-provider redirect, processing, and rejection outcomes at the existing transport boundary.
- Proved keyboard-only completion, visible focus, mobile disclosure, minimum 44px mobile targets, 200% zoom without horizontal overflow, reduced motion, and zero critical/serious axe violations.
- Captured four deterministic masked screenshots at 1280×900 and 390×844 under `.superpowers/sdd/2026-07-28-fixed-one-page-shared-checkout/task-9-evidence/`.
- Added a static gate that enforces raw CDP usage, production build startup, screenshot capture, the locked local axe asset, and the absence of Playwright/Puppeteer.

## Product regressions found and fixed

### Signed external authority behind Next

The production browser initially reached the exact API routes but received `400 invalid_input`. Next exposed the internal request URL (`http://127.0.0.1:...`) to route handlers, while the reviewed request parsers correctly require the signed external HTTPS host.

After signed proxy authority succeeds, the public checkout handlers now construct one canonical request using only the authenticated hostname and the original raw target. Method, headers, signal, and the single body stream are preserved. Unsigned/forged authority, origin mismatch, wrong path/query, and malformed requests still fail before repository access. The focused regression uses the real proxy selector and proves the request body is consumed once.

### Active checkout form ownership

The streamed production DOM can transiently contain another checkout root. Global `document.getElementById` lookup could select a stale delivery form and bypass the active form's dirty authority.

`CheckoutClient` now owns the rendered delivery form through a React ref. Delivery submission, final payment validation, and dirty-state focus are scoped to that active form. Browser acceptance deliberately injects a stale duplicate root and proves the active dirty form blocks payment, focuses its own apply button, and sends zero submit requests.

## Final verification

- `node tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs`
  - PASS after a clean production build.
  - Two hosts/themes, desktop/mobile, four screenshots.
  - Console errors: 0; page exceptions: 0; failed requests: 0; CSP violations: 0.
  - axe critical/serious violations: 0 for both hosts at both viewports.
  - CSS and normalized structure digests match exactly.
- `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`
  - PASS against disposable PostgreSQL 16.
- `node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs`
  - 9 passed, 0 failed.
- `npm run typecheck --workspace @celebix/storefront-shared`
  - PASS.
- `npm test --workspace @celebix/storefront-shared`
  - 259 passed, 0 failed.
- `git diff --check`
  - PASS.

## Visual review

- Desktop Store A and mobile Store B evidence were inspected after the final run.
- The desktop frame preserves the 499px form rail and 400px neutral summary content.
- The mobile frame has 20px gutters, one order-summary disclosure, readable form hierarchy, and no clipped horizontal content.
- Masks are limited to store/product/order identity; spacing, fields, summary, totals, payment cards, buttons, and error surfaces remain test-visible.

## Security and isolation notes

- Exact signed-host authority remains the sole tenant selector. Raw `Host`, browser tenant data, or unsigned forwarding headers cannot select a store.
- The fixture stores only synthetic credentials, sanitizes observed cookie data to names, and routes hosted outcomes to a local fake transport.
- The locked local `axe-core/axe.min.js` SHA-256 is `7dbfabdfc6062936d79c873ddbb5f811a1219fca3928bd8cc9dd81f1e65f4720`.
- Protected untracked `.codex-evidence/` and `apps/customer-panel/docs/` were neither modified nor staged.
