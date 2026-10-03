# Task 2 — Support and sales policy integration

## Implemented

- SQL210 creates restricted NOLOGIN runtime role, hashed 30-minute host-bound support sessions, support membership provenance, independent sales policy, immutable write journal, and reversible native function patches.
- Issue takes seven arguments, including controller-derived HMAC64 handoff. Matching retry returns the identical token; only its hash is stored. Redemption consumes one support session, using a deterministic server HMAC credential so matching retries recover a lost commit response without a second session or expiry extension.
- App uses a separate Secure/HttpOnly/Strict __Host cookie. Every request resolves the actual operator principal and real current store plan; no feature bypass or TenantContext extension. Banner, countdown and end control appear in all panel layouts. Revoked/expired sessions clean the overriding cookie through /support/ended.
- Native membership authority uses real clock expiry, revocation, active immutable operator identity and verified admin domain. Normal session creation, cross-host handoffs, staff lists and usage ignore support memberships.
- Writes initiate an atomic operator/session journal in native mutation functions and on business tables. Worker job updates retain durable initiating operator/journal identity while executing as workflow, including after support revocation; they acquire no interactive support rights.
- Historic sale actor labels use a provenance-only view, separate from authorization. A normal manager can finish an already received support-created sale after support revocation.
- Pause guards exist only at NEW WEB/POS admission boundaries. Existing POS preparation/payment/completion/replay, later collection, return/refund and provider processing keep their existing native paths. Error code sales_paused reaches both UI families.
- Sales policy emits newSalesEnabled/changedAt/changedBy plus backward compatible paused/updatedAt aliases. Setter records operator and optimistic version.

## Exact native helpers

- platform_support_issue(operator UUID, store UUID, host TEXT, reason TEXT, expected_version BIGINT, idempotency_key TEXT, deterministic_handoff TEXT) -> projection + handoff/replayed. Initial expected version is 1.
- platform_support_redeem(handoff, host, deterministic_server_credential) -> projection + credential/replayed. The former two-argument signature is absent.
- platform_support_resolve(credential, host, request_id) -> support sidecar + unchanged TenantContext, or null.
- platform_support_end(credential, host); platform_support_revoke(operator, session, version, key); platform_support_list(operator, query).
- platform_sales_policy_get(operator, store); platform_sales_policy_set(operator, store, paused, reason, expected_policy_version, key). Absent policy version is 1.
- SQL209 wraps issue/revoke/policy commands with global idempotency and stable outcome/version/result envelope; controller handles HMAC reconstruction, never database plaintext storage.

## Runtime configuration

Customer-panel only: CELEBIX_PLATFORM_SUPPORT_ENABLED=true (enable only after rollout reader checks), CELEBIX_SUPPORT_DATABASE_URL, CELEBIX_SAAS_DATABASE_NAME, the shared 32-byte base64url CELEBIX_PLATFORM_HANDOFF_KEY_B64URL, and existing optional CELEBIX_STAGING_DB_CA_B64. URL must target that exact shared database with a dedicated non-superuser, non-bypass-RLS login having only membership in celebix_saas_support_runtime. The pool refuses owner/bootstrap/operator/app/identity/workflow/migrator memberships and privileged role attributes. It SET LOCAL ROLEs runtime per request, bounds checkout/statement/lock/transaction time and destroys uncertain-commit connections. General business APIs retain their existing independently scoped database pool.

Owner and customer-panel require CELEBIX_PLATFORM_HANDOFF_KEY_B64URL to be identical on both corresponding distributions. Purpose-separated fixed HMAC derivations stay server-only. Shared admin and storefront retain their existing environment contract for pause readers. Final recovery, native predecessor and rollback evidence is recorded in task-2-final-review.md.

## Verification

- Meaningful RED regression: received support-created POS sale disappeared after revocation (EXPIRED_SUPPORT_SALE_DISAPPEARED). Fix passed GREEN with normal-manager completion, unchanged receipt evidence, exactly one stock decrement and original actor retained.
- Disposable PostgreSQL16 full 0001–209 + SQL210 native test covers grants, direct runtime resolve, one-use/foreign-host/retry, 30-minute duration, real identity/plan, staff/quota exclusion, atomic customer write, rollback, revoke, stale-clock expiry without cleanup, expired native write denial, durable workflow provenance, typed/versioned pause/resume, 208 V3 full/partial/zero payments, paused-new admission, old replay, completion, returns/refund and subsequent debt collection. Fixture always rolls back; SQL210 down succeeds on clean state.
- Command: node --experimental-strip-types --test tests/saas-phase3/platform-support/native.test.mjs. Final run: 1 suite / 1 passed, 0 failed, 13.02 seconds, exit 0.
- 13 focused support/cookie/access/runtime tests passed. Customer-panel, storefront-shared and saas-data typechecks passed.
- Production builds for customer-panel and storefront-shared passed exit 0. A final controller build should consume the integrated commit and Owner auth/invitation additions.
- Only isolated acceptance clone celebix_owner_acceptance_20261004 was refreshed with compatible support/provenance/policy helper/view/index changes. No production schema, data, environment, deployment or billing mutation performed.

## Release and review

Native patches preserve predecessor definitions in platform_support_function_backup. Down refuses when any support session or sales policy exists, preserving audit/provenance instead of discarding history. Controller still owns integrated independent review, fresh full builds, production deployment gates, actual Owner setup, and live four-store/browser acceptance. Provider callbacks were not exercised against a real provider by this task; controlled integrated checkout acceptance remains a controller gate.
