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
