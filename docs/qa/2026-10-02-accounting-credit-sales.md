# Accounting and POS credit sales acceptance — 2026-10-02

## Source and scope

Functional candidate: `9a09c12932e91840e9e308acafe3f50045ec010f`, shared branch `codex/shared-catalog-search`. Includes prior SQL199 reader repairs from `28ca9e4d`. Deployed panel baseline was `4a4cd613`.

Four accounting pages, retained business/invoice settings, POS V3 customer creation and partial/zero collection, later collections, immutable ledger, account movement, expense, card settlement, return credit and refund support are implemented. Cashier credit and subsequent collection grants default false. Existing V1/V2 replays and general order payment enums are preserved.

## Isolated verification

- Root integrated feature tests: **212 passed, zero failures**.
- Final UI/model/client suite: **106 passed, zero failures**.
- Affected existing order/detail/navigation fixtures: **106 passed**, actual merchant route matrix: **1 passed**.
- Runtime repository readiness and public contract surface: **27 passed**.
- Real PostgreSQL 16 ledger: **23 passed**; authority revocation races: **3 passed**, including confirmed lock-wait revocation.
- Real POS V1/V2/V3 driver and app-role repositories: passed. Includes historical replay, stock once, contact/pricing freeze, grants, cross-store isolation, archive protection, exact rollback/reapply.
- Original HTTP handlers → real app-role repositories → isolated PostgreSQL: **2 passed**. Covers 11,000/5,000/6,000, later 2,000 and 4,000 collections with preview versions and same-key replays, fully credit completion, stock once, and no provider attempts/storefront login creation. Only session resolution uses a synthetic fixture actor.
- Customer panel, contracts, data, owner and shared storefront typechecks passed. Local customer panel production build passed before the final small currency/focus UI fixes; latest panel typecheck passed after those fixes. Final candidate production build must also pass during rollout.
- Native Chrome fixture: five screens at **1440/1024/390**, 15 screenshots; zero page overflow, console or network errors. Dialog focus, Tab wrapping, Escape and focus restoration passed. This fixture uses real production components with mocked response data; it is rendered UI acceptance, not a claim that browser authentication uses the isolated database.
- Independent review closed all Critical/Important findings. Exact financial readiness probe validates 46 functions, 10 private tables, six columns, cashier default false, and rejects restricted-role grant/default drift.

## Broad suite limitation

The unmodified baseline first-stage panel suite has **47 preexisting failures and one skip**. Root compared an isolated archive of the exact unchanged baseline, repaired newly affected accounting/order fixtures, and verified the targeted suites above. The complete legacy panel suite is not claimed green.

## Publication controls

A private, validated pre-migration database backup was taken on the server. SQL200 and SQL201 up migrations and their assertions passed. Finance was kept disabled during data-first rollout. No production test sale, receipt, expense or refund was created.

Fresh official PayTR generator/check proof covers baseline and candidate, both dormant and approved test/live scenarios. Payment adapter source, canonical authorities, preview rows and encrypted environment configuration are preserved. Two storefront witnesses are read-only and remain outside the admin deployment targets.

An independent storefront publication had moved both images/pins to `926bbb571545cff52bba8d632601c325b05e106a`, branch `codex/guzide-deniz-live`. Exact source/runtime metadata and all seven checkout dependency files were checked. The checkout files are byte-identical to the prior witness. Failed snapshot guards made no changes; the witness baseline was refreshed before a successful private snapshot and rollback rehearsal.

Release kit: `.tmp/accounting-credit-sales/release`. Source cohort has 131 shipped source files and 11 source-only acceptance files, with exact committed-byte hashes, compiled route and client token checks. Helper fingerprint: `c23d06bc812f3a9c6f49c6126f107ededfc9c0cda601b6b877f56f80ba3b26a9`.

## Live completion

Completed NET→SITE at functional candidate `9a09c12932e91840e9e308acafe3f50045ec010f`.

- NET owned deployment: `hdkp0r5zirxzqdog3gphn0u1`, finished.
- SITE owned deployment: `cajeb8l2cva7rlfg7f9qg6qe`, finished.
- Both final images healthy; exact source/runtime/compiled payment authorities passed. Source cohort: **131 files, 21 compiled routes, one mandatory customer-client feature group** per image. The customer API compiles as base URL plus suffix, so the guard requires base, search/create methods, suffix and idempotency header together in the same chunk.
- Global deployment queue was idle and raw payment/configuration/preview preservation verified after both owned receipts finished.
- Release switch enabled once **after both compatible images and readers passed**, version 1→2. Subsequent read-only check confirmed enabled.
- **11 active stores**: actual app-role, read-only calls for overview, receivables, accounts and expenses all returned valid payloads; V3 POS bootstrap confirmed credit availability for each. This validation used actual active owner/admin authority tuples and did not create a session or financial record.
- Authenticated Chrome live summaries loaded without alerts: Butik Siora showed its existing POS history; Güzide showed the actual **10 TL WEB payment**. External navigation/closure interrupted additional browser-page traversal, so no complete four-page live Chrome traversal is claimed. All four screens had passed the isolated native browser matrix; their live readers and compiled routes passed above.
- Live events, receivables, operations and accounting accounts remained **zero** during acceptance. No production test financial writes, provider calls, stock mutations or fake receipts. Existing historical reporting is read from evidence, not fabricated ledger movements.
- Existing receipt/history data, provider approval profiles and storefront witnesses remain intact.

