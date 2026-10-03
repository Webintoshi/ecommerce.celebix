# Task 1 — platform data foundation

Status: implementation and isolated native acceptance complete. Production migration/deployment and invitation transport remain root integration work. No production platform records, charges or receipts were created.

## Owned files

- `apps/owner/scripts/sql/saas/202610040209_platform_control_plane.{up,down,assertions}.sql`
- `packages/saas-data/src/platform/{index.ts,repository.ts,repository.test.ts,native-acceptance.mjs}`

## Contracts

Restricted `celebix_saas_platform_operator` is NOLOGIN/NOINHERIT/non-superuser/non-bypass. It has only bounded execute grants; no raw registry, billing, audit, plans or tenant table authority. Every entry rechecks active immutable operator issuer/subject plus verified matching principal. Registry permits one active operator and only `sdkahmetcelebi@icloud.com`; immutable registry identity fields have a database trigger. Migration seeds neither operator nor money.

- `platform_operator_resolve(issuer, subject)` -> operator id/issuer/subject/principalId/email/active/version.
- `platform_read(operator, resource, query)` -> `{available:true, observedAt, items}`. Store detail is `{...,store}`. Overview has real store counts, setup/issues/upcoming-due counts, platform collected/receivable/overdue cents, and separate merchantSales. No read creates or syncs records. Search/filter support is present for stores, billing and audit.
- `platform_command(operator, action, payload, expectedVersion, key)` -> `{outcome:committed|replayed, version, result}`. One global operator/key ledger covers all actions, including support issue/revoke and sales pause/resume delegates to210. Different action/payload/version with reused key is rejected.

Canonical actions: `plan.publish`, `subscription.assign`, `billing.period.create`, `billing.period.adjust`, `billing.receipt.record`, `billing.receipt.reverse`, `ownership.invite`, `membership.update`, `support.issue`, `support.revoke`, `sales.pause`, `sales.resume`. Ordinary store commands use store control version (initial0); publication uses latest plan-code version (initial0);210 policy/session commands retain their own version (initial1).

Plan publication supplies all13 features and5 limits, makes a complete new frozen version, preserves every prior plan, and records optional monthly/yearly integer-cent tariffs. Legacy absent tariffs stay null. Assignment checks actual usage, pending POS required functionality, and accounting requirements for open/prepared debts. Commercial fee/due records never become technical subscription expiry.

Billing periods preserve originalAmountCents; signed append-only adjustments expose adjustmentCents and corrected amountCents. Adjustment payload is `{storeId,periodId,deltaCents,reason}` with nonzero safe integer delta. Corrected charge cannot be negative or below collected. Receipts and reversals remain append-only, store-scoped and guarded against overpayment. Store detail provides periods, receipts and adjustments.

Current `store_domains` are storefront authority; legacy `domains` are fallback by hostname. AdminDomains and verified adminHost/AdminOrigin are separate. Custom quota deduplicates shared hostname representations. `merchantSales` contains completed TRY WEB/POS gross order totals with separate webCents/posCents/orderCount; excludes cancelled/refunded orders and uncompleted POS, does not include platform money, and counts excluded currency records. It is not net profit. Unsupported per-store currency is explicit unavailable rather than invented0.

Invitation creation freezes an existing verified target issuer/subject, hashes a7day token and returns its acceptanceToken only to the authenticated operator. Acceptance is idempotent, changes memberships atomically, preserves last owner, checks staff quota, requires explicit old-owner admin/revoked choice for transfer, and never creates a store. SQL entry for trusted identity runtime: `platform_ownership_accept(token,issuer,subject)` (identity role); existing normal tenant context entry `platform_ownership_accept_context(store,principal,membership,plan,code,version,now,token)` (app role). Direct member editing cannot promote to owner or activate an invited membership; accepted invitation is required.

Support issue expects root-supplied deterministic64hex HMAC `handoff` in server payload. Global command ledger stores only its SHA256 hash and removes handoff from stored result. Same-key replay reconstructs response from supplied identical token.210 also stores only hashes.

## Verification evidence — 2026-10-04

1. RED: extended native assertions against the prior clone failed `OWNERSHIP_ACCEPTANCE_BYPASSED`; fixed by transition guards. Another native assertion caught an older clone missing the registry immutability trigger; full final migration includes it. Every assertion transaction rolled back on failure.
2. Native PostgreSQL16 on isolated `celebix_owner_acceptance_20261004` with210 installed: final209 helpers + extended assertions exit0. Verifies restricted roles/raw-table denial, inactive identity, immutable operator, replay/mismatch/stale versions, **1100000/500000/600000 cents =11000/5000/6000 TL**, reversal, overpayment, append-only audit/adjustments, complete frozen publication, usage/pending POS/open-debt downgrade, last-owner, verified transfer/no new store, per-store isolation, current domain projection, merchant-vs-platform separation, store/audit search, support/sales global replay, and no plaintext handoff persistence.
3. Fresh private208 dump restored to isolated `celebix_owner_209_clean_20261004`; final209 up -> native assertions -> down all exit0. `cmp` verified predecessor plan-freeze function hash, plan count and store count identical before/after. Roles already existed cluster-wide from prior isolated tests; guarded role reuse works.
4. Native true two-session concurrency runner on fresh `celebix_owner_209_native_20261004`: identical receipt key commits once/replays once; competing6000TL receipts yield one commit/one version conflict and zero outstanding; concurrent last-owner demotion retains exactly one owner; history-bearing down is refused. Exit0. Both clean/native disposable databases dropped after proof. Root shared acceptance clone remains available.
5. `npm run typecheck --workspace @celebix/saas-data` exit0; focused repository tests3/3 pass, including read-only parameterized restricted transaction, invalid identity before checkout, and uncertain commit destroying connection without auto rerun.

## Remaining integration boundaries

- Root provisions real verified OwnerAuth identity/AAL2 and registry, restricted login connection, and applies/deploys final sources.
- New invitees lacking an existing verified SaaS principal still need identity-only invitation onboarding transport. Existing verified principal acceptance SQL is complete; this report does not claim the missing transport complete.
- Owner HTTP must map new errors `charge_below_collected`, `ownership_acceptance_required`, `invitation_acceptance_required` and210 domain/support denial errors. UI/root shared action lists must include period.adjust.
- Operations retry is root-owned211; this209 compatibility read is only passive tenant-operation history.
