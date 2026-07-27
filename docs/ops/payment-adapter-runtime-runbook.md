# PayTR iFrame TEST runtime runbook

This runbook covers only the dormant PayTR iFrame TEST runtime. It does not
approve sandbox readiness, create a durable execution authority, enable a
merchant connection surface, or authorize real-money traffic. PayTR iFrame
remains `verification` for TEST and LIVE; all 58 catalog entries remain
truthful and non-connectable.

## Immutable boundaries

- Staging storefront origin:
  `https://pilot.saas-staging.celebix.site`
- Approved legacy evidence callback:
  `/api/payments/paytr/callback`
- Generic runtime callback:
  `/api/payments/paytr_iframe/callback/<opaque-binding>`
- Browser success/failure returns have no settlement authority.
- The evidence CLI accepts only five UUID operation selectors. It cannot accept
  an origin, callback, artifact path, provider response, token, or final
  artifact.
- The CLI derives `testedGitSha` only from the exact lowercase 40-hex
  `SOURCE_COMMIT` injected into the runtime image and derives `packetDigest`
  from the canonical JSON bytes of the imported
  `PAYTR_IFRAME_PACKET`.
- The CLI emits either one canonical secret-free JSON artifact or the fixed
  `paytr_iframe_sandbox_evidence_incomplete` error. It never emits request or
  response bodies, provider tokens, raw references, or credentials.

## Feature flags

All flags are disabled when missing or misspelled. Keep them unset during a
dormant deploy:

| Component | Exact activation value |
| --- | --- |
| Evidence CLI | `CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE=operator_test_once` |
| Storefront runtime | `CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE=approved_test_sandbox` |
| Owner validation worker | `CELEBIX_MERCHANT_PROVIDER_WORKER_MODE=approved_test_validation` |
| Customer panel | `CELEBIX_PAYTR_IFRAME_PANEL_MODE=approved_test_sandbox` |

The last three flags are still insufficient by design: compiled authority,
packet readiness, and the exact durable database authority must also agree.
Production compiled authority is currently `null`, so those paths remain inert.

## Dormant deployment preflight

A read-only staging audit on 2026-07-27 found both
`saas.payment_attempts` (migration 052) and
`saas.merchant_provider_execution_authorities` (migration 053) absent.
Before any dormant generic-runtime deployment, apply and assert in this order:

1. `202607270052_payment_adapter_runtime.up.sql`
2. `202607270052_payment_adapter_runtime_assertions.sql`
3. `202607270053_paytr_iframe_activation_authority.up.sql`
4. `202607270053_paytr_iframe_activation_authority_assertions.sql`
5. `202607270054_paytr_iframe_sandbox_evidence_history.up.sql`
6. `202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql`

Migration 053 must finish with no PayTR authority row. Do not create migration
055 or promote packet/catalog readiness during this phase. Migration 054 adds
only the bounded, read-only evidence-history function; it creates no authority,
readiness, profile, method, credential, attempt, or table privilege.

Evidence collection does not use or bypass the dormant migration-052 aggregate.
It reads the already approved legacy quick-order checkout aggregate created by
migrations 024, 026, and 027. The generic runtime cross-layer test is the
conformance bridge between that legacy PayTR behavior and the dormant adapter.

The owner egress IPv4 was externally verified as `46.225.183.57`. Re-verify it
from the deployed owner container immediately before any later provider-console
configuration; do not infer it from DNS or a local workstation.

Run the local fail-closed gate before pinning a deployment:

```bash
git diff --check
npm test --workspace @celebix/payment-adapters
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/owner
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/owner
npm run typecheck --workspace @celebix/storefront-shared
npm run test:saas-phase3:current
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/owner
npm run build --workspace @celebix/storefront-shared
```

Pin the same reviewed SHA to customer-panel
`yk1h6d97z7ex0h74ok3zrj5c`, owner `bpsgdwfiswna06mooguu2mr3`, and storefront
`vtc2aah63jbqnmtxmvykn6jl`. With activation flags unset, verify:

Before running evidence, independently verify that the customer-panel Docker
image tag is byte-for-byte equal to the `SOURCE_COMMIT` injected into that same
panel container. A missing, uppercase, short, or mismatched value makes the CLI
fail before database or credential access.

```bash
curl --fail --silent --show-error \
  https://panel.saas-staging.celebix.site/api/health
curl --fail --silent --show-error \
  https://pilot.saas-staging.celebix.site/health
```

The owner app has no dedicated health route; do not invent one or require an
HTTP 200 from `/`. The staging root currently returns HTTP 307 to
`/login?error=owner_auth_env_missing&next=%2F`. Record that missing auth
environment as a separate staging blocker. For the payment preflight, verify in
the deployment platform that the owner container is `Running`, its image is the
reviewed SHA, and its logs since that deployment contain zero payment-scope
errors.

The database preflight must report all three runtime migrations present, the
bounded function executable through the application role, no direct
legacy-table access, and zero authority rows:

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SELECT
  to_regclass('saas.payment_attempts') IS NOT NULL AS migration_052,
  to_regclass('saas.merchant_provider_execution_authorities') IS NOT NULL
    AS migration_053,
  to_regprocedure(
    'saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)'
  ) IS NOT NULL AS migration_054,
  has_function_privilege(
    'celebix_saas_app',
    'saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) AS evidence_execute,
  has_table_privilege(
    'celebix_saas_app','saas.checkout_operations','SELECT'
  ) AS direct_history_select,
  (
    SELECT count(*)
    FROM saas.merchant_provider_execution_authorities
    WHERE provider_code = 'paytr_iframe'
  ) AS paytr_authorities;
ROLLBACK;
```

Expected result: `migration_052=true`, `migration_053=true`,
`migration_054=true`, `evidence_execute=true`, `direct_history_select=false`,
and `paytr_authorities=0`.

## One-use evidence and reconciliation command

Run the owner-workspace CLI only inside the isolated customer-panel container,
after independently proving its exact image tag equals its injected
`SOURCE_COMMIT` and after the five operator actions exist in the legacy
`checkout_payment_attempts`,
`checkout_callback_receipts`, `checkout_reconciliation_receipts`, and
`checkout_operations` history. The database session must be able to
`SET LOCAL ROLE celebix_saas_app` and execute only the bounded migration-054
history function; it receives no direct table access. Otherwise the CLI fails
closed.
The panel container already holds the database variables and operator-managed
PayTR TEST credentials needed by the legacy callback route. Supply only the
one-use mode and selectors without printing any environment value:

```bash
CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE=operator_test_once \
CELEBIX_PAYTR_STAGING_TEST_MODE=1 \
npm run evidence:paytr-sandbox --workspace @celebix/owner -- \
  --success-operation-id="$SUCCESS_OPERATION_ID" \
  --decline-operation-id="$DECLINE_OPERATION_ID" \
  --replay-operation-id="$SUCCESS_OPERATION_ID" \
  --timeout-operation-id="$TIMEOUT_OPERATION_ID" \
  --status-operation-id="$STATUS_OPERATION_ID"
```

The panel container must already contain `SOURCE_COMMIT`,
`CELEBIX_SAAS_DATABASE_URL`,
`CELEBIX_SAAS_DATABASE_NAME`,
`CELEBIX_PAYTR_STAGING_MERCHANT_ID`,
`CELEBIX_PAYTR_STAGING_MERCHANT_KEY`, and
`CELEBIX_PAYTR_STAGING_MERCHANT_SALT`. Do not copy these credentials into the
owner environment. Do not set
`CELEBIX_PAYTR_STAGING_CALLBACK_URL`,
`CELEBIX_PAYTR_STAGING_ORIGIN`, or
`CELEBIX_PAYTR_IFRAME_EVIDENCE_ORIGIN`; the fixed callback authority cannot be
overridden.

The command first verifies from durable history:

- one non-replayed captured callback settlement;
- a distinct declined callback;
- an unknown write followed by captured reconciliation;
- an official status operation tied to that reconciled attempt.

It then performs one **operator-simulated signed duplicate callback**. This is
not evidence that PayTR sent a second callback. The command signs the persisted
TEST success facts with the canonical adapter helper and tries at most the 720
possible orders of the six exact PayTR callback fields in memory. Exactly one
candidate must match the original durable callback receipt digest; zero or
multiple matches fail before any network call. Only that byte-identical form is
POSTed to the fixed staging callback with redirects disabled and a five-second
timeout. The response must be exact HTTP 200, content type
`text/plain; charset=utf-8`, no redirect/location, and the two-byte body `OK`.
The command then reads the bounded history function again. The complete
canonical history must remain byte-for-byte equal, with exactly one settlement
operation and one callback receipt. Request/response temporary bytes are wiped,
and neither body nor digest is logged.

Finally, it calls the official PayTR status endpoint through the bounded low-level
transport for the success, decline, and reconciled status facts. This path
accepts the legacy 32-hex `merchant_oid` and wipes request/response bytes.
Missing history, contradictory history,
provider ambiguity, replay response mismatch, post-replay history drift, a
second settlement, inaccessible tables, credential/config failure, or metadata
drift yields only
`paytr_iframe_sandbox_evidence_incomplete`. In that case commit no artifact,
digest, authority, readiness, or catalog change.

Never capture browser HAR, trace, video, screenshot, console/network bodies,
PAN, expiry, or CVV. PayTR supplies its own TEST-card surface.

## Circuit breaker and rollback

At any payment-scope failure, revoke the exact durable authority first. This
disables bound methods and rotates active/pending profiles before application
flags are changed:

```sql
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_revoke(
  'paytr_iframe',
  'payment_processing',
  'test',
  1,
  :'evidence_digest',
  clock_timestamp()
);
COMMIT;
```

Then unset, in order:

1. `CELEBIX_PAYTR_IFRAME_PANEL_MODE`
2. `CELEBIX_MERCHANT_PROVIDER_WORKER_MODE`
3. `CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE`

Redeploy all three applications at the same SHA. Allow already authenticated
TEST callbacks/status reconciliation to drain; browser returns still cannot
settle. Do not run migration 053 down while profiles, methods, attempts, or an
authority row remain.

The last known-good pre-runtime rollback SHA is
`887bef8c93f230d829549363f285a9624292c43f`. Roll back application deployments
to that exact SHA only after authority revocation and flag removal. Database
migrations 052/053/054 are additive and must not be rolled back as an application
rollback shortcut.
