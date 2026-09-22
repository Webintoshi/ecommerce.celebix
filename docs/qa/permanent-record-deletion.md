# Permanent Record Deletion QA

## Candidate

- Application source: `356833e020fb2021e4ccecdcc68628b58372eed5` (`feat(catalog): add permanent product and category deletion`)
- Branch: `codex/permanent-record-deletion`
- Scope: owner/admin permanent deletion for orders, products, and categories; archive/restore remains separate.
- Live state: not deployed by this run; migration 144 was not applied; no live customer record was deleted.

## Verified behavior

- Strict, same-origin impact and delete routes use server-derived tenant authority.
- Owner and admin can see/use deletion; editor and analyst are denied before database access.
- Current canonical label, irreversible acknowledgement, record version, stable operation ID, and request fingerprint are required.
- Order deletion retains external payment/fulfilment state and records only a minimal immutable deletion audit.
- Product deletion hides the product first, proves each owned media object absent, retains historical order-line snapshots, then removes catalog/pricing/barcode relations.
- The media-cleanup preparation transaction commits before `cleanup_pending`; it is not rolled back as an error.
- Category deletion detaches product/design references and updates descendants parent-first before removing the category.
- Exact product-media cache invalidation occurs only after committed deletion.
- Existing media upload `pending -> active` lifecycle remains allowed.

## Automated evidence

- `@celebix/saas-data`: 645 pass, 0 fail.
- Customer Panel: 1,447 pass, 1 existing skip, 0 fail (1,390 + 57 two-phase suite).
- Migration 142/143/144 artifact suite: 9 pass, 0 fail.
- Staging migration runner suite: 4 pass, 0 fail.
- Product media deletion service: 4 pass, 0 fail.
- Contracts/data/cache/Customer Panel scoped typechecks: pass.
- Customer Panel production application build: pass (86 static/dynamic routes generated).
- `git diff --check`: pass.

## Known gates

- The official Coolify build wrapper stopped before application compilation with `iyzico_sandbox_build_invalid`. Payment approval metadata was not regenerated or rebound. The payment-neutral Customer Panel production build passed.
- The complete Owner suite has two unrelated provider-execution baseline failures: one PayTR compiled identity expectation and one repeated empty verification-claim fixture. Permanent-deletion migration tests pass independently.
- No local `psql`, PostgreSQL server, or Docker runtime is available in this worktree environment. Migration 144 therefore still requires a disposable PostgreSQL rehearsal before any approved staging migration/deployment.
- Product deletion fails closed with `cleanup_failed` for an unreviewed durable foreign-key dependency instead of partially deleting relational data.

## Safety boundary

No deployment, migration, payment rebind, DNS change, Auto Deploy change, or additional live deletion was performed while producing this candidate. Live acceptance must use a separately approved disposable QA record.
