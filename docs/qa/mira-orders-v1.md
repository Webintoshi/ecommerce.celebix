# Mira Orders V1

Base: `ad2c7d479457fcc2ad0595d32476efebab20fe6d`
Branch: `codex/mira-orders-v1`

## Current scope and evidence

### Canonical integration checkpoint — 2026-09-08 (in progress)

This section supersedes earlier branch/deployment preparation statements below; historical evidence is retained, not re-certified.

- Authorization: current-thread `ATLAS-ORDERS-INTEGRATION — TETİKLEYİCİLERİ KAPAT VE ENTEGRASYONU TAMAMLA`. No deployment, payment rebind, provider call or shared DB mutation authority.
- PR #76 exact reviewed head `c66505d9821b3dc55b7c57e7f9fd38cab343c4c9` merged through the authenticated GitHub UI using **Create a merge commit**. GitHub showed Ready to merge; no branch protection bypass was used. No submitted GitHub reviews were present; the documented independent agent review is distinct from repository review approval.
- New canonical / actual PR #76 merge: `455a4a538f4ff78915d38d37247956949aa2f15e`. Parents: `ad2c7d479457fcc2ad0595d32476efebab20fe6d`, `c66505d9821b3dc55b7c57e7f9fd38cab343c4c9`. Backend source branch retained.
- Normal merge into existing Mira worktree produced local merge commit `f6fb8d8364fb11fa8af8a813dc40a489910e02ab`. Parents: `6a0d56a3d809df3dd35de0f13c9b703737b6099d`, `455a4a538f4ff78915d38d37247956949aa2f15e`. No conflicts; Git automatically combined `order-console.test.ts`. No reset, force push or manual backend copying.
- Remote PR #75 remains at `6a0d56a3d809df3dd35de0f13c9b703737b6099d`; combined validation is incomplete, so push is withheld. The 13 pre-existing untracked live QA artifacts remain untouched.
- Orders production presentation and browser form-regression harness are byte-identical to Mira parent. Compatibility contracts/data/HTTP/client files match new canonical. Remaining canonical-to-Mira diff is frontend/tests/QA only. `git diff --check` passed on the merge.

Deployment safety (Coolify UI, saved settings reloaded):

| Application / ID | Auto Deploy before → after | Source pin retained | Latest deployment after merge |
| --- | --- | --- | --- |
| Owner staging / `bpsgdwfiswna06mooguu2mr3` | ON → OFF | `17e6c10f543917c3c4c85b6d662bce299a8da2ae` | `i5cdnj4dadq4iqbcee342faz`, Success |
| Analytics Worker staging / `qn0gxpiog907c9kcjkurom5r` | ON → OFF | `d8143c4b315d25ada88be4a9517989cff4629627` | `twxisohfg18kk3498dow9si1`, Success |
| Customer Panel staging / `yk1h6d97z7ex0h74ok3zrj5c` | OFF → OFF | `6a0d56a3d809df3dd35de0f13c9b703737b6099d` | `oxnv631qhaj7n8chvq7cfx8w`, Success |
| Storefront staging / `vtc2aah63jbqnmtxmvykn6jl` | OFF → OFF | no setting written | `wlkln9g5svb2c5aj6pdjn22n`, Success |

Owner/Worker retain canonical source branch; Panel retains `codex/mira-orders-v1`. No running/queued deployment appeared in the current deployment lists. No deployment, restart, stop or cancellation was invoked. Only the two approved Auto Deploy checkboxes were changed in this continuation; source/pin, hooks, SOURCE_COMMIT, approval and secret/environment settings were not edited. Auto Deploy remains OFF. Repository's sole tracked GitHub Actions workflow targets unrelated branches/paths and is a disposable rehearsal, not a deploy workflow.

Disk gate and bounded cleanup:

- Allowed backend worktree `/Users/Celebix/Documents/ChatGPT/atlas-orders-id-compat`; only `apps/customer-panel/.next/cache`, `apps/storefront-shared/.next/cache`, `apps/owner/.next/cache` removed.
- Parent paths and contents had no symlinks, tracked files or non-cache user artifacts. Contents were webpack packs, SWC cache directories, Next preview/RSC metadata and Owner TypeScript cache. No open cache files or server/build process working in that worktree was found; both task subagents were completed. Existing Next server belongs to Mira, whose output was not cleaned. Other task listing showed no active backend-worktree user.
- Allocated cache sizes before deletion: 884,600,832 / 292,483,072 / 329,719,808 bytes (total 1,506,803,712). These are **not** reclaimed-space claims.
- Free before deletion: **3,956,391,936 bytes**; immediately after: **3,956,248,576 bytes**. No measurable free-space gain; cause not established. No other paths were cleaned. Caches are reproducible by builds; no backup copy of those caches was kept.
- Latest post-merge sample: 3,914,362,880 bytes, below the **5,000,000,000-byte** heavy-operation gate. Full test/typecheck/build, disposable PostgreSQL and browser form validation are withheld; historical PASS results below do not apply to the new combined candidate.

Lightweight combined verification: six-file contracts/data/HTTP/client/component suite, `node --experimental-transform-types --test --test-concurrency=1` with `packages/saas-contracts/src/orders/{record-identity,orders}.test.ts`, `packages/saas-data/src/{orders,order-emails}/repository.test.ts`, `apps/customer-panel/lib/order-http/handler.test.ts`, `apps/customer-panel/lib/order-console.test.ts`: initial **114 PASS / 1 FAIL / 0 SKIP**, then **115 PASS / 0 FAIL / 0 SKIP** after the bounded test-only correction. The six legacy projection regressions pass. Failure: notification-failure compiled-component test accesses `window` through Mira's browser effect, but the inherited Node harness did not provide that browser boundary. The same targeted case reproduced RED, then passed after adding optional module-local window/document EventTargets; Node globals and production code are unchanged. Real compiled component/effects and notification rejection still execute, rendered detail assertions remain, and API-call sequence is also asserted. The full component test file passed 32/32. This is not browser-navigation coverage or live-runtime certification.

Independent source-only combined review (`id_compat_review`): Critical 0 / Important 0 integration findings, prior to execution exposing the harness issue. Scoped re-review of the correction: **Critical 0 / Important 0 / Minor 0**; real behavior assertions remain meaningful and no global leakage or production modification was introduced. This is not a full-validation or release-ready verdict. No migration is introduced by the integration. The previous staging deployment and actual HTTP 503 findings remain historical evidence; the same failing live order has not been retested with combined code. No LOCK GREEN or deployment-ready candidate is declared.

Pending continuation: obtain at least 5,000,000,000 available bytes without further unapproved cleanup; serial full contracts/data/Customer Panel and necessary consumers' checks, disposable PostgreSQL 14 scenarios, browser form 8 scenarios, typecheck/build and final diff-check; only then push the same Mira branch and update PR #75 with the exact validated head. Owner's two historically reproduced baseline failures and the existing Panel skip must stay explicit. Previous exact-SHA payment approval remains bound to 6a0d56, not this integration.

### Reference and deployment preparation — 2026-09-08 follow-up

The newly supplied [approved reference](mira-orders-v1/Celebix-Orders-Onayli-Referans.png) was opened and copied unchanged: 1536×1024, **1,516,948 bytes** (different from the stated 1,479,135 bytes), SHA-256 `2529e24391ba84573c37e11f9b4f6f006081c3333af61c60d44d478d80aaafd9`.

Reference comparison: graphite amounts, warm neutral surfaces, restrained orange and small paid-green indicators match the written direction. Desktop retains a compact table and a right inspector. Intentional differences: inspector is a read-only overlay with stacked sections rather than the reference's simultaneous two-column editing workspace; tablet uses prioritized cards; full detail retains existing authorized operations and canonical metadata. Long canonical numbers wrap/ellipsis rather than being replaced with invented short IDs. No mockup totals, numbered pagination, global counters, customer aggregates, product images or unsupported actions were fabricated. Mobile detail remains single-column. This is visual-direction comparison, not pixel-identical reproduction.

The inherited blue-gray shipping surface is neutralized using variables defined only by an Orders wrapper; shared shipping CSS retains every previous fallback outside that wrapper. Error and success rules and image/logo colors are untouched. A computed-style browser assertion reproduced RED (`rgb(250,251,252)` rather than the requested surface) before the fix. Full tests reran serially: 1318 PASS, 0 FAIL, 1 existing SKIP; typecheck PASS; production build PASS (80 pages); form regressions 8/8 PASS. Independent palette review: 0 Critical / 0 Important. Final visual run PASS: all 9 screenshots regenerated and opened, 3 viewport palette assertions PASS, overflow 0, console error/warning 0, unexpected 4xx/5xx 0; keyboard focus trap/Escape return PASS. Eight screenshots are byte-identical because layout is unchanged and the affected shipping section is below the narrow-view capture; the desktop detail screenshot visibly records the neutralized surface. These are fixture results, not authenticated QA.

This follow-up started with 14,769,964 KiB available; after build 13,430,408 KiB; after final visual run 13,366,564 KiB (about 13.69 GB). No cleanup was performed. Archive work was coordinated for serial heavy checks and notified after completion.

Visual harness timing correction: the search check formerly waited for a row already present before searching, then asserted row count before the async response completed. It now waits for the excluded order to disappear before asserting the same one-row result; assertions were not removed or weakened. One initial visual run timed out during fixture recompilation; it was not counted PASS.

Read-only Coolify preparation (no settings saved, no deployment):

| Field | Observed value |
| --- | --- |
| Application | `celebix-panel-staging-auth01` / `yk1h6d97z7ex0h74ok3zrj5c` |
| Repository/source | Public GitHub `Webintoshi/ecommerce.celebix` |
| Branch | `codex/design-tabs-save-fix-live` |
| Configured pin | `ad2c7d479457fcc2ad0595d32476efebab20fe6d` |
| Coolify Running commit | `ad2c7d479457fcc2ad0595d32476efebab20fe6d` (status health shown as unknown; no independent container inspection) |
| Latest successful deployment | `qcfhopp2125g0pnclb49h8qc`, 2026-09-07 19:41:03–19:43:50 UTC |
| Available rollback image | `ad2c7d479457fcc2ad0595d32476efebab20fe6d`, built 2026-09-07 19:43:43 UTC |
| Rollback source settings | Same repository, canonical branch and exact pin above |
| Proposed branch | `codex/mira-orders-v1`, exact pushed follow-up head (see PR #75) |

**Deployment blocker:** current pre-deployment commands include migration-capable scripts; post-deployment runs modular-homepage and order-address migration scripts. An ordinary Redeploy cannot be certified DB-mutation-free. Any temporary frontend-only deployment requires explicit approval for safely preserving and temporarily suppressing these hooks; do not execute them or assume idempotence means no writes. No secrets were opened or copied. No migration, hook, source, environment, Owner, Storefront or Worker setting was changed. Authenticated PR QA remains pending.

The 28 inventory rows below certify frontend preservation using the existing unit/contract suite and disposable browser fixture; they do **not** certify real provider operations or authenticated staging. No real customer mutations were performed. Missing authenticated evidence is not labeled PASS.

Browser plugin not available: regular Playwright uses a disposable Chrome profile and the repository's existing fixture at `http://127.0.0.1:3487`. The fixture renders the actual Orders components; only API responses are controlled QA data. No fixtures were added to production data paths.

- Full Customer Panel test: **1318 PASS, 0 FAIL, 1 SKIP** (1264 + 54 passed in the two script groups). The pre-existing price-list signed-out integration test is skipped by the suite. The earlier catalog socket failure did not recur; no tests were disabled to pass.
- Typecheck: PASS. Production build: PASS (80 static pages generated). `git diff --check`: PASS.
- Final browser form regression run: **8/8 PASS, 0 FAIL** after all production changes.
- Disk: continuation began with 8,695,616 KiB available (8.90 GB); post-build measurement was 6,607,288 KiB (6.77 GB); closeout measurement was 15,320,624 KiB (15.69 GB). Other activity changed free space; none of this difference is claimed as cleanup by this task. No files were cleaned. Archive transfer was explicitly paused for serial heavy verification and notified when verification finished.
- Browser form regressions: initial two data-loss cases reproduced RED, then fixed. Native Chrome Back/stay already passed; the uncancellable-navigation fallback lost the draft on Back/Forward and was reproduced separately. New drafts live only in tab memory and are restored only after an authorized detail read.
- A third independently discovered race (leave/return while a save is pending) reproduced RED, then passed after sharing pending-save state and reconciling completion with the active editor. No duplicate note submission is allowed while that request remains pending.
- Unsubmitted edits are compared with the exact submitted draft, not marked saved merely because an older request succeeded. Both note and shipping drafts survive errors/conflicts.
- Visual browser flow: **3 viewports, 9 screenshots, document overflow 0, console error/warning 0, unexpected HTTP 4xx/5xx 0**. Tests cover read-only inspection, Tab trap, Escape/focus return, delayed A→B response, search/sort, payment/delivery filters, columns, CSV, direct detail, print and previous/next.
- Inspection intentionally contains no editing forms. Closing it cannot discard an editor; full authorized operations remain on the canonical detail page, sharing the same detail presentation.
- Independent follow-up review: **0 Critical / 0 Important**, after closing all three form-lifecycle findings. Review is code review, not a separate live certification.
- No new dependencies, backend contracts, API handlers, SQL, `apps/admin`, auth policies or environment secrets changed.

### Screenshots (controlled fixture, not live)

| View | 1440×1000 | 1024×900 | 390×844 |
| --- | --- | --- | --- |
| List | [1440](mira-orders-v1/orders-list-1440.png) | [1024](mira-orders-v1/orders-list-1024.png) | [390](mira-orders-v1/orders-list-390.png) |
| Inspection | [1440](mira-orders-v1/orders-inspect-1440.png) | [1024](mira-orders-v1/orders-inspect-1024.png) | [390](mira-orders-v1/orders-inspect-390.png) |
| Full detail | [1440](mira-orders-v1/order-detail-1440.png) | [1024](mira-orders-v1/order-detail-1024.png) | [390](mira-orders-v1/order-detail-390.png) |

Reproduce with the existing fixture dev server on port 3487, then run `orders-regression.cjs` with `node --test` and `orders-visual.cjs` with `node` from `tests/saas-phase3/hemenaku-admin-presentation/`. Supply `PLAYWRIGHT_MODULE_PATH` for an existing Playwright installation and optionally `CHROME_BIN` and `ORDERS_QA_URL`; no dependency installation is required.

### Remaining evidence limitations

The reference is now available and compared above; the requested versioned baseline screenshot is still unavailable. Authenticated local preview, live staging and authenticated cross-module shell smoke were not run; fixture evidence is not substituted for them. The isolated shared shell fixture is not a complete authenticated application.

MIRA BACKEND REQUIREMENT
Bölüm: Detayda ek finansal ve müşteri bilgileri
Eksik yetenek/veri: Detail DTO does not expose payment method, paid/refunded amount, payment reference, billing address, product images, or promotion snapshot labels.
Mevcut endpoint’in sağladığı: Canonical order/payment status, item snapshots, subtotal/discount/shipping/total, contact, shipping address/tracking, events and notes.
Kullanıcıya etkisi: These extra details cannot be presented reliably.
Bu teslimattaki dürüst frontend davranışı: No inferred paid amount, current-catalog recalculation, fake invoice/customer action or promotion label is added.
Backend mutation: NONE

Primary task: scan orders, distinguish payment from fulfillment, inspect one order without losing list context.

## Function inventory before implementation

| Existing function | Authority | New location | Verification |
| --- | --- | --- | --- |
| Manual order | `/orders/drafts/new` | Shared header action | PASS — unit/contract |
| Search | `orderApi.listOrders(search)` | Search toolbar | PASS — unit + fixture browser |
| Order status | `listOrders(status)` | Status tabs/select | PASS — unit/contract |
| Sort | `listOrders(sort)` | Toolbar | PASS — unit + fixture browser |
| Date | `filterOrderListItems` loaded rows | Filter toolbar, explicit scope | PASS — unit/contract |
| Payment filter | Loaded rows/paymentStatus | Filter toolbar | PASS — unit + fixture browser |
| Delivery filter | Existing status-derived fulfillment | Filter toolbar | PASS — unit + fixture browser |
| Columns | `visibleColumns` | Columns disclosure | PASS — unit + fixture browser |
| CSV | `serializeOrderListCsv` visible loaded rows | Secondary export | PASS — unit + fixture browser |
| Date/customer/status/payment/items/channel/total | `OrderListItem` | Table/mobile cards | PASS — unit/contract |
| Detail link | `/orders/{id}` | Canonical number link | PASS — unit + fixture browser |
| Cursor pagination | `nextCursor`, append | Load more | PASS — unit/contract |
| Return to orders | `/orders` | Detail header | PASS — unit + fixture browser |
| Previous/next | `getOrderNeighbors` | Detail navigation | PASS — unit + fixture browser |
| Print | `/orders/{id}/print` | Detail header | PASS — unit + fixture browser |
| Number/dates/version/channel | `getOrder` | Detail header/metadata | PASS — unit + fixture browser |
| Contact | Order contact snapshot | Customer section | PASS — unit + fixture browser |
| Products/variant/SKU/quantity/prices | Immutable order items | First detail section | PASS — unit + fixture browser |
| Subtotal/discount/shipping/total | Canonical monetary fields | Product totals | PASS — unit + fixture browser |
| Address/tracking | Order shipping snapshot | Delivery section | PASS — unit + fixture browser |
| Status/payment transition | Existing capability and transition helpers | Operations | PASS — unit/contract |
| Shipment operations | `OrderShipmentConsole` | Delivery section | PASS — unit/contract |
| Manual shipping update | `orderApi.updateShipping` | Existing form | PASS — unit + fixture browser |
| Add/archive notes | Existing note clients | Notes | PASS — unit + fixture browser |
| Timeline | Canonical events | History | PASS — unit/contract |
| Notifications/retry | Existing delivery clients | Notifications | PASS — unit/contract |
| Loading/empty/error/retry | Existing client errors/state | Section-local states | PASS — unit/contract |
| Conflict/form reset | `executeOrderMutation`, success-only reset | Existing editor | PASS — unit + fixture browser |

## Contract gaps discovered

MIRA BACKEND REQUIREMENT
Bölüm: Liste filtreleri ve CSV
Eksik yetenek/veri: Tarih/ödeme/teslimat için tüm sonuçlara uygulanan sunucu filtresi ve toplam sayaç.
Mevcut endpoint’in sağladığı: pageSize, cursor, status, search, sort; items ve nextCursor.
Kullanıcıya etkisi: İkincil filtreler ve CSV yalnız yüklenen siparişleri kapsar.
Bu teslimattaki dürüst frontend davranışı: Kapsam metni, sayısız durum sekmeleri, mevcut cursor modeli.
Backend mutation: NONE

## Evidence

Approved reference is now accessible (see follow-up above). No authenticated PR preview has yet been established. Fixture evidence remains labeled separately from live QA.

Merge/deployment: prohibited for this task.

## Historical checkpoint — 2026-09-08 (superseded by current evidence above)

- Worktree: `/Users/Celebix/Documents/ChatGPT/mira-orders-v1`.
- Targeted Orders and open-canvas tests: 34/34 PASS (`node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/admin-open-canvas.test.ts`).
- Customer Panel typecheck: PASS. `git diff --check`: PASS.
- Full workspace test attempt: 1265 tests, 1262 passed, 2 failed, 1 skipped. The old blue-gray divider assertion was updated to the approved neutral border and passes in the targeted rerun. The catalog signed-out integration test failed with a closed local socket; exact-base comparison remains pending. No baseline exemption is claimed yet. The chained second test group did not run.
- Build has not run. Disk reported ENOSPC during fixture compilation and file writes, with approximately 125 MB free. The task's preview process was stopped; no user data was removed. Source file integrity and typecheck were checked afterward.
- Existing screenshots are disposable fixture evidence, not authenticated or live QA. Desktop inspector navigation, Escape/focus return, and list/detail document overflow at 1440/1024/390 passed in the first fixture run. Latest small source changes still require a fresh browser run.
- Pending: original reference image, before screenshot, expanded drawer race/filter/CSV/print/history/dirty/conflict browser scenarios, shell smoke, complete inventory certification, fresh full tests/build, independent review closeout, commit/push/PR.
- No commit, push, PR, merge or deployment has been performed for this task.
- Independent follow-up review: two Important findings remain open. (1) Navigation API traversal can be noncancelable, so the current guard does not establish browser Back/Forward dirty protection. (2) Editing note/shipping inputs during an outstanding save can cause subsequent unsent edits to be reset or marked clean. These require implementation and browser regression tests before readiness. Keyed detail mounting, owned-form-only tracking and post-close focus restoration address the other initial findings.
