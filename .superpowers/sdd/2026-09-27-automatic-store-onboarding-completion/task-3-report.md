# Task 3 — durable onboarding jobs and access foundation

## Delivered

- SQL167 adds immutable original registration authority scopes, atomic verified-identity enqueue, one durable job per attempt, persisted access snapshots and scoped heartbeat. All four tables have forced RLS and no direct identity/app/public grants. Ten narrow SECURITY DEFINER functions use pinned `pg_catalog,saas` search path; catalogue assertions reject missing tables/functions, RLS drift and grants even with empty tables.
- Original scope is the fourth `PostgresRegistrationAttemptStore` constructor parameter and is bound inside the original workflow INSERT transaction, independently of worker/status flags. The SQL binder requires that workflow's insertion transaction, awaiting identity status and original timestamp. Task4 owns runtime wiring and now passes the configured scope always.
- Verified identity INSERT and job enqueue are atomic. Missing-proof legacy attempts receive no job and remain closed. Canonical legacy backfill uses a reviewed static NET/SITE authority map, matching committed operation proof, original fingerprint/idempotency digest, and exact active canonical admin/storefront domains. The scanner's environment never manufactures a scope. The root verified the two public mappings in both deployed Owner images and approved this proof rule.
- Claims use short `FOR UPDATE SKIP LOCKED` transactions, scope equality, durable verified identities, random60s lease tokens and expiry CAS. Defaults are15s ticks,25 jobs, concurrency2; pending completion does not spend failure budget; retries are15/30/60/120/300s, capped at10 before attention. SQL updates reject an expired or replaced lease. Access snapshots expire after5min and ready jobs become due for refresh then. Heartbeat expires after45s; failed claim cannot mark the worker healthy.
- Worker calls existing completion, reconciliation and Task2 fenced-recovery ports without importing session/handoff issuance modules. Completed tenant results have a scoped read-only proof port, so access refresh after `session_created` never re-enters completion or session creation.
- Access probes check committed tenant proof, active owner/store/subscription, media namespace, published valid design and exact canonical domains before DNS/TLS/GET. HTTP200 alone is insufficient: both tenant health responses must match schema/store/host. DNS addresses must be explicit allowlisted public addresses; TLS/SNI remain enabled, total request budget5s, body256KiB, redirect maximum1 and same origin. The probe checks central login, tenant admin login, admin/storefront health and public storefront. No provider requests.
- Worker flag is strictly absent/false by default; invalid values fail closed. `CELEBIX_ONBOARDING_EDGE_ADDRESSES` is an explicit comma-separated public edge IP allowlist required when enabled. Startup supervisor uses bounded crash backoff and forwards shutdown signals. Initialization DB failures retry inside the same process. Logs contain sanitized state/counts, not underlying exceptions or identifiers.
- Existing Next Webpack + TypeScript build the runtime into `.onboarding-worker/runtime.cjs` targeting Node20, without new dependencies or a Node upgrade. Owner build runs this step. `--check-runtime` loads the built runtime even while disabled and fails on missing packages/bundle. Root independently ran the built artifact with Node20.20.2 in an isolated image clone using network-none; exit0.
- Fixed transient negative initialization caching in customer-panel origin health and public storefront runtime: coalesced retries start at1s and cap30s; successful initialization remains cached.
- At root's explicit request, appended `resolveStorefrontSetupPaymentAvailability` to storefront `default-runtime.ts`. It uses current compiled authority, runtime flags, checkout infrastructure and exact DB execution-authority matches; it returns only provider/environment availability and performs no provider call. The Task6 route/type/test files remain root-owned.

## Verification evidence

RED was observed before implementation for missing worker/migration/probe/default adapter/supervisor modules; original scope transaction binding and mismatched scope tests failed on the old store; heartbeat test failed because claim failure still touched heartbeat; completed refresh test failed because completion was re-entered. PostgreSQL catalogue assertions failed before migration with `ONBOARDING_TABLE_AUTHORITY_ASSERTION_FAILED`. Legacy SQL test failed on the missing guarded backfill function before it was added. The missing-bundle smoke exposed and fixed a real symlink entrypoint detection bug.

Focused command:

```sh
node --experimental-transform-types --test apps/owner/lib/onboarding-jobs/*.test.ts apps/owner/scripts/onboarding-worker.test.mjs apps/owner/scripts/onboarding-supervisor.test.mjs apps/owner/scripts/sql/saas/registration-onboarding-jobs-migration.test.ts apps/owner/lib/saas-persistence/postgres-verified-identity-workflow.test.ts
```

Result: `tests40 / pass40 / fail0` (latest run). Existing Node transform-types/module-type warnings remain.

Real PG command:

```sh
node --conditions=react-server --experimental-transform-types --test tests/saas-phase2/onboarding-jobs/postgres.test.mjs
```

Task-owned PostgreSQL16.14 tunnel `127.0.0.1:56417`, exact allowlisted database `onboarding_jobs_empty_qa_20260927`, exact database marker `celebix-task-owned-disposable-onboarding-20260927`. Schema-only base through166, canonical plan seeds only; no restored customer rows. Earlier basic lease tests ran on a separate task QA restore before automatic backfill was introduced. Automatic legacy scans only ran in the schema-only QA database. Missing plan_limits seed was detected and root copied canonical rows unchanged before final testing.

Final output:

```text
Synthetic verification-to-ready 12604ms (realPG, injected network; not liveTLS evidence)
PG16 PASS: up/down/up, assertion tamper checks, atomic verified enqueue, legacy fail closed, awaiting exclusion, NET/SITE isolation, SKIP LOCKED claims, restart/expired lease CAS, pending budget, 10 retries/backoff, heartbeat45s, RLS, guarded rollback
1 test /1 pass /0 fail (79.60s)
```

The same real PG test also checks rollback after verified INSERT leaves neither identity nor job, same attempt has one job, canonical legacy backfill cannot bind NET into SITE, scope/store mismatch refuses snapshot, snapshot TTL5min, ready due-refresh, scoped completed-result read, actual tenant core creation and publication proof, and verification→ready below60s with injected healthy HTTP responses. No live TLS or real OIDC email-verification success is claimed.

`npm run typecheck --workspace @celebix/owner`: PASS after Task4's optional-handoff test narrowing.

`npm run build --workspace @celebix/owner`: PASS, exit0, including generated Node20 worker bundle, optimized compile, type validation and route generation. The subsequent bounded-housekeeping/authority-outcome worker changes were rechecked with worker bundle smoke, focused tests and typecheck.

`npm test --workspace @celebix/owner`:785 tests,783 pass,2 failures remain in unrelated payment-authority expectations:

- `compiled provider-keyed identities enable Iyzico and PayTR verification while execution authorities stay closed` (`merchant-provider-execution/production-config.test.ts:52`): test expects PayTR compiled authority null, but current generated source-bound metadata has enabled test evidence.
- `production validation-only worker never falls through to either execution queue after repeated empty verification claims` (`merchant-provider-execution/production.test.ts:352`): the same enabled generated authority makes this validation-only fake queue fixture return an invalid missing execution row (`unavailable`).

No payment metadata/flags were changed to make those tests pass. Root was notified to preserve actual configured authority and handle final test-fixture alignment. An earlier run had779tests/775pass/4fail, including two then-red Task4 pending/status tests; those two are resolved in the final run. `git diff --check`: PASS. Initial Owner build exposed Task4 client presentation importing a server barrel (`node:crypto`/`node:util`); Task4 replaced it with the browser-safe direct origin module. Build also encountered local ENOSPC; only current-worktree generated Owner `.next/cache` was removed after inspection. An initial force-style deletion was automatically rejected; a safe non-force deletion of that exact generated directory succeeded.

## Integration and deferred seams

- Task4 runtime: pass fourth scope on every new attempt regardless of rollout flags. Its callback/status reader uses `PostgresOnboardingJobRepository.readSnapshot({scope,attemptId,storeId?,now})`; caller enforces the external100ms callback budget. Tables and SQL TTL/scope/store authority were coordinated directly with Task4.
- SQL access table: `registration_onboarding_access(attempt_id,store_id,checked_at,state,safe_code)`, state ready/pending/unavailable. Job: `registration_onboarding_jobs(attempt_id,state,due_at,failure_count,lease_token,lease_expires_at,safe_code,created_at,updated_at)`; state pending/leased/ready/attention_required. `readHealth(scope,now)` returns sanitized pending/ready/attention counts and heartbeat state.
- Task4 status digest cleanup is wired after a successful tick only when `CELEBIX_ONBOARDING_STATUS_ENABLED` is exactly true, with limit100. It invokes SQL168 cleanup, which deletes only expired+1h status bindings, never workflow/job/proof rows. Housekeeping errors emit one sanitized code and do not alter provisioning counts. Disabled status remains compatible before168.
- Task7 root requested list/retry ports and owns their extension after this commit. Add `version bigint NOT NULL DEFAULT1 CHECK>=1` to jobs, increment on claim/finish, bounded scoped `listOperations(limit<=50)`, and scoped `requestRetry` CAS on exact version, state pending/attention and idle/expired lease. Root service must check the existing completion advisory lease; SQL should use the same nonblocking advisory lock to close the race. Retry changes only scheduling/failure count/version, never completion state, identity, idempotency key or recovery proof. Extend SQL function catalogue assertions from10 to12 and down signatures, then repeat final QA on a fresh schema-only fixture.
- Root owns final build/payment-metadata alignment, release backup/gates, staged rollout and live verification. No live application configuration, domain, payment flags, credentials or merchant records were modified by this task.
- Down migration intentionally refuses any persisted scope/job/access row; disabling worker is the nondestructive rollback. Synthetic QA data remains in task-owned databases for root teardown, with no production cleanup command.
