# Task 2 — Final native review and recovery followup

## Fixed findings

1. SQL211 previously exposed retry for any pending/attention job. Its read now mirrors the existing native retry authority: a verified identity, an eligible immutable workflow status, and no active lease. An expired lease can be retried; ready jobs and awaiting-identity jobs cannot. Native retry still owns the transaction lock/version check. The assertion fixture selects an eligible workflow and creates a separate awaiting-identity fixture; completed-tenant authority is never bypassed or modified.
2. A lost redemption commit response formerly consumed the handoff and lost the random cookie credential. Customer-panel now derives a purpose-separated SHA256 HMAC credential from the same 32-byte server key, handoff and normalized public host. SQL210 requires the third credential argument, stores only hashes, and recovers only an exact matching redemption. Recovery keeps the original session, membership, expiry and audit event. Different credentials, another host, revocation, expired sessions and inactive operators cannot recover access. The former two-argument native signature is absent. The browser retains the handoff only in memory after clearing the fragment and provides a retry control; no browser storage or URL persists the secret.
3. The local release helper had old 2/2 cohort counters and an incident-specific snapshot prefix. It now derives 6 targets / 0 witnesses from its closed cohort and requires `/tmp/celebix-platform-release-`. Root's environment/proof/Owner support-enable changes were preserved. This ignored local helper remains root-owned; it was syntax checked without execution.

## Origin review

Customer-panel already compared Origin with HTTPS plus normalized public Host, independent of the internal HTTP Request URL. Focused tests prove an HTTP loopback proxy request with the correct HTTPS public Origin redeems/ends support, while foreign, missing, HTTP and loopback origins fail before any database call. Forwarded-host headers do not redefine authority. Owner separately uses its trusted CELEBIX_OWNER_ORIGIN configuration. No origin weakening was introduced.

## Native evidence

- Production was queried only with BEGIN READ ONLY / SELECT / ROLLBACK. Of 1,599 live native functions, all 238 SQL210 predecessor definitions match production SHA256 exactly; all 238 current patched function owners/ACLs match those production predecessors.
- No old native function is missing from the isolated clone. Changes outside the support manifest consist of SQL209's intended reject_plan_version_mutation body. The clone has pre-existing ownership/ACL differences for 31 pg_trgm extension functions, outside the application patch; no application-function authority drift was found.
- The 53 callback/reconciliation/payment completion/collection/refund/return boundary functions contain zero new-sales pause guards. The 10 pause guards are at WEB/POS new-admission boundaries. Existing payment handling stays on its existing native path. This is source/native-fixture evidence; no real provider transaction was initiated by this followup.
- Disposable PostgreSQL16 created a fresh 0001–208 baseline, applied current 209/210/211/212, ran their native assertions, support lifecycle and SQL208 POS regression, then rolled back 212/211/210/209. All 1,573 baseline native function definitions, owners and ACLs were restored exactly. Each fixture's business/financial rows rolled back. This checkpoint predates the data agent's subsequent SQL212 trusted-issuer signature hardening; root/data agent must verify that final 212 source before release.
- Existing SQL208 POS coverage still validates full/partial/zero receipt handling, paused new admission, same-key old replay, original actor provenance after support revocation, exactly one stock decrement, later collection, partial/full product return and cash refund. Durable worker updates retain their initiating journal/operator after interactive revocation without receiving interactive support privileges.
- The isolated acceptance clone was refreshed only with changed 211/redeem helpers. Latest support lifecycle, SQL208 sales-pause fixtures and SQL211 assertions passed there; all fixture mutations rolled back. No production schema, data, environment or deployment mutation was performed.

## Commands and results

- `node --experimental-strip-types --test tests/saas-phase3/platform-support/native.test.mjs`: 1 passed / 0 failed, 9.76 seconds.
- `node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/platform-support/http.test.ts`: 4 passed / 0 failed, including lost-response cookie recovery.
- `npm run typecheck --workspace @celebix/customer-panel`: exit 0.
- Disposable integrated rollback script `.codex-artifacts/platform-support/final-native-rollback.mjs`: PASS, 209–212 up/assert/down, 1,573 native functions restored. Final assertion gate ran with updated three-argument redemption checks.
- Remote Coolify PHP `-l` on local helper stdin: no syntax errors; helper actions were not executed.
- Owned source `git diff --check`: exit 0.

## Runtime / release dependencies

Both customer-panel runtimes now require the same canonical 32-byte base64url `CELEBIX_PLATFORM_HANDOFF_KEY_B64URL` used by the Owner runtimes. Keep the existing separate restricted support database URL and exact shared database name. Root is preparing that private environment change and keeps Owner support disabled until the four compatible storefront/panel distributions are verified. Fresh SQL210 installs only `platform_support_redeem(text,text,text)` and grants it only to the restricted support runtime. General business runtime credentials remain unchanged.

Root retains final integrated builds, newest SQL212 verification, payment-proof generation, private environment and baseline snapshot rehearsal, ordered rollout and real Owner/MFA/live acceptance. No pending correction remains in the owned support/sales admission/SQL211 code at this checkpoint.
