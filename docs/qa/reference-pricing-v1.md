# Reference pricing V1 — isolated candidate evidence

## Scope and source

- Canonical starting point reverified on 2026-09-20: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5` (`codex/design-tabs-save-fix-live`). The tested closeout application source is `d21e64af2ab30e7b999213967d65a82717eb544d`; a later canonical/base change needs re-evaluation.
- Branch: `codex/reference-pricing-v1`. The original working tree and its untracked QA files were not used for implementation.
- Verbatim supplied specification: `docs/specs/Celebix_Referans_Fiyatlandirma_V1.md`; both downloaded and committed copies have SHA-256 `3d27740789ed9d5336696e745e952b7138099bc145d0e2a7d8b7092bdbb14c59`.
- No real-store reference, catalog, order, payment or provider mutation; no shared database migration, deploy, merge, or Auto Deploy setting change.

## Baseline isolated checks (source `2bac6e60f76e44532cc7be7d787195be25fd3d2c`, 2026-09-20)

The source was copied to a disposable remote Linux runner with Node 22 and PostgreSQL 16. SQL tests ran in a read-only, network-disabled, capability-dropped container with a disposable PostgreSQL cluster; no staging database was connected. These are **baseline** results for the committed source above, not for the later closeout edits. The original runner image was `sha256:7caaef610190ddc7fdf277336ef3e7b83f979fe9b98e30a816faf53a88c9a465`.

| Evidence | Result | Coverage |
| --- | --- | --- |
| Migration 130, reference/policy/permissions | 27/27 PASS | Exact arithmetic, immutable sets, legacy edits, role and tenant boundaries, rollback/reapply. |
| Migration 131, public prices | 9/9 PASS | Effective-price resolution and public catalog projections. |
| Migration 132, checkout binding | 13/13 PASS | Confirmed quote lineage, promotion/shipping seal, stale price rejection, bound offline/hosted replay, rollback guard. Last run includes the strengthened receipt component parity check. |
| Migration 133, policy preview | 10/10 PASS | Server-calculated candidate price/impact and permissions. |
| Migration 134, manual orders | 5/5 PASS | Dynamic-price fail-closed behavior in draft and line creation, rollback/reapply. |
| Migration 135, promotions | 6/6 PASS | Protected gold line/gift/bundle exclusion unless explicitly opted in; existing fixed-price promotion behavior. |
| Focused Node 22 TypeScript tests across contracts, data, panel, storefront | 150/150 PASS | Parsers, repository adapters, panel endpoints/client/model, catalog cache/pagination, cart and hosted flows. These are isolated focused tests, not the complete application suite. |
| Diff whitespace check | PASS | `git diff --check`. |

The earlier checkpoint did not preserve a verbatim shell transcript for the `150/150` focused TypeScript invocation. Those results were reported with exit 0 but their exact command cannot now be independently reconstructed, so they are **historical background only**. The six PostgreSQL harness entry points are `postgres-harness.mjs`, `public-harness.mjs`, `checkout-harness.mjs`, `policy-preview-harness.mjs`, `manual-order-harness.mjs`, and `promotion-guard-harness.mjs`; their newer, changed-source rerun is recorded below. No baseline count is used to certify the final candidate.

At the baseline checkpoint, hosted scenarios used a synthetic disposable database/payment profile. They did not call a real payment provider or prove live payment, callback, invoice or tax acceptance. That earlier runner lacked every production dependency (`pg`/payment adapters), so the full package suites, typechecks/builds and `apps/storefront-shared/lib/checkout/runtime.test.ts` had **not yet** run; the closeout runner below subsequently ran the full dependency graph. No physical, browser-based 1440/1024/390 or authenticated merchant acceptance was performed. Fixture/isolated results must not be presented as live QA.

## Open gates before a release or pilot

1. Exercise 1440/1024/390 and keyboard/focus in an isolated browser fixture, then obtain separate authenticated merchant acceptance. Keep evidence bound to the final candidate SHA.
2. Confirm search/feed indexing delay and import/export policy behavior. Barcode dynamic-price support is now implemented in the closeout candidate; it was absent at this baseline source.
3. A shipping-only free-shipping promotion can still benefit a cart containing protected gold; the exclusion implemented here guards the gold **item price**, direct gift, bundle and item discounts. If the commercial rule should prohibit every benefit on a gold-only cart, define that rule and add corresponding tests before a pilot.
4. Confirm gold purity/tariff definitions and tax/invoicing policy with the merchant; none is inferred from the supplied illustrative reference values. No automatic reference seed is installed, and all existing variants remain fixed until an authorized policy change.
5. Obtain exact candidate migration/rollback review and a separately approved pilot/deployment plan. Once dynamic policies or historical bindings are in use, blindly reverting to old code or dropping migrations would be unsafe.

## Closeout candidate: specification and consumer matrix

The closeout edits after `2bac6e60` were committed as application source `d21e64af2ab30e7b999213967d65a82717eb544d`. The only subsequent edit is this QA document. Do not attribute baseline `70/70` and `150/150` to that SHA; the original focused TypeScript count overlaps the complete suites below and is not additive.

| Requirement | Application/function | Isolated evidence | Remaining boundary |
| --- | --- | --- | --- |
| Fixed TRY, USD, EUR, direct gram and explicit purity conversion | SQL 130 `pricing_calculate_variant_price`; reference-pricing contracts | PG 130 and contracts tests | Merchant tariff/purity convention not approved in live data. |
| Variant gram, fixed/per-gram labour, uplift, exact rounding | SQL 130/133; `VariantPricingPolicyControl.tsx` | PG 130/133, decimal tests | No physical scale test. |
| Manual tenant references, draft, preview, atomic activation, version/idempotency/authority | SQL 130/133/137; data repository; `ReferencePricingConsole.tsx` | PG merchant-role/tenant/retry tests | No live merchant activation. |
| Price-list precedence and protected promotion lines | SQL 130/135; pricing repository | PG override/promotion cases | Shipping-only promotion on gold cart is a commercial policy question. |
| Current public catalog and merchant list/detail/preview, including sort/filter before pagination | SQL 131/138/140/141; catalog repository | PG public/legacy-consumer tests | Search/feed indexing delay and every design variant not browser-tested. |
| Sealed quote, payment start, history snapshots | SQL 132 V3 quote/complete/hosted functions; storefront checkout | PG checkout independent-connection race and fake transport | No real provider/callback/invoice acceptance. |
| Missing/inactive reference unavailable; old fixed product remains fixed | SQL 130/137/138/140/141 | PG fixed/draft/inactive cases | Mixed old/new fleet unsafe; see publication gate. |
| Barcode anonymous storefront context and frozen print batch | SQL 136/139; barcode contracts, document renderer | PG label/print cases; document tests | No physical printer test; printed paper cannot change. |
| Legacy write does not erase policy | SQL 130 write guard, SQL 134 manual-order guard | PG write/manual-order tests | Existing fixed-only CSV/provider imports cannot carry dynamic policy. |
| Mira presentation via server authority | Panel reference-pricing components, model and HTTP | Panel tests and production build | 1440/1024/390 browser/keyboard evidence pending. |

| Consumer | Current or historical? | Closeout behavior | Evidence |
| --- | --- | --- | --- |
| Home/list/category/PDP/search/design product projection | Current anonymous storefront | SQL 131 effective projection, not per-card client repricing | PG public harness, storefront tests |
| Panel product list/detail/preview, effective sort/filter/page | Current merchant channel | SQL 138/140/141; explicit unavailable | PG legacy-consumer, data tests |
| Barcode preview and PDF/ZPL | Current anonymous price at batch creation, then historical print snapshot | SQL 136/139; document blocks unavailable/mismatch | PG label/print, document tests |
| Price-list preview | Current contextual price and fixed override | Fixed override not multiplied again | PG 130, panel tests |
| Quick-order creation | Current quick-order/customer context | Server resolves/revalidates; client does not present anonymous base as final | PG checkout, quick-link tests |
| Cart/quote/payment initiation | Current until confirmed quote, then sealed attempt | V3 digest, revalidation and attempt binding | PG checkout, storefront tests |
| Order/payment/refund/shipping/cost history | Historical snapshot | Stored amounts remain independent of later reference values | PG checkout history/replay, source inspection |
| CSV/provider import | Supplied fixed TRY | New fixed products; dynamic variant stale-cent write conflicts | PG guard, import inspection |
| Dynamic-policy product export/feed | Not found in this candidate | No new channel invented | Source inspection |

## Closeout isolated runner and results

The worktree is copied without `.git`, `node_modules`, `.env*`, keys or certificates to disposable `/tmp/celebix-pricing-ci.ohStwj`. Node tests/typechecks/builds use `node:22.16.0-bookworm-slim` (`sha256:048ed02c5fd52e86fda6fbd2f6a76cf0d4492fd6c6fee9e2c463ed5108da0e34`). PG harnesses use `postgres:16.14-bookworm`, a disposable cluster, no external network, read-only container and dropped capabilities. Neither staging nor production DB is connected.

| Command/scope | Result | Note |
| --- | --- | --- |
| `npm test --workspace packages/saas-contracts` | 346/346 PASS, exit 0 | Full contracts package. |
| `npm test --workspace packages/saas-data` | 629/629 PASS, exit 0 | Full data package; test script uses transform-types for parameter-property fixtures. |
| `npm test --workspace apps/customer-panel` | Exit 0 | Full two-stage suite; final stage 54/54 PASS, first stage has one pre-existing skip. |
| `npm test --workspace apps/storefront-shared` | 548 PASS, 2 cancelled, 0 fail; exit 1 | Same two cancellations reproduced on untouched base; not a green full suite. |
| `tsc -p apps/customer-panel/tsconfig.json --noEmit` | PASS, exit 0 | Isolated Node 22.16. |
| `tsc -p apps/storefront-shared/tsconfig.json --noEmit` | PASS, exit 0 | Isolated Node 22.16. |
| `tsc -p packages/saas-contracts/tsconfig.json --noEmit` and data equivalent | PASS, exit 0 | Isolated Node 22.16. |
| `npm run build --workspace apps/customer-panel` | PASS, exit 0 | Next 16.2.1, includes `/settings/pricing`. |
| `npm run build --workspace apps/storefront-shared` | PASS, exit 0 | Next 16.2.1. |
| Seven PG harnesses against migrations 130–141 | 80/80 PASS, exit 0 | 27 + 9 + 14 + 10 + 5 + 6 + 9 named checks; includes independent DB connections/transactions. |
| `git diff --check` and staged diff check | PASS, exit 0 | No skips or weakened assertions added. |

The storefront `scripts/healthcheck.test.mjs` deadline test is cancelled in this Node 22.16 runner (`Promise resolution is still pending but the event loop has already resolved`), then a following test is cancelled by parent. This exact 2-cancellation/exit-1 behavior was reproduced from an untouched archive of base `2bac6e60f76e44532cc7be7d787195be25fd3d2c` in the same image and network mode. Do not count the full storefront suite as green or skip these tests. Affected cart/checkout/share-route tests passed 54/54, and storefront build/typecheck passed.

The checkout harness uses **two independent PostgreSQL connections**: one holds the quote transaction/lock, another tries reference activation and waits at least one second, then the subsequent quote sees the newly activated set. It also covers quote-to-payment change, one-set sealing, bound hosted/offline replay, late callback, old order/transfer amount, fixed override, tenant and unavailable behavior. Provider transport is fake. Merchant authority is exercised with actual disposable database roles rather than an always-allow stub.

## Publication, rollback and visual gates

Migration numbers 130–141 are unique in this worktree and absent from the rechecked canonical base. Existing products remain fixed until an authorized policy write. SQL down guards preserve dynamic policy history and print snapshots; order/payment/audit data must never be deleted for rollback.

Read-only Coolify pre-push check on 2026-09-20: `celebix-panel-staging-auth01`, `celebix-owner-staging-auth01`, `celebix-storefront-staging-phase3a4` and `celebix-analytics-worker-staging-auth01` each have `is_auto_deploy_enabled=false` and `is_preview_deployments_enabled=false` in application settings. Their deployment queues had no `queued`, `pending`, `starting`, `in_progress` or `running` entry. The repository has one push/PR workflow, `.github/workflows/self-serve-db-migration-rehearsal.yml`; it is a migration rehearsal, not an application deploy. No setting was changed. Running image tags were **not** treated as proof of these settings.

**Mixed-version risk found by independent read-only review:** SQL 136 lines 168–173 changes the existing `barcode_label_list` JSON shape and SQL 139 adds print snapshot context. The old panel's strict `parseBarcodeLabelVariantRow` rejects unknown keys, so even fixed-product label list/job creation can break during overlap. Older V1/V3 catalog readers can display cached base cents for active dynamic variants. Therefore zero-downtime old/new compatibility is **not** proven. A later separately approved release needs coordinated database + Customer Panel + Storefront/checkout cutover (or versioned RPC compatibility), with dynamic-policy activation held until every consumer is upgraded. SQL 137 down's warning about reverting after inactive activation is procedural rather than enforced; check this before rollback. Do not auto-rollback to an old reader after dynamic policies or print snapshots exist. This task authorizes no such deployment.

Before a pilot, separately confirm staging domain/tenant, tax-inclusive/exclusive display contract, jewellery tax/invoice treatment, merchant gold/purity conventions, search/feed delay and shipping-only promotion policy. No production rate or new tax rule was invented here. The required deployment set is **database migrations + Panel + Storefront/checkout**, not Panel only; canonical Mira/domain improvements must remain in the future merge base.

The browser-control skill is available but its Browser plugin is not; the closeout has **no persistent 1440/1024/390 screenshot matrix yet**. Component/model tests and builds are not browser QA. Keyboard/focus, Turkish numeric input, stale responses and overflow remain fixture-browser acceptance. No authenticated Güzide test or physical label test was done. Until these and the mixed-version gate are resolved, the Draft PR status is **PARTIAL / VALIDATION_PENDING**, not release approval.
