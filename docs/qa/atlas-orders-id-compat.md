# Orders event/delivery identity compatibility

## Scope and provenance

- User authorization: `ATLAS-ORDERS-ID-COMPAT-01`, supplied attachment `0834936f-1f4b-4eeb-aab0-af73b24ee958`, 2026-09-08. This is code/test/PR authority, not deployment or payment approval.
- Canonical branch verified through PR #75 and remote branch ref: `codex/design-tabs-save-fix-live`.
- Exact base: `ad2c7d479457fcc2ad0595d32476efebab20fe6d`.
- Isolated branch/worktree: `codex/atlas-orders-id-compat`, `/Users/Celebix/Documents/ChatGPT/atlas-orders-id-compat`.
- Mira PR #75 and its exact head `6a0d56a3d809df3dd35de0f13c9b703737b6099d` are unchanged. That is the previously reported staging version, not a new runtime certification in this task.
- Existing diagnostic: Mira `docs/qa/paytr-staging-rebind-preflight-2026-09-08.md` and `docs/qa/orders-503-reproduction.mjs`. Historical source replay reconfirmed six expected failures at ad2c7d and 6a0d56; it is not an old live-runtime test.

## Cause and bounded fix

Stored SQL UUID values produced from deterministic MD5 have canonical UUID text but need not have RFC version/variant bits. Strict contract parsing rejected these event/delivery fields. The repository mapped malformed projections to unavailable and the HTTP handler returned actual 503; independently, a client parser failure after HTTP 200 can also surface an `OrderApiError("unavailable", 503)`.

New domain parsers accept only exact lowercase 36-character 8-4-4-4-12 hexadecimal text. They return the input unchanged. No trimming, case conversion or bit rewriting occurs. Only `OrderEvent.id`, `OrderEmailDeliverySummary.id`, delivery retry route/client/repository and shared email workflow delivery identity boundaries use them. Global UUID, store/order/principal/membership/operation/note/lease validation is unchanged. TenantContext, orders.manage and SQL store+order+delivery lookup remain authoritative; an ID never grants permission.

The shared email workflow change is parsing-only. This task does not start workers or make provider/send calls. Mismatched returned IDs and idempotency keys still fail closed.

## Persistence and migration decision

`202608050089_order_transactional_email.up.sql` stores delivery IDs, references stored order events and enforces a unique logical delivery key `(store_id, order_id, event_type, recipient_kind)`. Enqueue uses deterministic MD5 and conflict handling; retry updates scheduling for the exact persisted row rather than creating another delivery. Older order event producers in migration 023 also remain relevant; migration 079 does not replace every producer.

No producer, SQL, migration, PK/FK, snapshot, payment or idempotency-key change is needed for this compatibility patch. No live data is read or mutated by this task. Existing code and patched code use exactly the same schema; reverting application code requires no schema rollback, but restores the known legacy parsing limitation. Disposable down/reapply tests validate the pre-existing schema guard, not a new migration.

## Evidence

- Six regression cases (three representative legacy IDs in event and delivery projections): observed **0/6 PASS, 6 FAIL** before production edits; **6/6 PASS** after. Standard UUID controls stayed valid.
- Initial focused contract/repository/HTTP/client/workflow run: **112/112 PASS**. Further coverage added after review is recorded in final verification below.
- Negative syntax: empty, non-string, uppercase, whitespace/newline/NUL, malformed hex/hyphens, path traversal and injection-like inputs.
- Negative authority: legacy-shaped store/principal/membership/order/operation/lease remains rejected.
- HTTP 503 versus HTTP 200 + client parse error tested as separate transport outcomes, despite the same public client error status.
- Disposable PostgreSQL **16**, Unix socket only, no existing DB connection: **14/14 PASS**. Includes real RPC legacy lookup, valid foreign tenant and wrong order denial, orders.manage gate, attempt/expiry/lease eligibility, concurrent retry, immutable order/event snapshots and delivery IDs/FKs/keys, existing logical-email replay, lease reclaim and schema down/reapply guards. Provider-event receipt is synthetic SQL fixture input, not a network call or provider certification. Harness removed only its own disposable cluster on exit.
- Independent read-only review: `id_compat_review`, final Critical **0**, Important **0**, Minor **0**. Requested legacy seal/fail and mismatched response coverage was added and passed. Reviewer inspected code, not a live system.

## Final verification

All verification processes were run serially. No live QA result is implied by isolated tests or local builds.

| Check | Result |
| --- | --- |
| Contracts full `npm test --workspace @celebix/saas-contracts` | 331 PASS, 0 FAIL |
| Data full `npm test --workspace @celebix/saas-data` | 612 PASS, 0 FAIL |
| Customer Panel full `npm test --workspace @celebix/customer-panel` | 1,319 PASS, 0 FAIL, 1 SKIP (1,265 + 54 PASS across its two processes) |
| Storefront shared full `npm test --workspace @celebix/storefront-shared` | 538 PASS, 0 FAIL |
| Owner full `npm test --workspace @celebix/owner` | 682 PASS, **2 FAIL**; do not report full green |
| Typecheck: contracts, data, Customer Panel, storefront-shared, Owner | All five PASS |
| Customer Panel production build | PASS, exit 0 |
| Storefront shared production build | PASS, exit 0 |
| Owner production build | PASS, exit 0 |
| Final focused contracts/data/HTTP/client/workflow suite | 114/114 PASS, 0 SKIP |
| Disposable PG16 harness | 14/14 PASS |
| `git diff --check` | PASS |

Customer Panel's skipped case is `installed Next server redirects signed-out price-list list new and detail routes to login`. It is not claimed as authenticated QA. The added notification-failure test actually runs the compiled detail component with controlled hooks and a rejecting notification dependency, asserting that order number and product remain visible. It is not a browser screenshot or real-session test.

Owner failures: `merchant-provider-execution/production-config.test.ts` expected both compiled provider execution identities null, but the canonical compiled PayTR TEST identity is present; `production.test.ts` validation-only fixture then receives an unhandled repository outcome. No payment implementation, approval or metadata was changed to make these pass. Read-only replay using `docs/qa/atlas-orders-id-baseline-loader.mjs` loads exact **ad2c7d479457fcc2ad0595d32476efebab20fe6d** tracked TS/MJS source with current installed dependencies: **15 PASS / same 2 FAIL** across the two files. This demonstrates reproduction on canonical source, not a clean historical installation/runtime or provider certification.

Reproduce the bounded baseline check:

```sh
node --conditions=react-server --experimental-transform-types --import ./docs/qa/atlas-orders-id-baseline-loader.mjs --test apps/owner/lib/merchant-provider-execution/production-config.test.ts apps/owner/lib/merchant-provider-execution/production.test.ts
node --experimental-transform-types tests/saas-phase3/order-transactional-email/postgres-harness.mjs
```

Contracts/data are source packages with typecheck/test scripts, not standalone build scripts. Customer Panel, Owner and storefront-shared are the app package consumers of these packages; admin has no dependency/import on the changed Orders contract and was not edited. Shared-contract skill guided the cross-consumer tests and builds.

Disk: initially about 10 GiB available, about 7.9 GiB after isolated dependency setup. Available bytes immediately before Owner build: **5,246,464,000** (above the 5 GB floor); after builds: **4,832,997,376**. No further heavy build was started below the floor. No project cleanup was performed. Generated local test/build output is not a release artifact or deploy. Node experimental-type warnings and Owner's existing middleware-deprecation warning are toolchain messages, not a live console-clean claim.

## Integration and release order (not executed)

1. Review this separate backend PR against canonical `ad2c7d479457fcc2ad0595d32476efebab20fe6d`; merge only with separate authority.
2. Update Mira PR #75 (currently `6a0d56a3d809df3dd35de0f13c9b703737b6099d`) onto the resulting exact canonical merge SHA. Preserve its design and form regressions. The merge and combined candidate SHAs do not exist yet and must not be invented.
3. Re-run combined tests/build and independent review; record the exact candidate. Previous exact-SHA payment approval does not transfer automatically.
4. Obtain the required exact-candidate build approval/rebind and one controlled Customer Panel staging deployment authorization; preserve verified rollback image and matching settings.
5. On the deployed exact candidate, retest the same failing order detail and notifications, then authenticated Orders/shell/responsive QA. Until then: live 503 closeout unverified, no LOCK GREEN.

No merge, push to Mira, deployment, environment/secret/approval change, provider call, production change or live DB mutation is part of this evidence.
