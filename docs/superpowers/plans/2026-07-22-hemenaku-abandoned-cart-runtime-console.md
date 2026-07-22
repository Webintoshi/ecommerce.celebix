# Hemenaku Abandoned Cart Runtime and Console Plan

> Execute with `superpowers:executing-plans` and red/green TDD. This plan continues the approved full merchant-admin parity design without exposing a destination before its real authority is complete.

**Goal:** Complete a real tenant-scoped abandoned-cart vertical slice: trusted-host storefront capture, durable lifecycle, customer-panel HTTP/runtime, Hemenaku-adapted loaded/empty/error UI, navigation and truthful summary activation.

**Authority:** `TenantContext` remains the only merchant authority. Storefront writes use the already trusted server-selected hostname and `celebix_saas_workflow`; browser store/tenant IDs are forbidden. The browser receives only an opaque, first-party, `__Host-` cart credential; PostgreSQL stores only its SHA-256 digest. Prices, product labels and media come from persisted store-scoped catalog rows, never browser amounts.

**Constraints:** `apps/admin/**` read-only; no legacy Supabase abandoned-cart API; no `/api/admin/**`; no production deploy/mutation/credentials/merge; no fake rows/KPIs; preserve `.codex-artifacts/`.

## Task 1 — Public cart capture authority

**Files:**
- Create `apps/owner/scripts/sql/saas/202607220032_abandoned_cart_capture.{up,down}.sql`
- Create `apps/owner/scripts/sql/saas/202607220032_abandoned_cart_capture_assertions.sql`
- Modify `apps/owner/scripts/sql/saas/phase3b3-abandoned-cart-manifest.json`
- Create `packages/saas-data/src/abandoned-carts/public-{repository,repository.test,types,validation}.ts`
- Modify `packages/saas-data/src/abandoned-carts/index.ts`
- Extend `tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs`

- [ ] RED: exact host/digest/cart-item capture tests fail because migration/repository do not exist.
- [ ] Implement `abandoned_carts_capture`, `abandoned_carts_mark_stale`, `abandoned_carts_convert` behind `celebix_saas_workflow` only.
- [ ] Resolve store from exact active canonical host in PostgreSQL; reject browser store IDs, foreign catalog IDs, browser money/title/media, unknown/archived products and invalid quantities.
- [ ] Upsert one digest-bound cart under row lock; derive catalog snapshot and integer money server-side; replace ordered items atomically; version every material update.
- [ ] Persist only digest, never raw credential. Mark stale active carts abandoned after the exact configured interval; conversion creates recovered evidence without fabricating an order.
- [ ] PostgreSQL tests: role/ACL, host/store isolation, digest secrecy, catalog authority, concurrency, expiry, conversion, replay, backup/restore, rollback/reapply, cleanup.
- [ ] Commit `feat(saas): add abandoned cart capture authority`.

## Task 2 — Storefront first-party capture route

**Files:**
- Create `apps/storefront-shared/lib/cart-capture/{credential,request,runtime}.ts` and tests
- Create `apps/storefront-shared/app/api/cart/route.ts`
- Modify `apps/storefront-shared/lib/default-runtime.ts`
- Modify `apps/storefront-shared/package.json` only if no existing test glob covers the new tests (prefer no dependency change)

- [ ] RED: credential, hostile body, internal-host, price injection and cookie tests fail.
- [ ] Generate 32 random bytes; emit `__Host-celebix_cart` with `Secure; HttpOnly; SameSite=Lax; Path=/`; digest exact bytes with SHA-256.
- [ ] Route accepts exact same-origin POST only, bounded JSON containing only ordered `{productId,variantId,quantity}` plus optional canonical customer identity.
- [ ] Use `selectTrustedStorefrontHostAuthority`; never trust body/query/cookie/forwarded tenant IDs.
- [ ] Runtime preflight requires migration 032 and workflow membership; unavailable stays 503 and emits no cart cookie.
- [ ] Tests prove response contains no raw digest/store ID and captures only catalog-authoritative totals.
- [ ] Commit `feat(storefront): capture browser carts durably`.

## Task 3 — Customer-panel abandoned-cart HTTP/runtime

**Files:**
- Create `apps/customer-panel/lib/server-abandoned-carts/{runtime,runtime.test}.ts`
- Create `apps/customer-panel/lib/abandoned-cart-http/{default,handler,handler.test,request-authority,request-authority.test,request-input,request-input.test}.ts`
- Create routes under `apps/customer-panel/app/api/orders/abandoned-carts/**`
- Modify staging runtime composition only to register `PostgresAbandonedCartRepository` with the existing approved access runtime.

- [ ] RED: route/auth/session/origin/private-header tests fail.
- [ ] GET summary/list/detail and POST recovered/archive use the same session + `TenantContext` pattern as orders.
- [ ] Exact paths/methods, bounded query/body/idempotency, no private authority headers, no browser tenant/store IDs.
- [ ] Missing/wrong session, wrong origin, cross-store, malformed projection and repository errors fail closed with stable codes/no cache.
- [ ] Commit `feat(panel): expose abandoned cart api`.

## Task 4 — Hemenaku console and truthful activation

**Files:**
- Create `apps/customer-panel/components/orders/AbandonedCartConsole.tsx` and CSS
- Create `apps/customer-panel/app/orders/abandoned-carts/{page.tsx,[cartId]/page.tsx}`
- Create `apps/customer-panel/lib/abandoned-cart-ui/{client,client.test}.ts`
- Modify `apps/customer-panel/lib/panel-ui/navigation.ts` and exact tests
- Modify `apps/customer-panel/lib/panel-ui/dashboard-model.ts`, dashboard view and exact tests only to display repository-backed cart summary.

- [ ] RED: exact navigation, active-leaf, Turkish copy, loaded/empty/error/detail, mutation and accessibility tests fail.
- [ ] Adapt donor `apps/admin/app/admin/terkedilen-sepetler/**` information architecture/styles only; use target components/tokens and real API.
- [ ] Render exact truthful states; customer identity may be absent; currency formatting is TRY; no synthetic recovery rate.
- [ ] Activate `Terk Edilen Sepetler` under Siparişler only after API/runtime tests pass.
- [ ] Dashboard adds only proven abandoned/lost/recovered values; unavailable stays controlled unavailable, never zero-success.
- [ ] Verify 48px targets, keyboard focus, table/card responsive switch, zero horizontal overflow at 320/390/1024/1025.
- [ ] Commit `feat(panel): add abandoned cart console`.

## Task 5 — Whole-slice verification and push

- [ ] `npm test --workspace @celebix/saas-contracts`
- [ ] `npm test --workspace @celebix/saas-data`
- [ ] PostgreSQL abandoned-cart harness full PASS.
- [ ] `npm test --workspace @celebix/customer-panel`
- [ ] customer-panel and storefront-shared typecheck/build PASS.
- [ ] Owner typecheck/build PASS.
- [ ] Donor diff for this branch range = 0; forbidden Supabase/admin API/browser authority/secret scans clean.
- [ ] Local authenticated desktop/mobile capture proves console loaded/empty/error and exact navigation; artifacts remain untracked.
- [ ] Push normally; deployment remains 0.
