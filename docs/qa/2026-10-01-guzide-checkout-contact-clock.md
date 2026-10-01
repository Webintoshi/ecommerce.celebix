# Güzide standard checkout: customer state, authority clock and inventory holds

## Report and confirmed causes

The customer saw `Sipariş özeti alınamadı. Lütfen sepetinizi kontrol edin.`
after submitting the card payment method. The quote and cart summary had
already succeeded; the error came from hosted payment start.

1. The exact submitted email and phone belonged to the customer's archived
   Güzide customer record. Customer preparation correctly rejected it before
   provider access. The customer explicitly authorized restoration. A guarded,
   idempotent transaction restored only that customer (version 7 → 8), recorded
   the customer operation and preserved history. No unexpired credential existed
   before restoration. No automatic restoration or identity relaxation was added.
2. After restoration, live logs reported
   `credential_persistence_missing durable_authority_invalid`. Initial authority
   evaluation used the standard checkout clock, but durable begin used the later
   payment adapter clock. The promotion evaluator includes `storeLocalTime` in
   its authority digest even when no promotion is applied.
3. A browser retry on the deployed clock fix exposed an independent inventory
   admission failure. The actual displayed cart totals 3,179,700 cents. Its
   single variant has tracked quantity 1 and public available stock 1, but the
   shared inventory view counted three held reservations whose hosted sessions
   expired in August. This view feeds both admission and stock mutation guards.
   Their attempts remain `awaiting_customer`; no terminal provider outcome has
   been proved, so neither attempts nor raw reservations may be silently
   terminalized. The fix must align effective online holds with the existing
   public stock lifecycle/expiry policy and retain active POS holds.

## Live database proof before release

Live projections with identical input and one transaction snapshot showed:

| Clock comparison | Evaluator/authority digests | Commerce facts |
|---|---|---|
| t / t | Equal | Equal |
| t / t + 1 ms | Different | Equal |
| t / t + 1 second | Different | Equal |

For the isolated diagnostic cart, under the real host resolver role,
`authorityV3` returned `found`. Passing that
same authority to `beginV3` returned `created` at +0 ms, and
`durable_authority_invalid` at +1 ms / +1 second. Every probe ended in
`ROLLBACK`; no provider call or payment took place.

The two carts matching the browser's 3,179,700-cent total still returned
`durable_authority_invalid` with an identical authority/begin clock because
the inventory admission trigger rejected the stale held quantity. This
distinguishes the clock regression proof from actual browser acceptance.

## Change and verification

- Scoped durable begin now clones the prepared request clock. SQL still
  recomputes and locks the live source, customer, variants, prices and authority.
- A trusted elapsed-time gate rejects invalid/negative or ≥15-minute authority
  age before durable begin/provider dispatch.
- Presentation persistence and recovery still use fresh time. The original
  presentation/hold expiry is not extended.
- Exact public `invalid_input` is preserved. Hosted start failures no longer
  masquerade as an unavailable order summary. Private diagnostic codes remain
  hidden; fields, quote and retry operation remain intact.
- The regression failed before the clock fix and passed afterward.
- 43 focused hosted runtime/client/summary tests and 8 checkout interaction tests
  passed. Storefront typecheck and production build passed. Independent code
  review passed; diff check passed.

## Inventory correction (SQL189)

- `all_inventory_reservations` includes an online held row only while its
  existing legacy, quick-order bridge or standard hosted parent is active and
  unexpired. It retains active POS holds and non-held history. This aligns the
  13 shared inventory consumers with public stock availability.
- Both legacy and promotion-aware hosted settlement prechecks subtract other
  effective online/POS holds. They retain raw own-reservation checks and locks.
  A late captured payment with unavailable stock follows the existing
  `captured_stock_conflict` branch instead of aborting on the stock guard.
- UP/DOWN guard exact definition hashes, single replacement anchors and
  unchanged view/function metadata, owner, ACL, columns, options and RLS.
  No raw payment, reservation or session rows are updated by this migration.
- Isolated PostgreSQL 16 proof passed **10/10**: admission and both actual
  settlement routines fail before the patch, pass afterward, fail after DOWN,
  and pass on reapplication. Tests cover active online/POS protection, stock
  decrement, late capture conflict, no order creation and unchanged durable
  financial attempts. Fixtures and temporary attempt tables are rolled back.
- The clone installs migrations through 160 and SQL161's actual allocator and
  hash-checked hosted predecessor patches. SQL161's unrelated live-only legacy
  routine is absent from repository bootstrap, so its patch manifest is
  explicitly excluded; no substitute routine is invented.
- Admin production build passed using webpack and non-live public build
  placeholders. This avoids the local worktree's Turbopack dependency resolution
  issue; no admin configuration was changed.

## Release

Source: `3e21cc1051836d1e17d7c1143b5c3a64ebda7b26`, branch
`codex/paytr-runtime-hotfix`. It includes live common release `776bfa368a2b32eb8cbf83ff8167e286af58c83d`.

Guarded NET → SITE release preserves unrelated encrypted configuration, preview
rows, PayTR approvals and modes. Fresh private snapshot:
`/tmp/celebix-checkout-clock-20261001/snapshot.json` inside Coolify.

Both deployment targets finished and guarded verification reported the expected
source and an idle global queue. Browser retry exposed cause 3 above.

SQL189 was first applied inside a live rollback-only transaction, proving the
exact live predecessor guards. Its committed application compared all three
expired reservation/attempt/session graphs before and after and confirmed they
were unchanged. Final view digest:
`22507ced2df83d396c8acf68b978aec39af1e62ae2fe6ff22ca58b60d253c6d3`.

Before browser dispatch, both original 3,179,700-cent carts returned authority
`found` and durable begin `created` under the host resolver role. Each successful
begin was rolled back; these probes never dispatched to PayTR.

## Live browser acceptance

The retained real Güzide checkout form was submitted once after SQL189. It
opened the real PayTR iframe with empty card fields and the exact amount
**31.797,00 TL**. Proof is saved privately at
`.tmp/paytr-runtime-hotfix/guzide-actual-checkout-31797.png`.

No card information was entered and `Ödeme Yap` was not pressed. The matching
customer remained active and had zero orders. The payment preparation is a
normal temporary inventory hold; acceptance does not claim a completed charge
or real payment callback settlement.

Read-only postflight confirmed source version 13, session `provider_ready`,
attempt `awaiting_customer`, environment `live`, provider reference present,
3,179,700 minor TRY, one held unit and unchanged catalog stock quantity 1.
