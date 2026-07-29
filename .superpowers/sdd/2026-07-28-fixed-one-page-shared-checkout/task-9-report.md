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

## Fix Round 1 — real provider-boundary proof

This section supersedes the earlier references to a fake hosted-provider transport. The acceptance fixture no longer fabricates `/api/checkout/submit` responses. Every checkout submission traverses the production Next route, repository transaction, execution-authority check, payment attempt, provider adapter, and database effects.

### Provider transport and fail-closed authority

- A Node `--import` preloader wraps `globalThis.fetch` only for the exact PayTR token and Iyzico sandbox checkout-form initialization endpoints. Every other request delegates to the native fetch implementation.
- The preloader validates the actual provider packets and returns bounded, signed synthetic Iyzico outcomes without exposing credentials, request bodies, cookies, customer data, order IDs, or digests in diagnostics.
- PayTR follows Decision B: the browser first receives a selectable stale method, then the fixture revokes the exact database execution authority before submission. The real checkout route returns `409 payment_unavailable`, performs zero provider calls, and leaves no payment attempt, bridge, hold, or order.
- Iyzico redirect, processing/unknown, and rejected paths each reach the exact provider endpoint through the real adapter. Their database states are asserted respectively as active/held, active/held, and failed/released with no premature order creation.

### Production fixes discovered by the proof

- Added the narrow workflow-callable `saas.storefront_checkout_execution_authority_matches(...)` security-definer wrapper. The owner-only private matcher remains inaccessible to the runtime role; SQL assertions lock both ACLs and function definitions.
- Corrected the hosted-provider basket calculation so its item total exactly equals the immutable payable amount, including shipping and discounts, while retaining the 100-line provider bound.
- Restored focus to Iyzico's required identity input after native invalid handling and to the delivery apply button after the asynchronous delivery rerender.
- The keyboard-only purchase uses native radio-group arrow navigation and completes COD without pointer input.
- Page zoom is performed through CDP and verified using `visualViewport`; CSP monitoring remains active throughout the run.

### RED/GREEN evidence

- The static gates first failed for the missing exact-endpoint preloader, `visualViewport` zoom proof, workflow wrapper, and authority ACL assertions, then passed after implementation.
- PostgreSQL first exposed a hosted basket mismatch (`8000 !== 9500`) and then passed after the basket invariant fix.
- Production browser runs exposed, in order, unsafe diagnostic capture, an invalid fixture IP, stale-authority behavior, lost identity focus, a denied private matcher, a provider-basket mismatch, lost delivery focus, and incorrect keyboard radio traversal. Each regression was reproduced before its focused fix.

### Final verification after all fixes

- `node tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs`
  - PASS twice in separate clean, process-level runs with exit code 0 after all other gates.
  - Console errors: 0; page exceptions: 0; failed requests: 0; CSP violations: 0.
  - Critical/serious accessibility violations: 0 at desktop and mobile widths for both tenants/themes.
  - PayTR: exact `409 payment_unavailable`, zero provider calls, zero attempt/bridge/hold/order effects.
  - Iyzico: exact provider call count 1 per scenario with redirect, processing, and rejected database-state assertions.
  - Bank transfer idempotency and keyboard-only COD completion pass through the real repository path.
- `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`
  - PASS against disposable PostgreSQL 16.
  - The runtime connection uses TCP SCRAM credentials with TLS; the local-socket trust connection is restricted to fixture administration. A wrong runtime password is explicitly rejected.
- `node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs tests/saas-phase3/payment-adapter-runtime/static-security.test.mjs`
  - 21 passed, 0 failed.
- `npm test --workspace @celebix/storefront-shared`
  - 259 passed, 0 failed.
- `npm run typecheck --workspace @celebix/storefront-shared`
  - PASS.
- `npm run build --workspace @celebix/storefront-shared`
  - PASS using the dependency version already present in the shared worktree; this task does not change package manifests or the Next version.
- `git diff --check`
  - PASS.

The Task 10 rollout manifest, isolated-staging runner, and rollout documentation remain outside this commit so their owner can regenerate them from the final SQL hashes.
