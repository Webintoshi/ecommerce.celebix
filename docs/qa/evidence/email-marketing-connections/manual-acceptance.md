# Manual export correction — 2026-10-09

Historical local verification; no production/provider operation occurred during these checks. This supersedes automatic bootstrap/name scheduling described in the original acceptance record; original measurements remain historical. The subsequent [live release](live-release-20261009.md) applied native 224 and enabled Klaviyo. Brevo registration and real merchant-key acceptance remain outstanding.

## Verified behavior

- Apply saves the connection without creating a bootstrap. Source grants/name edits do not queue positive provider work.
- Explicit sync uses current native authority, expected version and retained-key HMAC operation fingerprints. The same operation returns the original result.
- One finite bulk statement captures historical/current proven audience and original names/evidence. Monotonic batch numbers allow the next explicit run without overwriting old provider effects.
- Purchase/customer existence and raw legacy customer checkbox without ledger proof are excluded. New grants/names after the request wait for the next click. Later denial still blocks dispatch.
- Queued and accepted/unknown effects prevent a competing batch at both claim/finalize. Credential/audience snapshots, counts, version and sequence stay unchanged.
- Provider denial polling, unknown readback, and draining/cleanup remain automatic; this is not a zero-query background system.

## Checks

- 46 data/provider/owner/native tests passed, zero skips/failures, explicit disposable PG16 config. Includes both original authority/cleanup tests and new manual snapshot/replay/uncertainty checks.
- 33 targeted panel UI/HTTP/runtime tests passed; panel/data/owner/shared storefront typechecks passed.
- General panel suite was run once: 2,325 total, 2,263 passed, 61 failed, one skipped. Observed failures are outside the edited email files; no baseline comparison was run and the full suite is **not green**. Local full log: /tmp/celebix-manual-email-ui-full-tests.log.
- Actual Next components via installed Playwright/Chrome at 1440/1024/390: zero automatic sync calls, three identical request bodies/keys through unknown → cleanup_pending → success, native dialog Tab/Escape/focus return, no horizontal overflow/framework overlay. Fake API only; no key/customer/provider call. Exact favicon warning, if present, is recorded separately in manual-rendered-ui.json. Temporary route/server removed.
- 10,000 historical contacts plus one existing proof passed two sequential native batches under a 10-second statement timeout. Final focused run observed 2.309 seconds; final complete target suite observed 3.014 seconds. These include fixture/assertion/rollback work, not provider export duration or production latency.
- Original per-row queue construction and first bulk CTE attempt both exceeded 10 seconds. EXPLAIN at 1,001 rows showed two nested CTE rescans removing 1,000,000 join rows each. Bulk snapshot plus materialized FULL JOIN removes the quadratic rescans without changing global planner options.

## Final local release checks

- Source commit: `13b92a27e468c4c771f16a86394e566c33b10b22`. All three source-bound production wrappers completed with exit 0: customer-panel, owner, and shared storefront. These are local builds, not deployments. Logs are retained in the ignored plan workspace as `manual-build-panel.log`, `manual-build-owner.log`, and `manual-build-storefront.log`.
- Candidate SQL empty-module down → clean up → repeated up completed with exit 0 against the disposable local PG16 database. Populated destructive rollback refusal is covered by the native test. No production SQL number was allocated or applied.
- Generated payment build metadata restored; temporary UI fixture/server removed. The owned disposable PostgreSQL server was stopped. The pre-existing untracked panel node_modules symlink was not modified or committed.
- Provider registration/terms and authorized real-account acceptance remain the existing publication gates. No provider clarification request was sent, real merchant key collected, customer exported, or live deployment changed.
