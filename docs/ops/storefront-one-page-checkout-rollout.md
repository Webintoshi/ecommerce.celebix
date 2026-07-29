# Storefront one-page checkout staging rollout

This runbook is for the isolated Celebix staging environment only. It does not
authorize a production database migration, production traffic, live payment,
or a real paid order. The operator must stop if any target, source commit,
backup, transport, provider authority, or rollout control cannot be proven.

The fixed application target is the existing shared storefront service:

| Boundary | Exact value |
| --- | --- |
| Git branch | `codex/celebix-managed-umami-analytics` |
| Remote ref | `refs/remotes/origin/codex/celebix-managed-umami-analytics` |
| Coolify project | `fy34knkv8p3d73ksirgcsgg6` |
| Coolify environment | `yv44k7b9mhn6edakw9nw6b32` |
| Coolify storefront service | `vtc2aah63jbqnmtxmvykn6jl` |
| PostgreSQL service | `ta8qw4jkvedkap7qqdakrb7y` |
| PostgreSQL database | `celebix_saas_staging_auth01` |
| Database migration | `202607290065_storefront_default_shipping.up.sql` |
| Database rollback | `202607290065_storefront_default_shipping.down.sql` |

## Non-negotiable stop conditions

- Auto-deploy is still enabled when the candidate is pushed.
- Local `HEAD`, the exact remote branch, the candidate image, and the
  container's `SOURCE_COMMIT` are not the same lowercase 40-hex commit.
- The target is not PostgreSQL 16, the exact isolated-staging database, or the
  database reports recovery mode.
- TLS does not use full certificate verification, SCRAM channel binding is not
  required, or the trusted root certificate cannot be read.
- The encrypted backup, its archive inventory, or the separately approved
  isolated restore target is not proven before migration.
- The backup directory resolves to `/`, the repository root, a home directory,
  or any other broad/shared target.
- Migration 064 assertions fail, migration 065 is already partially present,
  migration 065 assertions fail, `saas.storefront_checkout_preflight()` is not
  exact `true`, or the migration-065 default-shipping preflight is not exact
  `true` after apply.
- The application checkout rollout gate is absent, malformed, not disabled by
  default, or cannot deny every host outside the exact allowlist while keeping
  verified callbacks and already-created-attempt result/status paths available.
- Iyzico or PayTR is represented as ready without genuine evidence for the
  exact candidate source digest and the authorized tenant sandbox account.
- Any command would expose a database URL, password, encryption material,
  provider value, session value, or Coolify access material.

The application owns a checkout-only exact-host gate. It is disabled unless all
three facts are exact: `CELEBIX_DEPLOYMENT_TIER=staging`,
`CELEBIX_CHECKOUT_ROLLOUT_MODE=approved_staging`, and a valid
`CELEBIX_CHECKOUT_ROLLOUT_HOSTS` comma-separated allowlist. The allowlist accepts
only canonical lowercase DNS hostnames. Empty entries, duplicates, wildcards,
ports, paths, whitespace, uppercase, malformed hostnames, missing variables,
or any other mode fail closed for the entire new-checkout initiation surface.
The gate consumes only the hostname selected by the authenticated storefront
proxy authority; raw `Host`, `Forwarded`, or caller-selected forwarding headers
cannot choose the tenant.

The gate denies exact `/odeme`, `/api/checkout/quote`,
`/api/checkout/delivery`, and `/api/checkout/submit`. It intentionally does not
deny provider callbacks, `/odeme/sonuc`, `/api/checkout/status`, reconciliation,
or legacy quick-order paths, so already-created attempts can drain truthfully.

The read-only staging discovery on 2026-07-29 found auto-deploy enabled, the
latest storefront deployment webhook-triggered, Coolify source-commit injection
disabled, and the running storefront image SHA different from its injected
`SOURCE_COMMIT`. Coolify application health checks were also disabled. These
are current blockers, not an accepted baseline. Re-check them immediately
before rollout; disable auto-deploy, enable an authoritative health check, and
rebuild with exact image/source equality before any migration or deployment.

## 1. Prepare and verify the candidate

Run all commands from a clean checkout of the fixed branch. Keep shell tracing
off; never run `env`, `printenv`, or a command that places a database URL in an
argument.

```bash
set +x
umask 077
git fetch --prune origin
CANDIDATE_SHA="$(git rev-parse HEAD)"
REMOTE_REF="refs/remotes/origin/codex/celebix-managed-umami-analytics"
case "$CANDIDATE_SHA" in *[!0-9a-f]*|"") exit 1 ;; esac
test "${#CANDIDATE_SHA}" -eq 40
test -z "$(git status --porcelain=v1 --untracked-files=all)"
git cat-file -e "${CANDIDATE_SHA}^{commit}"
```

Before calling this commit deployable, require the complete repository gate,
the checkout PostgreSQL harness, static security test, browser acceptance test,
and cumulative phase-3 suite to pass. The candidate must also pin the reviewed
published Next.js baseline, currently `16.2.12`, across every repository-owned
Next.js application and matching tooling. Record the dependency output and the
following execution-surface scan in the evidence record:

```bash
npm ls next eslint-config-next
rg -n "use server|next/image|rewrites[[:space:]]*\(|redirects[[:space:]]*\(" \
  apps/storefront-shared packages/platform-config
git diff --check
node --test tests/saas-phase3/storefront-one-page-checkout/isolated-staging-runner.test.mjs
node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs
node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs
node tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs
npm run test:saas-phase3:current
```

The reviewed source scan must continue to show that the shared storefront has
no Server Actions, dynamic rewrite/redirect configuration, or `next/image`
execution surface outside the reviewed baseline.

## 2. Freeze automatic delivery and record rollback state

In the authenticated Coolify control plane, resolve the service only by the
project, environment, service ID, domain, repository, and fixed branch above.

1. Disable automatic Git/webhook deployment for the storefront service.
2. Re-open the service configuration and verify that automatic deployment is
   disabled before pushing anything.
3. Record the current successful deployment ID, exact source commit, immutable
   image tag/digest, health state, and deployment time in the evidence record.
4. In the current container, independently read its `SOURCE_COMMIT`; require it
   to be a lowercase 40-hex value equal to the recorded image/source commit.
5. Save that value as `CURRENT_STOREFRONT_SHA`. Keep its image available for an
   application-first rollback.
6. Leave both `CELEBIX_CHECKOUT_ROLLOUT_MODE` and
   `CELEBIX_CHECKOUT_ROLLOUT_HOSTS` unset, verify `/odeme` is the bounded
   unavailable response for every host, and verify existing callbacks and
   result/status paths remain reachable.

Do not continue if the running commit cannot be identified exactly. A branch
name, `latest` tag, abbreviated SHA, deployment timestamp, or healthy status is
not an immutable rollback reference.

## 3. Push and prove exact source containment

Only after auto-deploy is visibly disabled, push without force and prove exact
local/remote equality:

```bash
git push origin HEAD:refs/heads/codex/celebix-managed-umami-analytics
git fetch origin codex/celebix-managed-umami-analytics
test "$CANDIDATE_SHA" = "$(git rev-parse HEAD)"
test "$CANDIDATE_SHA" = "$(git rev-parse "$REMOTE_REF")"
```

The migration runner compares local source with the local remote-tracking ref;
it does not independently contact the Git server. The immediate `git fetch` and
local/remote equality checks above are therefore mandatory preconditions. The
runner still rejects a dirty protected artifact or any byte/hash mismatch in
the phase3x manifest or its pinned phase3w predecessor.

## 4. Prove backup and apply migration 065

Run this only from a secured operator context where the variables below are
already injected. Do not type values into command history and do not print
them:

```text
CELEBIX_RUNTIME_MODE
CELEBIX_DEPLOYMENT_TIER
CELEBIX_SAAS_STAGING_DATABASE
CELEBIX_SAAS_DATABASE_URL
CELEBIX_SAAS_SSL_ROOT_CERT
CELEBIX_SAAS_BACKUP_DIRECTORY
CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY
```

Required non-secret settings are `CELEBIX_RUNTIME_MODE=approved_staging`,
`CELEBIX_DEPLOYMENT_TIER=staging`, and
`CELEBIX_SAAS_STAGING_DATABASE=celebix_saas_staging_auth01`. The database URL
must name that exact database and contain only `sslmode=verify-full` and
`channel_binding=require`. The runner passes connection facts through protected
process environment fields, never through command arguments.

First verify that a separately authorized, empty, isolated PostgreSQL 16
restore target is available and that the existing restore procedure is owned
and rehearsed. Record its opaque target record and the latest successful
restore rehearsal; do not put a connection string in the evidence. This runner
proves that the fresh custom-format archive has a readable `pg_restore -l`
inventory before encryption. A separately rehearsed restore target is still a
mandatory operational prerequisite.

Run the source-only dry run, then the single guarded apply command:

```bash
node tests/saas-phase3/storefront-one-page-checkout/isolated-staging-runner.mjs \
  --source-sha "$CANDIDATE_SHA" --dry-run
node tests/saas-phase3/storefront-one-page-checkout/isolated-staging-runner.mjs \
  --source-sha "$CANDIDATE_SHA" --apply
```

The apply command must, in this order:

1. re-prove local/remote source containment, exact phase3x hashes, and the
   phase3w-manifest-pinned migration-064 assertion bytes;
2. use a read-only session to prove PostgreSQL 16, the exact database,
   `celebix.deployment_tier=isolated_staging`, recovery off, the built-in,
   provider, and migration-064 checkout preflights true, and migration 065
   absent;
3. run the migration-064 assertions read-only;
4. create a `pg_dump -Fc` archive, require a non-empty `pg_restore -l`, encrypt
   it with AES-256-CBC/PBKDF2, and leave only the encrypted mode-0600 file;
5. apply the exact manifest-pinned migration 065 in one transaction with
   `ON_ERROR_STOP`;
6. run the exact migration-065 assertions read-only and require both
   `saas.storefront_checkout_preflight()` and
   `saas.storefront_checkout_default_shipping_preflight()` to return true; and
7. re-prove the database sentinel and source/hash containment after the write.

Any fixed runner error is a hard stop. Do not apply SQL manually as a shortcut.
Record the candidate SHA, runner success, encrypted backup filename, mode, size,
checksum, storage owner, retention, restore-target record, and time. Do not
record the URL or any protected value.

## 5. Pin and manually deploy the immutable application

Before deployment, keep both checkout rollout variables unset. In Coolify:

1. Confirm the service still resolves to the fixed project/environment/service
   and branch.
2. Pin the Git revision and image build to `CANDIDATE_SHA`; do not select the
   branch head implicitly.
3. Set the container's non-secret `SOURCE_COMMIT` to the exact same full SHA.
4. Do not copy the old `CELEBIX_IYZICO_APPROVAL_MODE` or
   `CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST` into this build. With no fresh
   exact-candidate evidence, both remain unset and Iyzico remains dormant.
5. Trigger one manual deployment. Do not re-enable webhook deployment.
6. Wait for terminal success. Confirm zero restart loops and zero checkout,
   database-preflight, provider-authority, callback, stock, or order errors.
7. Compare three independent facts: pushed remote SHA, immutable image
   tag/digest metadata, and the value of `SOURCE_COMMIT` read inside the running
   container. All must identify `CANDIDATE_SHA` exactly.

An image built from a different commit is a failed deployment even if `/health`
is green.

## 6. Verify health, security headers, and two synthetic hosts

The two reviewed synthetic hosts are exact and distinct. They must resolve only
to this isolated staging service and contain synthetic data only:

```text
SYNTHETIC_CHECKOUT_HOST_A=pilot.saas-staging.celebix.site
SYNTHETIC_CHECKOUT_HOST_B=hemenaku-ui-674cd2ca.saas-staging.celebix.site
```

With both rollout variables still unset, exact `/odeme` must return the reviewed
`503 Storefront unavailable` response on both hosts, while `/health`, provider
callbacks, `/odeme/sonuc`, and `/api/checkout/status` remain reachable. Record
the no-store/noindex/no-referrer headers without recording cookies or bodies
that contain identity data.

Then set exactly these two non-secret values in the staging service and perform
a controlled restart/manual deployment of the same immutable candidate image:

```text
CELEBIX_CHECKOUT_ROLLOUT_MODE=approved_staging
CELEBIX_CHECKOUT_ROLLOUT_HOSTS=pilot.saas-staging.celebix.site,hemenaku-ui-674cd2ca.saas-staging.celebix.site
```

Do not add spaces, a trailing comma, duplicate hosts, wildcard, parent-domain
suffix, port, path, uppercase character, or third host. Any malformed allowlist
disables initiation for every host. Re-prove image/source equality after the
configuration restart. Query-selected and caller-header-selected hosts are
forbidden.

Capture read-only HTTP evidence without cookies or redirects:

```bash
test "$SYNTHETIC_CHECKOUT_HOST_A" != "$SYNTHETIC_CHECKOUT_HOST_B"
evidence_dir="$(mktemp -d)"
for checkout_host in "$SYNTHETIC_CHECKOUT_HOST_A" "$SYNTHETIC_CHECKOUT_HOST_B"; do
  case "$checkout_host" in
    *[!a-z0-9.-]*|.*|*..*|*.) exit 1 ;;
  esac
  curl --fail --silent --show-error \
    "https://${checkout_host}/health" \
    --output "${evidence_dir}/${checkout_host}.health.json"
  curl --fail --silent --show-error --max-redirs 0 \
    --dump-header "${evidence_dir}/${checkout_host}.odeme.headers" \
    --output "${evidence_dir}/${checkout_host}.odeme.html" \
    "https://${checkout_host}/odeme"
  tr -d '\r' < "${evidence_dir}/${checkout_host}.odeme.headers" \
    | grep -Eiq '^cache-control:.*no-store'
  tr -d '\r' < "${evidence_dir}/${checkout_host}.odeme.headers" \
    | grep -Eiq '^x-robots-tag:.*noindex.*nofollow'
  tr -d '\r' < "${evidence_dir}/${checkout_host}.odeme.headers" \
    | grep -Eiq '^referrer-policy:[[:space:]]*no-referrer[[:space:]]*$'
done
```

Use an approved visible browser session to create one synthetic cart on each
exact host. The two hosts must use different certified themes. Verify both
desktop and mobile views render the same fixed platform checkout shell
(`data-checkout-root`), never a theme-owned checkout, and verify:

- delivery validation, shipping fee, free-shipping threshold, discount, and
  server-authoritative totals;
- one chosen method, required consent, duplicate-submit suppression, and
  commit-unknown recovery;
- no-store/noindex/no-referrer/nosniff/frame/CSP behavior;
- exact-host isolation, cart isolation, tenant isolation, and absence of
  customer/payment data in URLs, logs, analytics, and browser storage;
- stock reservation, exactly one order, callback replay safety, and truthful
  result/reconciliation state.

Do not capture provider request/response bodies, HAR files, card fields, session
cookies, raw customer details, or callback payloads.

## 7. Keep payment authority truthful

- The existing Iyzico approval was produced for an older source digest. It is
  stale for this candidate and must not authorize Iyzico execution. The staging
  discovery also found zero durable Iyzico authority, bound profile, evidence
  run, and attestation rows; do not synthesize any of them for rollout.
- Iyzico may leave `verification` only after fresh genuine sandbox evidence is
  produced with the authorized tenant sandbox account and exact candidate
  digest. If that cannot be completed, it remains fail-closed.
- PayTR likewise remains fail-closed until genuine sandbox evidence exists for
  this exact candidate. A fixture, copied digest, simulated callback, or operator
  assertion is not provider evidence.
- Bank transfer and cash on delivery may be exercised only through their real
  built-in configuration and checkout paths. A test stub is not activation.
- Browser success/return parameters never settle an order. Only the existing
  verified callback or official reconciliation authority may do so.
- Never use test provider access for a live charge and never submit a real paid
  order during this staging smoke test.

Where genuine tenant sandbox authority is available, verify the official
test-mode hosted redirect/iframe, signed callback, duplicate callback,
reconciliation, stock, and order outcome. Otherwise record the provider as
`verification` and verify that initiation fails closed without a network call.

## 8. Observe, then expand only to a bounded allowlist

Keep the rollout restricted to the two synthetic hosts for at least 30
continuous minutes and at least 50 complete synthetic checkout loops per host.
Deliberate negative cases are labelled and excluded from availability rate
calculation, but they must still return the expected bounded result.

Expansion requires every threshold below to hold for the entire window:

| Signal | Required threshold |
| --- | --- |
| `/health` availability | 100% |
| Unexpected checkout HTTP 5xx rate | at most 0.5% |
| Checkout page/API p95 server latency | at most 2 seconds |
| Cross-tenant result, oversell, duplicate order, or duplicate settlement | exactly 0 |
| Unknown/unreconciled commit after the bounded recovery window | exactly 0 |
| Callback signature/replay, provider-authority, DB-preflight, or secret-redaction error | exactly 0 |
| Browser console error and application restart | exactly 0 |

After the window, append only separately approved exact canonical lowercase
tenant hostnames to `CELEBIX_CHECKOUT_ROLLOUT_HOSTS`, with no whitespace, and
manually restart/deploy the same approved immutable image. Record the
before/after exact value and its owner. Do not use `*`, a parent-domain suffix,
a user-supplied header, or the whole-storefront proxy switch. Repeat source/image
equality and the same threshold window before any further expansion. General or
production enablement requires a separate decision and is outside this runbook.

## 9. Application-first rollback

At any threshold breach, identity mismatch, provider ambiguity, callback
failure, stock/order invariant failure, or suspicious log event:

1. Unset both `CELEBIX_CHECKOUT_ROLLOUT_MODE` and
   `CELEBIX_CHECKOUT_ROLLOUT_HOSTS`, then immediately restart/manual-deploy the
   selected immutable image. Do not use an empty allowlist as an enabled state.
   Keep verified callback, result/status, and reconciliation paths available
   for already-created hosted attempts.
2. Pin the storefront service back to `CURRENT_STOREFRONT_SHA`, set its
   `SOURCE_COMMIT` to that exact SHA, and manually deploy the retained immutable
   image.
3. Verify the running image, container `SOURCE_COMMIT`, `/health`, controlled
   `/odeme` response, callback drain, and logs.
4. Leave additive migration 065 in place by default. The previous application
   must ignore it; database down is not required for application rollback.
5. Preserve all orders, attempts, callbacks, reservations, and evidence. Never
   delete durable state to make rollback guards pass.

Re-enable auto-deploy only after the selected immutable application SHA has
passed verification and the incident/rollout record is closed.

## 10. Guarded migration down

Migration down is exceptional. It is allowed only after the application-first
rollback, checkout control disablement, callback-safe writer drain, and an
independent read-only review showing migration 065 has exactly zero durable
impact. Run it from the still-clean candidate checkout whose local and remote
SHA contain the exact manifest-pinned down file.

After the application writers are actually stopped and all in-flight writes
are drained, inject only this non-secret attestation:

```bash
CELEBIX_STOREFRONT_WRITERS_DRAINED=confirmed \
node tests/saas-phase3/storefront-one-page-checkout/isolated-staging-runner.mjs \
  --source-sha "$CANDIDATE_SHA" --down
```

The runner must first re-run the 065 assertions, prove zero qualifying writer
sessions/locks, and reproduce every durable zero-impact guard from the down
migration. It then creates and validates a second encrypted backup, runs the
exact 065 down transaction with `ON_ERROR_STOP`, runs the 064 assertions
read-only, proves 065 absent, and rechecks source containment. If any guard or
drain check fails, leave migration 065 in place and investigate; do not weaken
the SQL or manually drop objects.

Record the final application SHA, checkout-control state, migration state,
encrypted backup evidence, 064/065 preflight outcome, synthetic-host results,
provider/built-in truth state, threshold window, and rollback readiness. A red
or unavailable gate is reported as blocked, never as completed.
