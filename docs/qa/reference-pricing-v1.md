# Reference pricing V1 — isolated candidate evidence

## Scope and source

- Canonical starting point reverified on 2026-09-20: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5` (`codex/design-tabs-save-fix-live`). The final tested application source is `01f0f7115e8e4ffc98e25585aa1f6632b0944c33`; `d21e64af2ab30e7b999213967d65a82717eb544d` below is historical pre-compatibility evidence. A later canonical/base change needs re-evaluation.
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

1. The isolated 1440/1024/390 and basic keyboard/focus fixture matrix is below. Obtain separate authenticated merchant acceptance and retain evidence bound to the actual deployed SHA.
2. Confirm search/feed indexing delay and import/export policy behavior. Barcode dynamic-price support is now implemented in the closeout candidate; it was absent at this baseline source.
3. A shipping-only free-shipping promotion can still benefit a cart containing protected gold; the exclusion implemented here guards the gold **item price**, direct gift, bundle and item discounts. If the commercial rule should prohibit every benefit on a gold-only cart, define that rule and add corresponding tests before a pilot.
4. Confirm gold purity/tariff definitions and tax/invoicing policy with the merchant; none is inferred from the supplied illustrative reference values. No automatic reference seed is installed, and all existing variants remain fixed until an authorized policy change.
5. Obtain exact candidate migration/rollback review and a separately approved pilot/deployment plan. Once dynamic policies or historical bindings are in use, blindly reverting to old code or dropping migrations would be unsafe.

## Earlier closeout candidate: specification and consumer matrix

The first closeout edits after `2bac6e60` were committed as application source `d21e64af2ab30e7b999213967d65a82717eb544d`. This is historical evidence, superseded by the compatibility source and final checks below. Do not attribute baseline `70/70` and `150/150` to that SHA; the original focused TypeScript count overlaps the complete suites below and is not additive.

| Requirement | Application/function | Isolated evidence | Remaining boundary |
| --- | --- | --- | --- |
| Fixed TRY, USD, EUR, direct gram and explicit purity conversion | SQL 130 `pricing_calculate_variant_price`; reference-pricing contracts | PG 130 and contracts tests | Merchant tariff/purity convention not approved in live data. |
| Variant gram, fixed/per-gram labour, uplift, exact rounding | SQL 130/133; `VariantPricingPolicyControl.tsx` | PG 130/133, decimal tests | No physical scale test. |
| Manual tenant references, draft, preview, atomic activation, version/idempotency/authority | SQL 130/133/137; data repository; `ReferencePricingConsole.tsx` | PG merchant-role/tenant/retry tests | No live merchant activation. |
| Price-list precedence and protected promotion lines | SQL 130/135; pricing repository | PG override/promotion cases | Shipping-only promotion on gold cart is a commercial policy question. |
| Current public catalog and merchant list/detail/preview, including sort/filter before pagination | SQL 131/138/140/141; catalog repository | PG public/legacy-consumer tests | Search/feed indexing delay and every design variant not browser-tested. |
| Sealed quote, payment start, history snapshots | SQL 132 V3 quote/complete/hosted functions; storefront checkout | PG checkout independent-connection race and fake transport | No real provider/callback/invoice acceptance. |
| Missing/inactive reference unavailable; old fixed product remains fixed | SQL 130/137/138/140/141 | PG fixed/draft/inactive cases | The earlier mixed-fleet risk was addressed in the final candidate below. |
| Barcode anonymous storefront context and frozen print batch | SQL 136/139; barcode contracts, document renderer | PG label/print cases; document tests | No physical printer test; printed paper cannot change. |
| Legacy write does not erase policy | SQL 130 write guard, SQL 134 manual-order guard | PG write/manual-order tests | Existing fixed-only CSV/provider imports cannot carry dynamic policy. |
| Mira presentation via server authority | Panel reference-pricing components, model and HTTP | Panel tests, production build and isolated browser matrix below | Authenticated merchant acceptance pending. |

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

## Earlier closeout isolated runner and results (source `d21e64af`)

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

**Historical mixed-version finding at `d21e64af`:** SQL 136 changed the existing `barcode_label_list` JSON shape, which the old panel's strict parser rejected. Old catalog readers could display cached base cents for an active dynamic variant. This risk prompted the versioned compatibility and default-off activation implementation at `01f0f711` described below; this paragraph is not the final candidate disposition. No deployment is authorized by this PR.

Before a pilot, separately confirm staging domain/tenant, tax-inclusive/exclusive display contract, jewellery tax/invoice treatment, merchant gold/purity conventions, search/feed delay and shipping-only promotion policy. No production rate or new tax rule was invented here. The required deployment set is **database migrations + Panel + Storefront/checkout**, not Panel only; canonical Mira/domain improvements must remain in the future merge base.

The actual Panel components were mounted in the existing isolated browser fixture with synthetic USD/EUR/22-ayar values and a synthetic variant. No Güzide account, rate, product or customer data entered this fixture. The local browser reached the disposable remote fixture only through a loopback SSH tunnel. All observed fixture GETs returned HTTP 200; browser console error log was empty. Images are **viewport captures, not live merchant screenshots**:

The fixture additions and PNGs are test/QA-only changes after application source `d21e64af2ab30e7b999213967d65a82717eb544d`; no application component or production SQL was changed by this browser pass. Its Next development server compiled the tested routes and responses. A broad standalone fixture `tsc` exits 2 on many existing fixture/parent import-extension and unrelated typing errors; none of its diagnostics named the new `mira-reference-pricing` or `api/reference-pricing` files. This is not substituted for the passing production Panel typecheck/build.

| Surface | 1440 × 900 | 1024 × 768 | 390 × 844 |
| --- | --- | --- | --- |
| Manual references | [PNG](artifacts/reference-pricing-v1/references-1440.png) | [PNG](artifacts/reference-pricing-v1/references-1024.png) | [PNG](artifacts/reference-pricing-v1/references-390.png) |
| Variant gold method | [PNG](artifacts/reference-pricing-v1/variant-gold-1440.png) | [PNG](artifacts/reference-pricing-v1/variant-gold-1024.png) | [PNG](artifacts/reference-pricing-v1/variant-gold-390.png) |

Additional fixture captures: [explicit purity ratio + per-gram labour, 390](artifacts/reference-pricing-v1/variant-ratio-390.png), [reference read-only, 390](artifacts/reference-pricing-v1/references-readonly-390.png), [variant read-only, 390](artifacts/reference-pricing-v1/variant-readonly-390.png). Document root `scrollWidth` equalled viewport width at 1440, 1024 and 390 for both editable surfaces; no horizontal overflow was measured. Four method selections showed their distinct fields (fixed TRY, USD amount, EUR amount, gram/purity), and ratio mode exposed product purity separately from the direct tariff. Per-gram labour exposed its amount field. Tab moved focus to the next select; Escape left a stable focus target. Read-only variants had zero editable inputs and no save action. No actual value was saved or activated.

Limits: viewport captures show above-the-fold content; full-page stitching was not used for acceptance. This fixture did not verify server-calculated impact counts, a real quote, stale response, conflict/save persistence, live accessibility assistive technology or physical keyboard hardware. Component/model tests cover some error-state behavior, not a live merchant workflow. Browser-plugin skill/runtime was unavailable, so the existing computer/browser control and its Playwright read-only inspection were used. No authenticated Güzide test or physical label test was done. Live acceptance remains pending, so the Draft PR is not release approval.

## PR #80 mixed-version compatibility closeout (2026-09-20)

Application source `01f0f7115e8e4ffc98e25585aa1f6632b0944c33` contains all compatibility implementation. The later `169b5d31531ecebaa1a8ca105a9de4cd4e4b4fd8` changes only the Storefront healthcheck test fixture; the production healthcheck and pricing application source are unchanged. This QA document is a still later evidence-only change. The full final checks below ran with the application source at `01f0f711` and the healthcheck test repair at `169b5d31`; they are not evidence for a deployed live version.

| Boundary | Old consumer during mixed deployment | New consumer | Safety rule |
| --- | --- | --- | --- |
| Barcode label list and print jobs | Existing RPC/HTTP shape, strict old parser, frozen historical amount | `barcode_label_list_v2`, `barcode_print_job_create_v2`, `barcode_print_job_get_v2` and versioned Panel HTTP | Old fixed workflows stay readable/writeable; legacy create is selected by old HTTP, not accidentally by the V2 facade. Dynamic old create fails explicitly until new consumer is active. Print replay keeps the original amount and context snapshot. |
| Merchant catalog list/detail/preview | V3/legacy projection keeps its exact old shape but uses effective amount; unsafe dynamic edit/preview fails closed | V4 RPC and `/api/catalog/products/v2` richer price context | Old fixed and archived rows remain readable; active missing references fail explicitly. No stale base cents or false compare-at strike-through. |
| Dynamic policy/reference activation | Existing fixed policies remain the default | Owner-controlled per-store `pricing_dynamic_activation` gate | Gate starts OFF and cannot be changed by the app role. A tenant-specific lock serializes gate changes with policy/active-set writes. A disabled gate blocks dynamic activation rather than relying only on an operator note. Read safety is enforced separately from write gating. |
| Rollback | Earlier consumer remains safe before activation | Down migrations reject dynamic-policy, active-set or historical print use when unsafe | Do not blindly drop migrations or revert old code after dynamic use; retain the old image and exact settings until separately approved cutover. |

An untouched archive of canonical `c09d59a21944fb24ef82cf904db5e444ec1d4fd5` was used to execute the **real old repository and strict parser** against the changed disposable database. This is stronger than a mocked old-shape test: fixed label list/create/read/replay passed; deliberately feeding V2 keys to the old parser was rejected; old dynamic creation produced a controlled error; old catalog list/detail used effective amount and fixed/archived fallbacks; historical print amounts did not change. Separate activation-gate tests covered default OFF, app-role denial, gate/policy locking, down/reapply and unsafe rollback refusal. The gate tests cover policy waiting behind a closing gate; the checkout harness separately covers a quote lock preceding reference activation. No real fleet overlap was run.

The final isolated Linux runner used Node 22.16.0 and disposable PostgreSQL 16. Source and the exact canonical archive were copied without `.env*`, credentials or `.git`. PostgreSQL was network-disabled, read-only at the container layer, capability-dropped, and used only a disposable cluster. No live database or payment provider was connected.

| Final check | Result |
| --- | --- |
| Complete `packages/saas-contracts` suite | 346/346 PASS, exit 0 |
| Complete `packages/saas-data` suite | 629/629 PASS, exit 0 |
| Complete Customer Panel two-stage suite | 1369 PASS / 1 pre-existing SKIP, then 57/57 PASS; 1426 PASS / 1 SKIP total, exit 0 |
| Complete Storefront suite | 550/550 PASS, 0 cancelled, exit 0 |
| Relevant typechecks: contracts, data, Customer Panel, Owner, Storefront | PASS, exit 0 each |
| Customer Panel and Storefront release builds | PASS, exit 0 each |
| Nine disposable PostgreSQL harnesses, including canonical old-consumer and activation-gate harnesses | PASS, exit 0 each |
| `git diff --check` and staged diff check | PASS |

The Storefront healthcheck deadline test on untouched canonical `c09d59a` reproduced 2 cancelled tests and exit 1 under the same runner. The narrow test-only change at `169b5d31` retains a referenced timer until the production abort deadline fires; it did not change the production healthcheck. The final complete Storefront run is green rather than hiding the cancellations. A monorepo-wide `npm run typecheck --workspaces --if-present` still exits 1 on unrelated pre-existing `apps/admin` and `apps/storefront-test1` TypeScript diagnostics; all five relevant package typechecks above passed. Neither baseline problem is attributed to reference pricing.

The initial independent review found old-parser barcode breakage, stale old catalog amounts, false equal compare-at display, a missing legacy barcode facade method, and archived fixed/detail edge cases. The committed implementation and focused regressions address those findings. A final independent, read-only review of `01f0f711` and `169b5d31` found no new Critical/Important blocker; it did not rerun tests or inspect a live deployment. This is a code/isolated-DB compatibility result, **not** authenticated merchant acceptance or zero-downtime fleet certification.

Read-only pre-push staging check: Customer Panel, Owner, Storefront and Analytics Worker each had Auto Deploy OFF and Preview Deployments OFF, with no queued, pending, starting, in-progress or running deployment. The running Customer Panel remained on its other staging branch/image; `saas.pricing_reference_set_activate` was absent in that staging database, so migrations 130–141 have **not** been applied there. No application or database setting was changed by this task. A normal push of this draft branch therefore does not constitute a deployment.

Release sequencing for a separately approved window:

1. Review the exact canonical/PR base, preserve verified prior images and settings, and apply the backward-compatible database migrations with the store activation gate OFF.
2. Deploy the approved combined source to the necessary Customer Panel and Storefront/checkout services; retain the existing domain and Design Settings changes in the release base.
3. Confirm old replica traffic has drained, previously open browsers reach compatible API endpoints, and relevant price caches/projections have refreshed. Do not infer this solely from the new SQL or perform a global cache flush.
4. In the authorized environment, verify fixed-product list/cart/barcode regressions and read-only new-price preview with the gate still OFF.
5. Only in a separately permitted merchant pilot, enter the merchant's own references and activate its store-specific dynamic policies. Tax/invoice, purity/tariff and shipping-only promotion decisions remain separate commercial approvals.
6. Verify final displayed price, quote/payment amount and barcode label consistency against that exact deployed SHA; keep provider and historical snapshot evidence separate.

If any pre-activation step fails, keep the gate OFF and revert the application image/settings without assuming schema down is necessary. After dynamic policies, references or print snapshots exist, run guarded rollback preflight and do not assume old readers or migration down are safe. This PR does not perform any of these live steps.

**Status: DRAFT / ISOLATED COMPATIBILITY VERIFIED; LIVE ACCEPTANCE AND RELEASE AUTHORIZATION PENDING.** The prior fixture PNGs remain synthetic visual evidence, not live Güzide acceptance. No migration, deploy, merge, price change, provider operation, or Auto Deploy change occurred.
