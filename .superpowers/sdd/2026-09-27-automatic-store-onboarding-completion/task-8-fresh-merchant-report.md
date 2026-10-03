# Task 8 — Fresh zero-store merchant integration verification

Prepared at 2026-09-28T20:23:43.891204+00:00. Application/SQL frozen source: `3de4bbcdb2808a97e4add42023356b0af2dae046`.

## Current state

The merchant repository integration gate is complete through **one bounded continuation of the existing synthetic graph**: 4 tests passed, 0 failed, 3 other database modes skipped. The actual continuation took 20.010 seconds; its complete focused command took 20.793 seconds. It started at 2026-09-28T21:28:43.158380+00:00.

The original whole fresh-harness process receipt is unavailable after the earlier environment/process reset. On restoration, the exact marked database already contained one completed synthetic registration graph and no product, variant, media or delivery fee. The zero-store guard prevented a fresh rerun before any mutation. This is not reported as a whole fresh-harness pass; registration creation/replay was not retried, and the missing in-memory identity encryption key was not replaced.

Root authorized finishing only the merchant stages on that same graph. No extra database, fixture reset/delete, tenant creation, encrypted identity retry, role/grant change or operation proof alteration was performed. All original synthetic registration rows and the normal seeded notification setting are preserved.

## Fresh guarded PostgreSQL fixture

- New database: `onboarding_merchant_fresh_qa_20260928` in existing `celebix-onboarding-qa-20260927`.
- Exact task label, loopback binding, PG16.14 and disposable database marker verified.
- Target did not exist before creation; existing-target guard retained.
- Restored only private through-166 schema and canonical seed/plan-feature dumps from the prior inspected fixture report.
- Exactly six up/assertion archive members hash-matched frozen 3de and passed; stores count before merchant fixture: **0**.
- Existing QA databases, including the prior synthetic merchant graph, were preserved. No reset/delete/drop or production database operation. No ad hoc role/grant change.

| SQL member | Frozen SHA-256 | Result |
|---|---|---|
| `apps/owner/scripts/sql/saas/202609270167_registration_onboarding_jobs.up.sql` | `516b6fa5e0ea7cad57cbb31f778fef03add6d1f65a6751eccdf1793f894ff39c` | PASS |
| `apps/owner/scripts/sql/saas/202609270167_registration_onboarding_jobs_assertions.sql` | `9837e895c3c2bd5acf6bfbbbad618aa52f4a43ff03a6f1ff4d4b0bfe87df05f7` | PASS |
| `apps/owner/scripts/sql/saas/202609270168_registration_status_bindings.up.sql` | `ff55c01d6acbc9c1c4780fb5bcf2a6e2dae1b6bb9d49040a9915e1ad5e9e46f0` | PASS |
| `apps/owner/scripts/sql/saas/202609270168_registration_status_bindings_assertions.sql` | `d268d7bd341b129623922de622344da6045b7ddb6a31acf39ef7fa1f3fcf1f7c` | PASS |
| `apps/owner/scripts/sql/saas/202609270169_checkout_delivery_days.up.sql` | `bd8755981cbf499610584ad0acdfd6f727fd6bbe53aedc70b7196f7bea6d5913` | PASS |
| `apps/owner/scripts/sql/saas/202609270169_checkout_delivery_days_assertions.sql` | `04bf24c68b537a278b8971d786e776c725a3cf051c8938d92630e5215c771d9f` | PASS |

## Narrow test-only change and local checks

Only `tests/saas-phase2/onboarding-resilience/merchant-acceptance-postgres.test.mjs` is changed: an exact two-database allowlist adds the new fixture name alongside the preserved old fixture. No prefix/glob authority is accepted. The configured database is still verified against its actual database name, marker, PG16 and zero stores before fresh creation. Ambient PG/Supabase/database-URL fields remain denied.

The added exact-name acceptance expectation failed first with `explicit_disposable_merchant_qa_authority_required` (intended RED), then passed after the allowlist update: **3 passed, 0 failed, 3 real-PG mode tests skipped** with no opt-in. The prefix-similar name `onboarding_merchant_fresh_qa_20260928_extra` remains denied. These are local synthetic guard/image/constructor checks and are not the full PostgreSQL gate.

Node24.11.1 runs this existing TypeScript test graph using `--experimental-transform-types --conditions=react-server`. A preliminary strip-only runner encountered an unsupported TS parameter property before tests; switching the test runner flag corrected that runner configuration without app edits. Production Node20 packaging/flags are unchanged.

`git diff --name-only 3de4bbc -- apps packages` is empty, so application/package source matches frozen release bytes. The full fixture uses existing owner-only private shipping projection inside a read-only transaction, and explicitly verifies owner execute=true/workflow execute=false before creating its tenant. It does not widen that port.

## Full-gate boundaries

The intended full fresh run creates one synthetic verified identity/tenant graph and exercises actual PostgreSQL registration persistence, tenant creation/replay, draft product/variant replay, validated media persistence, design save/publish replay, delivery fee activation/replay and setup repository reads. Image bytes and object put/publish use an in-memory fixture; global fetch is denied. No external identity, R2, provider, order or payment execution is authorized or attempted. A ready access/TLS/browser or signed OIDC E2E result is not claimed by this local graph.

Preparation receipt: `/tmp/celebix-onboarding-merchant-fresh-qa-prep-result.json`; helper: `/tmp/celebix-onboarding-merchant-fresh-qa-prep.py`. Red/green local output: `/tmp/celebix-onboarding-merchant-fresh-allowlist-{red,green}.tap`. Those original `/tmp` artifacts were lost in the environment reset; they are historical preparation evidence, not the current full-run receipt. Durable current receipts are listed below.

## Restored-loopback read-only acceptance

Root restored the task-owned SSH loopback tunnel and independently confirmed the existing task PostgreSQL container uses its existing trust authentication. The runner used the exact local host/port and user from the guarded harness, with no password acquisition, `.pgpass` access, ambient database URL or authentication change.

A read-only acceptance completed at 2026-09-28T21:24:20.293Z before merchant writes:

- Exact database, PG16.14 and disposable marker; one synthetic `.invalid` principal and matching `qa-merchant-` store.
- One committed tenant operation and completed registration, one active owner/subscription/domain/admin domain/storefront domain/media namespace/design.
- Products, variants, media and `shipping_setting` delivery fees: 0. Orders/payment methods/payment attempts/provider profiles: 0.
- One expected active version1 `notification_setting`, created by the frozen SQL089 `order_email_seed_notification_setting` membership trigger. This is a normal initial setting and was not treated as a delivery fee, deleted, changed or executed.
- Actual app-role setup and design reads, and actual host-resolver storefront reads: starter publication version1 is available; the public active product catalog is empty; the internal owner-only shipping projection returns null.
- Setup states: products and delivery `action_required`, design `ready`, payment `none`, access `unavailable`.
- No external fetch calls. Current full-row count/digest snapshots were equal before/after this read interval. They are not claimed as preservation proof for the earlier lost process interval.

The first read-only scope guard stopped on the now-present store count, as intended. A separate overly broad prerequisite initially expected all merchant settings to be absent; source inspection identified the SQL089 notification seed and replaced that assumption with an exact kind/status/version guard. Both failed checks were read-only and their private diagnostic logs remain retained.

## Narrow continuation harness and guard verification

The test adds explicit mode `continue-merchant`, accepted only for exact database `onboarding_merchant_fresh_qa_20260928`. The preserved old merchant database, prefix-similar names, unknown modes and ambient PG/Supabase/database URLs remain denied. A new guard expectation first failed with `merchant_qa_mode_invalid`, then passed after the mode implementation: **3 unit/guard tests passed, 4 real-PG modes skipped** without opt-in.

Before merchant writes, continuation verifies the real constructors, exact marked PG16 database, all10 singleton graph counts, actual synthetic store/principal/owner, exactly one committed operation/completed registration, zero product/variant/media/fee/sales/payment/profile rows, the exact SQL089 notification seed, current version1 design, existing merchant save permission and owner-only read projection. Existing registration and notification full rows are hashed before/after. Original app/package files still match frozen release3de; only the test harness and this report are changed.

The fresh path and this continuation share the extracted post-tenant merchant stages. Continuation uses the persisted tenant-operation result and actual principal identity; it does not call registration save/consume, record identity, Tenant Core creation, recovery or registration replay.

Actual focused mode:

```sh
CELEBIX_MERCHANT_ACCEPTANCE_QA=merchant-acceptance-20260928 \
CELEBIX_MERCHANT_ACCEPTANCE_DATABASE=onboarding_merchant_fresh_qa_20260928 \
CELEBIX_MERCHANT_ACCEPTANCE_MARKER=celebix-task-owned-disposable-onboarding-20260927 \
CELEBIX_MERCHANT_ACCEPTANCE_MODE=continue-merchant \
node --conditions=react-server --experimental-transform-types --test --test-reporter=tap \
  tests/saas-phase2/onboarding-resilience/merchant-acceptance-postgres.test.mjs
```

The durable launcher whitelisted only PATH and these four explicit opt-in fields, created an exclusive mode0600 started receipt before dispatch, and retained the complete output in the private task directory. It executed this mutation mode once. No further test or mutation was run after its passing result.

## Final actual continuation result

- **4 passed / 0 failed / 3 other modes skipped**, exit0.
- One draft product and variant created through actual app-role catalog save; retry replays the same product operation.
- One active media row persisted through the actual upload saga. Locally generated validated PNG bytes, digest and exact tenant/product namespace are checked; retry leaves one in-memory object write. No R2 or public image request occurs.
- Actual design save/publish operations and their retries advance the original design from version1 to version2. The actual public repository reads publication2 and color `#224466`; its active product catalog remains empty because the product is draft.
- One delivery fee transitions draft to active version2; retry replays the same operation. Existing private owner-role checkout projection reads **1489 cents and365 days** exactly.
- Actual final setup states: products `action_required`, design `ready`, delivery `ready`, payment `none`, access `unavailable`.
- All10 registration graph table full-row count/digests are identical before/after continuation; the SQL089 notification setting full-row count/digest is identical too. Role/superuser/bypass-RLS catalogue digest is unchanged. Existing immutable registration/operation proof is retained.
- Orders, payment methods, payment attempts, provider profiles and external fetch calls: **0**.

Durable private evidence directory: `/Users/Celebix/.codex/onboarding-release-20260929`, mode0700. Current files, each mode0600:

- `merchant-fresh-initial-readonly-proof.json`: safe initial scope, repository/setup/public starter reads and read-interval row digests.
- `merchant-continuation-guard-red.tap` and `merchant-continuation-guard-green.tap`: narrow mode authority regression.
- `merchant-continuation-started.json`: one-attempt scope, frozen application source and exact test SHA-256 `81903dcd66fa780954bd94479add08b6d4e38e81920d577caaa0244b1a53d399`.
- `merchant-continuation-final.tap` and `merchant-continuation-final-result.json`: complete focused output, exit/totals, safe final counts and preservation digests.

The preserved synthetic graphs remain in the task-owned QA databases. This closes the merchant repository integration risk through explicit initial read-only evidence plus same-graph continuation. It does not prove the unavailable whole fresh-harness receipt, real OIDC/email, browser login, public wildcard TLS/routing, R2 transfer/rendering, provider execution, checkout payment or order creation.
