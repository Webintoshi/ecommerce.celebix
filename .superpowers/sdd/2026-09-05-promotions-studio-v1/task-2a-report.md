# Promotions Studio Task 2A checkpoint

## RED

- `node --test tests/saas-phase3/promotions-studio/migration-static.test.mjs`
  initially failed because migration `126`, its triplet, and the harness registration did not exist.
- `node tests/saas-phase3/promotions-studio/postgres-harness.mjs`
  initially failed because the migration file did not exist.

## GREEN

- `node --test tests/saas-phase3/promotions-studio/migration-static.test.mjs` — 2 passing tests.
- `node tests/saas-phase3/promotions-studio/postgres-harness.mjs` — exact `20/20` scenarios and `PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE 20/20`.
- `git diff --check` — clean.

## Included

- Additive 126 persistence triplet with eleven tenant-bound promotion relations, RLS/FORCE RLS, composite store references, audit immutability, operation ledger, guarded down migration, and PostgreSQL assertions.
- Security-definer promotion CRUD/list/detail/lifecycle/simulation/code/analytics/legacy/reservation foundations. Merchant RPC grants are app-only and direct application table DML is revoked.
- Strict top-level rule-document shape check and contract-aligned code whitespace rejection/Turkish uppercase normalization.
- Disposable PostgreSQL 16 harness registered in the current Phase 3 runner.

## Deferred to Task 2B/2C

- Complete evaluator target/audience/condition/stacking/margin matrix and reordered-input proof.
- Full reservation/redemption concurrency and recovery matrix.
- Seeded membership/feature/cross-tenant role behavior matrix and full lifecycle/version/replay/legacy operation behaviors. The current ACL scenario proves grants and direct-DML denial only.

## Commit

`0d7d3d198ce293f45ad283163de94559904621c1` (`feat(promotions): add tenant-safe promotion persistence`).

## Review fixes

### RED

- Added static and disposable PostgreSQL 16 regressions for complete PUBLIC function revocation, non-ASCII code rejection, strict nested rules, evaluator reconciliation, and an allowed-empty emergency down. These failed against the checkpoint migration.

### GREEN

- `node --test tests/saas-phase3/promotions-studio/migration-static.test.mjs` — 2 passing tests.
- `node tests/saas-phase3/promotions-studio/postgres-harness.mjs` — exact `25/25` scenarios and `PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE 25/25`.
- `git diff --check` — clean.

### Hardened scope

- Every promotion helper/RPC now revokes `PUBLIC` and non-app roles; the app role receives only authority-gated merchant entry points.
- Rule validation is exact and bounded through nested benefit, target, audience, trigger, timestamp/timezone, limits, condition, combination, margin, and progress-policy checks before evaluator casts.
- Evaluator outputs reconciled eligible/applied IDs with attributed line/shipping/gift effects; shipping totals remain separate.
- Promotion history and order references are immutable/store-scoped; reservations are transition-only. The down migration removes dependencies/functions before tables and has a disposable allowed-empty proof.
- Operation fingerprints/replay include update, lifecycle, and code batches; generated batch codes use cryptographic entropy with bounded collision retry.
- Legacy adoption accepts only complete safe mappings, inserts its initial version and valid code in the same transaction, and remains idempotent.

## Canonical-rule and legacy-code review fixes

### RED

- Added PostgreSQL 16 regressions for duplicate target, audience, code, payment, shipping, sales-channel, and combination arrays; malformed sales-channel content; unordered quantity tiers; and collision-tolerant legacy adoption. The canonical-rule scenario failed against the prior migration.

### GREEN

- `node tests/saas-phase3/promotions-studio/postgres-harness.mjs` — exact `27/27` scenarios and `PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE 27/27`.

### Hardened scope

- Nested rule arrays now have canonical uniqueness checks. Tiers are strictly ascending and every sales channel is bounded trimmed, non-control text.
- Legacy migration detects both existing-code and same-run legacy-code collisions before inserting, leaves colliding rows unmodified/read-only with `code_conflict`, and continues with independent safe rows. A second adoption run remains a no-op.
