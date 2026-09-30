# Approved POS price and payment implementation

User approved the in-chat plan: /orders/quick-links per-sale unit price editing, mandatory card/cash choice, employee price permission, combined catalog-based discount limit, immutable prepared payment, compatibility and two-panel live rollout. No POS integration/split payment/change calculation.

## Baseline and ownership
- Working checkout seo-tools, branch codex/pos-price-payments. Baseline e957d427a61269cac8f941d3196be63bd93998b2 preserves live d38a5466 collections and SEO96cf documentation.
- Data task owns in-store contracts/data/SQL and native tests.
- UI task owns InStoreSalesConsole.tsx, its CSS and mounted tests.
- Order task owns order detail projection/contract/client/view and tests; coordinate with data for payment metadata.
- Root owns in-store HTTP/session runtime registration, browser client/controller/recovery and integration/release.

## Required behavior
- Positive override in cents; null means catalog price. Snapshot catalog price/applied price/actor. Same variant quantity/scan/hold/reload preserves override; complete removal resets it on re-add.
- Payment method card/cash/null persists in draft. No default, mandatory before prepare. Freeze with prepared price; legacy pending may choose once before confirm; paid/completed immutable. Old completed methods stay unknown/legacy POS.
- Price permission owner/admin default true, cashier default false and staff configurable.
- Reductions=sum(max(0,catalogUnitPrice-appliedUnitPrice)*quantity). Additional cart discount plus reductions <= floor(catalog eligible subtotal*discountLimitBps/10000). Price increases cannot enlarge budget; ineligible product cannot be reduced.
- Server authority/current prices/stock/version/idempotency remain authoritative. Preserve POS numbering and one stock movement.
- Version2 is selected by X-Celebix-In-Store-Version:2. Version1 response bodies/fingerprints remain exact; old clients cannot overwrite v2 sales. Additive SQL/readers first, new panels second.

## Verification and release
- Meaningful RED/GREEN tests for price, permissions/budget, input, scan/quantity/persistence, both methods, freeze/recovery, native authority/replay/stock, legacy records/operations.
- One focused whole-change review and repair. Panel typecheck/build; native PostgreSQL test and shared contract gates. Browser desktop/mobile/keyboard; safe live draft save/restore rather than an unauthorized financial transaction.
- Fresh read-only live state/snapshot/source-bound binding, private checksum/backup migration. Shared deployment lock and sequential NET/SITE admin queues. No unrelated config/preview/payment authority changes. Coordinate with Mira before queue.

## Progress
- Latest shared baseline merged without conflicts. No original-workspace source edits.

- Implementation complete across shared contracts, repository, controller/client, versioned HTTP, mounted console and order detail. Native price dialog and neutral badges preserve existing layout; selecting the chosen draft method again clears it.
- Root focused integration:233/233 pass; mounted19/19 pass; panel typecheck and final production build pass. Data focused18/18 and data typecheck pass. Native PostgreSQL repository/SQL authority, both methods, legacy operations, permissions, combined budget, repricing, exact one stock movement and POS161 allocator pass.
- Read-only review found and repaired two server issues with native regressions: clearing an override after revoked price permission, and V1 actionable readers exposing V2 cash sales. V1 current readers now request upgrade; historical operation bodies remain exact.
- Root reviewed migration bundle dry-run passed on disposable clone; before/after hashes verify existing sales/grants/attestations/operations, prices, orders and inventory are unchanged. Down restores all six saved predecessor function definitions exactly; refuses durable V2 data.
- Existing broad-suite baseline failures remain outside this change: collections runtime-export test snapshot, section-homepage footer fixture, Mira visual/source assertions; older POS tombstone fixture also fails with184removed. No unrelated production edits made for them.
- Mira confirmed no newer common source commit or queued release. Both live admins currentlyd38a5466; final source preserves it. Publication uses fresh private snapshot and shared guarded queue.

- SQL184 applied with verified fresh backup and unchanged protected data digests. First release407f20f59f63420c076517b90703179d0eef7b31 finished on NET kkr8u8f3he3ja6dxr568g2bm and SITE fbrepu6odl0obzy8h29yfgrn. Live Güzide draft override19260.89 +cash survived reload; original catalog19260.00 unchanged. Testing only a draft, no financial completion.
- Final live copy review repaired the required visible label to “Satışa özel fiyat” (old “Fiyat değiştirildi”); mounted assertion RED→GREEN19/19. Small frontend followup will use fresh guarded source snapshot; SQL184 remains unchanged.
