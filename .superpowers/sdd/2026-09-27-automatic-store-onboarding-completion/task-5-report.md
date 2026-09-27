# Task 5 — Checkout delivery fee editor

## Scope and result

Implemented a separate delivery fee editor on `/settings/shipping#checkout-delivery`. The existing BasitKargo console remains present with its original `shipping.manage` permission and behavior. The new editor uses `configuration.read` / `configuration.manage`, the existing merchant-admin HTTP/runtime/repository, server-owned tenant authority, expected versions, canonical fingerprints and operation keys. It makes no provider calls.

The editor requires an explicit fee, accepts exact integer kuruş in `0..100000000`, and accepts optional integer days in `1..365`. Turkish `14,89` becomes `1489` without floating point rounding. Explicit zero renders **Ücretsiz teslimat**. Loading failures remain unavailable; missing fees remain unconfigured. Draft and activation actions are explicit; moving an active record to draft is labeled **Teslimatı kapat ve taslak kaydet**. Existing `regions` / `freeShippingThresholdCents` are preserved but are not presented as applied checkout rules. Cleared optional days are removed from the saved config.

Version conflicts preserve entered values until an explicit reload. An uncertain mutation freezes the original payload and reuses the same operation key on retry. Successful writes with a failed subsequent read display saved/read-unavailable feedback rather than pretending the refresh succeeded.

### Setup reader interface

`apps/customer-panel/lib/checkout-delivery-ui/model.ts` exports:

- `CheckoutDeliverySettings { shippingPriceCents: number; estimatedDays?: number }`.
- `readCheckoutDeliverySettings(config)`: `null` means an explicit fee is absent; malformed present fee/days throw.
- `selectCheckoutDeliveryRecord(records)`: latest non-archived record, including drafts, for editing.
- `buildCheckoutDeliveryConfig(existing, settings)`: retains other existing allowed fields.

Task 6 should separately select an **active** record with an explicit fee for readiness; a read/parse error is unavailable. Provider connection does not establish fee readiness.

## SQL boundary found and repaired

The first repository regression failed before SQL with `MerchantAdminRepositoryError: invalid_input` because `CONFIG_KEYS.shipping_setting` excluded `shippingPriceCents`. The typed allowlist and fee/days validation now accept the approved shape while preserving optional fee compatibility for older generic records.

Real PG16 testing then confirmed an installed legacy validator chain still constrained shipping `estimatedDays` to numeric `1..90`, despite the storefront commerce parser accepting integer `1..365`. Sanitized function metadata: `saas.merchant_admin_config_valid(text,jsonb)` delegates through `merchant_admin_config_valid_without_storefront_checkout` to the installed `merchant_admin_config_valid_without_starter_theme`, whose shipping branch contains the 90-day limit. The latter historical definition is absent from current repository migrations. Aggregate validation results before repair: days 1/30/31/60 accepted, 365 rejected.

Parent reserved migration **169** after the repository/live ordinal check. `202609270169_checkout_delivery_days` clones the installed validator privately, retains the original validator OID/owner/ACL, and overrides only optional shipping days with integer `1..365`. Other kinds, fields, fee rules and legacy validation delegate to the installed definition. It does not update merchant data. Owner-only RLS backup captures exact original definitions and metadata. Down refuses changed definitions/ACL/owners and incompatible persisted shipping records (including drafts/archived rows).

The initial down gate exposed planner evaluation of `pg_get_functiondef` against aggregate catalog rows. Revised down loads each exact function metadata row before evaluating its definition. The revised up/assertions/down/up cycle passed and restored the exact original definition/OID/owner/ACL. No catalog security checks were weakened.

## Verification

### RED / GREEN

- Repository fee acceptance regression: observed `invalid_input` caused by the missing typed allowed key; after the fix all 19 merchant-admin repository tests pass.
- New model/client/presentation tests: observed actual assertion failures against temporary minimal implementations, then 8 passed. A later active-record/missing-fee copy regression also failed first, then passed after removing incorrect draft wording.
- Real React DOM behavior tests: five failed against an empty component, then five passed after implementation. Exact input edits, zero/draft, permissions, version conflicts and uncertain retry key/payload are exercised.
- PG16 draft days 1 worked before migration; activation days 365 failed with SQL `invalid_input`. After169 the complete round trip passed.

### Commands and outputs

```sh
node --experimental-transform-types --test \
  packages/saas-data/src/merchant-admin/repository.test.ts \
  apps/customer-panel/lib/merchant-admin-http/handler.test.ts \
  apps/customer-panel/lib/checkout-delivery-ui/*.test.ts \
  apps/customer-panel/components/shipping/*.test.ts \
  apps/owner/scripts/sql/saas/checkout-delivery-days-migration.test.ts
```

**54 tests passed, 0 failed**. This includes the existing BasitKargo console/shipment behavior tests and the HTTP shipping fee typed-validation/version-conflict regression. HTTP requests use the server TenantContext; invalid string fee fails 400 before SQL and a repository version conflict maps 409.

```sh
CELEBIX_DELIVERY_QA_DATABASE_URL=postgres://postgres@127.0.0.1:56417/onboarding_delivery_qa_20260927 \
  node --experimental-transform-types --test \
  packages/saas-data/src/merchant-admin/checkout-delivery.postgres.test.ts
```

**1 real PG16 test passed, 0 failed**. The gate refuses any host/port/database outside this exact disposable database and verifies PG major 16 plus the exact database comment `celebix-task-owned-disposable-onboarding-20260927` before writing. PG version was 16.14. Fixtures use random synthetic stores, verified principals, owner/analyst memberships and subscriptions referring to the existing migrated public pilot plan; that immutable plan is never changed. It verifies:

- Repository save/list retains fee 1489, days 1/365 and existing regions/threshold.
- Actual `saas.storefront_shipping_projection` returns exactly 1489/365, explicit 0/1, and null for draft.
- Identical operation replay does not increment version.
- Stale expected version is rejected; an analyst without `configuration.manage` cannot mutate.
- Another synthetic tenant cannot list/get the record.
- Down refuses a persisted 365-day record and leaves its checkout projection intact.

The immutable operation/audit evidence remains only in this task-owned disposable database. No real orders, payments, provider calls or live writes occurred. Up/assertions/down/up were executed through Node `pg` after the same database/version/comment guard; original OID/definition/owner/ACL were compared in memory and matched exactly after down. Final QA state has169 applied.

```sh
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/saas-data
npm run build --workspace @celebix/customer-panel
```

- Customer-panel typecheck passed before concurrent Task4 edits. Its initially missing declared `@zxing/library@0.21.3` dependency was installed in `/tmp/celebix-task5-zxing` and linked only into this worktree's dependency namespace; no manifest/lock changes were made for that repair.
- SaaS-data typecheck passed after the PG test was added.
- Production build compiled successfully in 77s, then failed on concurrent, unowned Task4 code: `lib/panel-session-completion/completion.ts:318`, where `panel_session_completion_unavailable` is not assignable to `PublicFailureCode`. This is a remaining combined build gate, not a Task5 compilation error. The build log is `/tmp/celebix-task5-panel-build.log`.
- Only the task-generated customer-panel `.next/cache` was cleaned after the build ended (949MiB). Source, build output and shared dependencies were preserved.
- Owned `git diff --check` passed.

## Rendered UI verification

Function inventory before implementation: existing BasitKargo connection/settings workflow unchanged; new workflow loads fee/day, edits exact fee/day, saves draft or activates, reads current state, rejects unavailable reads, respects read/manage permissions and preserves version/retry intent.

Used a synthetic local fixture at `http://127.0.0.1:56421/`, compiled from the actual component/CSS/model/client plus the actual merchant-admin transport. Only transport responses and outer frame were synthetic; no auth or provider/runtime environment was contacted. The in-app browser was unavailable; the installed unified Chrome browser API was used. Viewport overrides were reset afterward.

| Check | Result |
| --- | --- |
| Page identity / meaningful content / no framework overlay | Passed |
| 1440px / 1024px | Two-column form; zero document horizontal overflow |
| 390px | One-column form, full-width actions; zero document horizontal overflow |
| Input and button targets | 44px high |
| Keyboard focus | Tab reaches draft action; visible 2px solid outline |
| Save interaction | 14,89 + 365 → 14,89 TL, 365 and confirmed saved status |
| Browser console warnings/errors | None |
| Screenshot visual review | Desktop, intermediate, mobile and saved mobile screenshots emitted through the browser tool; no clipping/overlap found |

The first synthetic GET fixture accidentally retained request-only `recordId` / `expectedVersion` after a save. The production parser correctly rejected that response and the component displayed saved/read-unavailable feedback. Correcting only the temporary fixture made the normal save/refresh flow pass. This was not a product-code fix.

## Limits / handoff

- Full authenticated shipping-page visual verification with real tenant runtime remains a parent integration check; the local rendered fixture validates this editor, not the surrounding panel shell or a live customer account.
- Combined panel production build must be rerun after the concurrent Task4 type error is corrected.
- Migration169 was applied only to the isolated QA database. Parent owns independent review and any live migration/deployment.
- No subagents were used for Task5. Only Task5 paths are included in the commit; concurrent task source/index entries are excluded via `git commit --only --`.

Commit subject: `feat: configure checkout delivery fees in shipping settings`.

## Independent review follow-up — 2026-09-28

The original report above describes commit `f51c951c`. Root authorized these bounded corrections after the independent Task5 review:

- **Rollback concurrency:**169's validator now uses a shared transaction advisory fence before validation; down takes the matching exclusive fence before its table lock. The wrapper is deliberately `VOLATILE STRICT` to prevent constant folding around the lock. A fresh `pg_proc` query after the fence rejects a call whose private delegate was retired while waiting. A simple `to_regprocedure` cache lookup was insufficient in the actual nested save path; the real two-connection gate caught that intermediate implementation. Other configs still delegate to the preserved installed validator. Down still restores the exact original OID, definition (including original volatility), owner and ACL.
- **Existing optional days:** a fee-absent legacy record's valid day value now loads independently of fee readiness. Entering only a fee retains day2; explicitly clearing the day removes it.
- **Multiple active records:** the draft action promises only to save this record as draft. Current reads separately select the latest active record using the checkout ordering and show its actual remaining fee after the newer record becomes draft. No silent bulk record changes were added.
- **Lost new-create response:** root explicitly extended ownership to `packages/saas-data/src/merchant-admin/repository.ts`. Only new `shipping_setting` creates derive a UUIDv8 from SHA256 of the fixed JSON tuple `[purpose namespace, validated storeId, principalId, membershipId, operationId]`. Time, plan and mutable data are excluded. Existing updates and all other kinds keep their existing IDs/protocol. API payloads, operation key, canonical fingerprint and SQL actor/tenant/version authority are unchanged.

### Red → green evidence

- Actual component regressions initially failed on blank legacy day and inaccurate global-close text. After correction, the component/model/client/presentation command passed **15/15**.
- The new repository scope test initially failed on the old generated UUIDv4. The corrected repository plus migration tests pass **21/21**; tenant, principal, membership and operation key alter the create ID, while generic creates retain the existing generator.
- Real PG16 lost-response test physically commits the new record, throws after the COMMIT response and rejects the recovery transport. Retrying the same create with a new repository call initially returned `operation_mismatch`; after correction it returns `replayed:true`, with exactly one record/version1. Changed payload remains `operation_mismatch`.
- Two connections test both UPDATE and INSERT in both orderings: an already validated save forces down to wait and reject the incompatible committed setting; a writer arriving behind down cannot commit365 after old-rule restoration. The actual installed save implementation is used; the writer-first seam uses a private QA-only copy with a one-second pause immediately after validation and before record access. The down-first case uses the real public save function and pauses down before its compatibility snapshot. The private instrumented function is removed afterward. Synthetic fixture cleanup is limited to this run's store IDs.
- The initial fence test failed because the old validator held no shared transaction fence. The down-first gate then caught a cached retired validator body still accepting365; the fresh-catalog generation check made all gates pass.
- QA up/assertions/down/up passed with exact original OID/definition/owner/ACL equality. No global roles, live database, customer records, provider calls or checkout orders were changed.

Commands:

```sh
node --experimental-transform-types --test apps/customer-panel/lib/checkout-delivery-ui/*.test.ts apps/customer-panel/components/shipping/CheckoutDeliverySettings.behavior.test.ts
node --experimental-transform-types --test packages/saas-data/src/merchant-admin/repository.test.ts apps/owner/scripts/sql/saas/checkout-delivery-days-migration.test.ts
CELEBIX_DELIVERY_QA_DATABASE_URL=postgres://postgres@127.0.0.1:56417/onboarding_delivery_qa_20260927 node --experimental-transform-types --test packages/saas-data/src/merchant-admin/checkout-delivery.postgres.test.ts
npm run typecheck --workspace=@celebix/saas-data
npm run typecheck --workspace=@celebix/customer-panel
```

The bounded local migration runner (outside the repository) checks the exact disposable database/comment, runs up/assertions/down/up, and compares original function metadata in memory. Focused PG command: **3/3 passed**. Both package typechecks passed. Parent's Task4 final Panel/Owner production builds passed after the earlier concurrent type error was fixed; these follow-up edits still require the parent's final combined production build. No concurrent production build was started here. Existing rendered screenshots remain valid for the layout; new copy/day/fallback behavior is covered by actual-component regressions.

Follow-up commit uses exact owned paths with `git commit --only --`; Task6 and other agents' files remain excluded.
