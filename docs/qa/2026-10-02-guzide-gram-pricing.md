# Güzide gram pricing correction — 2026-10-02

## Authorized scope

Merchant supplied **6600 TL/g** and selected all Güzide products with a valid native gram value. Products without native variant weight retain fixed prices. The formula is direct grams × the merchant reference; it does not infer purity, market rates or labor.

## Root causes and correction

The first reference-set save returned `isActive: null` when no active set existed. Strict repository output validation rejected that payload before COMMIT and rolled back the draft. Draft history had the same nullable comparison. SQL198 returns explicit false in both projections. The actual 6600 first draft was saved through the live admin after correction.

Native variant measurement weights were not pricing policies. An explicit settings choice now previews and atomically adopts eligible fixed TRY variants into the existing reference engine. Existing dynamic policies, fixed price-list precedence and historical financial snapshots are preserved. The variant editor prefills an empty gram field from its native weight. Turkish grouped numbers and unambiguous dot/comma decimals are accepted.

Functional candidate: `709fd01d497452f407f22deab721b878062b6271`.

## Verification before rollout

- 46 focused unit and mounted behavior tests passed; customer panel and saas-data type checks passed.
- Shared customer panel and storefront builds passed.
- Disposable PostgreSQL native adoption, original engine (27 scenarios), activation gate and V3 checkout/cutover harnesses passed. Native coverage includes first-save/list/get real payload validation, gram/kg conversion, rounding, complete 1127-variant pagination, stale weight/list/reference/version protection, tenant/role denial, replay, late failure atomic rollback, historical prices/stock/piece units and repeated migration owner/ACL preservation.
- Local native 6600 preview: 163 ms; activation: 300 ms for 1127 variants. These are isolated test timings, not production benchmarks.
- Live preview: 1106 products, 1127 variants, zero unavailable prices and zero fixed-list overrides. Sample KLY-780: 6.50 g × 6600 = 42900 TL.
- Fresh seven-consumer inventory proved no active V2 checkout app calls. Both current storefronts use the compatible V3 reader. Only the four external host-resolver V2 EXECUTE grants were retired; owner internal delegation and V3 grants remain. Güzide capability was enabled without weakening its original guard.
- SQL198 owner/search-path/security/ACLs and exact committed function bodies passed through both live panel runtimes. Existing payment profile metadata remains unchanged.

Private operation/source backup: `/var/backups/celebix/guzide-gram-pricing-20261002`; local private verification receipts: `.tmp/gram-pricing-fix/`. No credentials are included in this document.

## Live acceptance

- Shared NET deployment `kh18o6u4evwpbaxi2tjfdxn3` and SITE deployment `j12q1fkcgqpik8h2mzfxurot` finished healthy at exact functional candidate `709fd01d497452f407f22deab721b878062b6271`.
- Each runtime passed 111 exact production source hashes, 14 compiled routes and three mandatory client tokens. Two committed PostgreSQL harnesses are source-only evidence because Nixpacks explicitly omits root tests; their committed/local hashes remain required. The Turkish label's literal or exact SWC Latin-1 hexadecimal encoding is verified without dropping its semantic token.
- Final release verification passed at 15:57 UTC: global idle, both panels, official payment proofs/profile authorities, exact preserved raw configuration and both independent `00fc6a88` storefront witnesses. Later independent storefront deployments are outside this closed release.
- The merchant's existing first 6600 draft was opened through the newly deployed live admin, native grams selected, preview verified (1106/1127, zero unavailable/override), and v1 activated through its normal confirmation. No duplicate draft was created.
- A read-only live SQL acceptance at 15:59:58 UTC passed all 1127 current native policies and 1106 products. Every canonical and actual storefront price equals rounded native grams × 6600 TL/g, with zero policy/price mismatches and zero list overrides.
- Real Chrome product HTML visibly showed KLY-780 at **42900 TL**, with its 6.50 gram description. A separate in-app browser session started with an empty cart, added this one item, observed cart and checkout summary **42900 TL** and the successful quote status `Sipariş özeti güncel.`, then removed the line and confirmed an empty cart. No contact submission, order completion, payment initiation or provider call occurred. The Chrome user's cart was untouched.
- The isolated HTTP script was blocked on its first product GET by Cloudflare 403, before any cart request. It was not used as a passing proof and no security configuration was changed; acceptance continued through the real browser.
- Güzide's 1216 variant native-field checksum is unchanged (only intended pricing policy/version state changed). The native 1127-variant stock/piece checksum is unchanged and all remain piece-based with total stock 1127. Whole-database checksums are **not** an unchanged-data claim: the interval includes 12 additional other-tenant variants and changes in five of 18 financial/inventory tables; the other 13 table hashes remain exact. Read-only attribution assigns all 12 extra variants and 23 inventory movements to another tenant (12 opening, 11 catalog adjustments). Payment drift is the existing Güzide reconciliation cycle (1852 claim/finalize pairs, with matching events) that began before activation and continued afterward; payment attempt count stays 82, and 44 existing Güzide attempts remain provider_outcome_unknown. No claim is made that these ongoing payment logs were unchanged. All order/item and reservation snapshots retain their original whole-table hashes. This background reconciliation is separate from the pricing release.
- Private evidence: `activation-acceptance.json`, `public-browser-acceptance.json`, `protected-comparison.json`, `protected-delta-diagnosis.json`, `release/cohort-all.json`, `release/final-verify.log`, `live-active-settings.png`, `live-checkout-price.png` under `.tmp/gram-pricing-fix/`.

## Merchant use

At Settings → Pricing, edit the manual gram reference and save a draft; preview it, then confirm/apply. Already adopted variants keep their gram formula for later rate updates. The native-grams option only adopts eligible fixed variants and leaves existing dynamic methods intact. Products without a native gram value keep their fixed pricing.
