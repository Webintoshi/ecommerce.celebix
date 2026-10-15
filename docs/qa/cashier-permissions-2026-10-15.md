# Shared cashier access — 2026-10-15

## Scope

Cashiers can read analytics and create, edit, archive, restore and remove eligible products. General web-order, marketing, design, marketplace, configuration, import, moderation and accounting management actions remain outside the cashier role. Product edits still affect the shared store catalog. Existing inventory/history deletion guards are preserved.

The cashier menu contains Manual sale, Customer debts, Analytics when available under the plan, and Products (list/new/detail). Personal login security remains accessible. Storefront, notifications and assistant topbar utilities are omitted for cashiers. A server route allowlist uses the real proxy pathname, overwrites a caller-supplied pathname header, and redirects other cashier page requests to Manual sale. API and PostgreSQL action authority remains independent of menu visibility.

## Collection and Personnel

A collection-only Customer debts view reuses the existing CustomerCollectionForm: customer-wide FIFO debt allocation, server preview, original idempotency key and safe recovery. It does not load cash/bank balances or expose opening debt, refund, return, expense, reversal or account-management actions. Real received money is recorded; this feature does not charge a bank card.

Store owners open Settings → Personnel → cashier row → Sales permissions. Existing authenticated sales-grant endpoints manage enabled status, depots, discount cap, price editing, credit sales and collection. Existing saved flags are honored. A new version-zero grant initially selects collection; it still requires explicit Save and a sale depot. Unknown saves retain their exact key/body for explicit retry; Cancel/Escape remain usable when no write is in flight. Conflicts require an explicit reload and current-version adoption.

Native migration238 preserves tenant, active membership, package, resource and role checks while extending two authority functions. Its authorized backfill only changes false collection flags on enabled grants of active cashiers, increments version and retains private before/after snapshots. Disabled access, depot assignment and all transaction history remain unchanged. SQL up and assertions were applied atomically under the existing release lock; the local private receipt acknowledges COMMIT. Rollback refuses to overwrite later staff edits.

## Verification

- Disposable PostgreSQL:11/11 scenarios, including cashier product lifecycle, denial of ecommerce mutations, tenant isolation, grant backfill/defaults and guarded rollback.
- Contract/catalog focused tests:57/57.
- Personnel, grant UI and POS client focused tests:39/39.
- Accounting, menu, server page access, real proxy header and media lifecycle targeted tests passed; server page and cashier topbar tests4/4, media12/12, accounting20/20.
- Final Customer Panel production build completed successfully, including the final cashier-only topbar condition.
- Root inspected real component HTML/CSS in explicitly labeled local fixtures at1440,1024 and390px: no page-level horizontal overflow. The narrow dialog scrolls vertically on mobile; the Personnel row exposes Sales permissions. Interaction/cancel/conflict behavior is covered by the actual component tests.
- Final targeted acceptance command:104/104 passed.
- Independent source review found no confirmed P1/P2 blocker.

The broad Customer Panel test command was also attempted and exited1; it is not reported as green. Failures included `real TipTap AI apply and range rewrite are undoable, dirty, and save durable origins`, `core admin workspaces do not use decorative outer cards`, `detail form settings and analytics page frames stay open`, `abandoned cart recovery surface supports reopening and explicit copy`, `five typed storefront settings expose exact safe field contracts without secrets`, `tag and barcode consoles use fixed tenant-safe catalog surfaces`, `feed preview authorizes in PostgreSQL before network and returns only canonical products`, several catalog editor/brand tests and Qukasoft form tests. A separate focused command including the old panel parity manifest passed161/162; `every evidence reference names a real substantive production behavior test` still refers to the no-longer-existing app/settings/page.tsx route. These legacy/general failures were not rewritten to make this feature appear green. Logs are private local files in /tmp/celebix-cashier-*.log.

## Rollout evidence

Root owns publication. A new private release packet at `.tmp/cashier-access-release-20261015/` captures the post238 native baseline, preserves Owner/Storefront/payment/environment witnesses, pins the exact reviewed source and admits Panel NET before Panel SITE. Runtime proofs, stage acceptance and final receipts belong to that packet. No new account or real financial transaction is created merely for acceptance testing. Cashier interaction evidence uses explicitly labeled local fixtures; live owner sessions verify the deployed Personnel surface. Do not claim a real cashier WhatsApp login unless separately performed.
