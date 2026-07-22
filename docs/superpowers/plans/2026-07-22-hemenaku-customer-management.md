# Hemenaku Customer Management Implementation Plan

**Goal:** Activate the pinned donor `Müşteriler` family only after durable, store-scoped customer, address, consent, note, tag, segment, archive and export behavior exists in `apps/customer-panel`.

**Authority boundary:** `__Host-celebix_panel` → durable panel session → current `TenantContext` → `customers` plan feature → PostgreSQL SECURITY DEFINER functions. Browser requests never carry store, tenant, principal, membership or plan authority.

**Donor:** read-only `apps/admin` at `fc6c5318b47f045a7cefcedc7612d5b10563ba32`.

## Task 1 — Contracts and action policy

- [ ] RED: add contract tests for immutable exact customer, address, consent, note, tag, segment, list, detail and mutation DTOs.
- [ ] GREEN: add `packages/saas-contracts/src/customers/**`, exports and `customers.*` merchant actions.
- [ ] Verify malformed, private-ID, unknown-key, non-canonical timestamp/email/phone and mutable-array rejection.
- [ ] Commit: `feat(saas): add customer management contracts`.

## Task 2 — Durable PostgreSQL authority

- [ ] RED: add a disposable PostgreSQL 16 harness for schema, ACL, FORCE RLS, store-composite FKs, feature/role denial, cross-store denial, concurrency, replay/mismatch, archive and rollback/reapply.
- [ ] GREEN: add migrations `033` and `034`, assertions and a checksum manifest.
- [ ] Tables: customers, addresses, consents, notes, tags, assignments, segments, memberships and immutable operations.
- [ ] Functions: summary/list/get/create/update/archive, note add/archive, tag list/create/assign, segment list/create/assign and bounded export.
- [ ] Direct runtime table writes remain denied.
- [ ] Commit: `feat(saas): add customer management persistence`.

## Task 3 — Repository

- [ ] RED: add projection, exact SQL signature, cursor, error classification, rollback and commit-unknown recovery tests.
- [ ] GREEN: add `packages/saas-data/src/customers/**` with immutable facades and one read-only recovery after unknown commit.
- [ ] Verify cross-store opaque IDs never bypass PostgreSQL authority and no private driver values reach errors.
- [ ] Commit: `feat(saas): add customer repository authority`.

## Task 4 — Panel HTTP runtime

- [ ] RED: add exact path/method/query/origin/cookie/private-header/body-size tests.
- [ ] GREEN: add server runtime preflight, `/api/customers/**` handlers and safe DTO clients.
- [ ] GET remains origin-independent but credential-bound; every POST requires exact panel Origin.
- [ ] Commit: `feat(panel): expose customer management api`.

## Task 5 — Donor presentation and navigation

- [ ] RED: add navigation exact/near-match tests and loaded/empty/loading/error/conflict/permission UI tests.
- [ ] GREEN: implement `/customers`, `/customers/new`, `/customers/[customerId]`, `/customers/segments`, `/customers/tags` with donor shell geometry and responsive cards/tables.
- [ ] Activate exactly `Müşteriler → Tüm Müşteriler, Segmentler, Etiketler, Yeni Müşteri`.
- [ ] Add only persisted customer totals/activity to `Özet`.
- [ ] Commit: `feat(panel): add customer management console`.

## Task 6 — Gate

- [ ] Run contracts/data/customer-panel tests and typechecks.
- [ ] Run PostgreSQL 16 harness including rollback/reapply and cleanup.
- [ ] Run customer-panel and Owner builds plus affected regressions.
- [ ] Verify `apps/admin/**` diff count is zero, donor SHA exists, no forbidden authority/private IDs/secrets, and `git diff --check` passes.
- [ ] Push normally; no deployment or production mutation.
