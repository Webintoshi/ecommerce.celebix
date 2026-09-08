# Mira Orders V1

Base: `ad2c7d479457fcc2ad0595d32476efebab20fe6d`
Branch: `codex/mira-orders-v1`

## Current scope and evidence

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

The named approved reference image is unavailable, so exact image-to-image comparison and the requested baseline screenshot are not certified. The written approved visual rules were used. Authenticated local preview, live staging and authenticated cross-module shell smoke were not run; fixture evidence is not substituted for them. The isolated shared shell fixture is not a complete authenticated application.

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

Approved reference filename has not been located in supplied attachments; written approved layout remains available. Screenshot comparison to the original image is pending its availability. No authenticated preview has yet been established. Fixture evidence will be labeled separately from live QA.

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
