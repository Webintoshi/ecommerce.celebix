# Order bump native 223 acceptance

This harness only creates a disposable local PostgreSQL 16 database. It does not read production credentials or write production data. The owned cluster is stopped and removed in `finally`.

Run from the repository root:

```sh
node tests/saas-phase3/order-bumps/order-bumps-harness.mjs
```

It reuses the existing PostgreSQL binaries used by `accounting-ledger/fixture.mjs`; no dependency or database installation is performed. Evidence defaults to `/tmp/celebix-order-bump-223-evidence` (override `ORDER_BUMP_EVIDENCE_DIR`).

## Verification

- The initial red capability test runs `--red` against migration 222 and verifies the native 223 function is absent.
- Full predecessor function OIDs, definitions, owners, ACLs, configuration and volatility, relation ownership/ACL/RLS, and every table's sorted JSON data digest are captured before applying 223.
- 223 is additive: two private RLS tables and nine functions; existing native functions and privileges are unchanged.
- The SQL fixture checks real tenant authority, strict references/input, immutable actor-bound receipts, CAS/replay, rules and source/category/subtotal conjunction, entire-product exclusion, archived selections, current canonical variant prices, cart price drift, real cart API last-unit behavior, and real prepared POS inventory holds.
- Two actual PostgreSQL clients test competing expected versions and same-key replay. Receipt failure rolls back settings and journal together.
- Empty rollback restores the complete predecessor function/relation/table manifests, then reapplication passes again. Nonempty rollback refuses to discard user settings or operation evidence.
- Canonical public offers execute in a read-only transaction and preserve every table's data digest.

## Latest isolated result

27 SQL behavior checks, 2 concurrent checks and 2 additional native checks passed. Both package typechecks, the 566-test full contract suite and 13 focused contracts/repository tests passed.

The fresh repository fixture contains **1682 predecessor functions and 333 tables** through native 222. It is not a substitute for the release owner's separate rehearsal against the current full production backup (which includes historical live objects omitted by repository bootstrap).

The compact machine receipt is `acceptance.json`; it includes exact native SQL SHA-256 hashes. Source tests and SQL are the authority; release evidence must be rebound if source changes.
