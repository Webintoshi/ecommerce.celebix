# Lucky Wheel — QA and release summary

Date: 2026-10-10. Candidate: **`0619ec57182af92eb23bc80d6fc16e5896a37043`**. Review base: `e59336cd1`. Independent source review: **PASS; no unresolved critical or important finding**.

**Later UI follow-up:** explicit editor cancellation was corrected and published to both shared panels at `e2fbc9e204664e57997cc7854bd3368e2c803ea4`; see [cancel verification](lucky-wheel-cancel-2026-10-10.md). Owner/storefront readers and native226 remain as recorded below. The six-reader release statements in this report describe the original 05:19:32 UTC acceptance snapshot.

**Publication completed.** Native226 and all six shared readers are live at the exact candidate. Final verification at **2026-10-10 05:19:32 UTC** confirmed preserved configuration/environment/settings, six matching running images, an idle global queue, four distinct store mappings and zero sample wheel/consent records. Authenticated Güzide Chrome acceptance loaded the new list, studio, real source picker and inline source form. Live customer spin/redemption was deliberately not submitted.

## Delivered behavior

- Merchants manage `/discounts/lucky-wheel`, with direct Save, one enabled campaign per store, 4–8 real discount prizes, positive weights totaling 100%, stable issuance counters, configurable colors/contact/display/schedule settings, history and reporting. Existing legacy wheels and historical managed promotions remain read-only. The combined list accepts up to 80 native plus 200 legacy records.
- Visitors enter email or phone before spin, without membership or a cart. Marketing permission is optional and initially unchecked. Contact, award, code and quota commit together; the server chooses the result before animation. No automatic email, SMS, provider synchronization or account creation is added.
- The award is a real, single-use bearer coupon. Its frozen conditions and fixed expiry survive source edits/deletion and campaign pause/deletion. A shorter source deadline caps expiry. Explicit revocation is separate and preserves held/order evidence. Empty-cart awards retain their code for normal server quote validation after a product is added.
- Refresh/reopen recovers the committed result without another spin, including closed/exhausted campaigns, lost initial replies without an operation cookie, and a later participation whose old cookie still points to the previous award. Public display rules expose no unissued source code; award rules expose only the actual issued code. Ordinary authenticated batch-coupon rules remain intact.
- UI loads lazily, starts as a small launcher, excludes checkout/account/payment routes, shares the popup/cart modal coordinator, supports reduced motion and contrasting dark colors, and performs no polling.

## Review defects fixed

| Finding | Verified correction |
| --- | --- |
| Inline source activated an automatic global discount | Private unpredictable code-triggered source; automatic drafts rejected before HTTP. |
| Internal reward revisions consumed ordinary promotion quota | DB-proven managed rows excluded from ordinary publication count, overview and overlap scans; genuine ordinary cap retained. |
| New awards remained available without promotions entitlement | Durable entitlement gates display/new issuance; scoped result/replay remains available. |
| Closed/exhausted campaign hid issued awards | Independent lazy result-only recovery, with no new spin. |
| Contact-mode version change left an unusable form | Channel reconciled, incompatible contact cleared, compatible contact retained; changed consent wording resets consent. |
| Uncertain inline source draft disappeared after reload | Canonical payload, fingerprint and original operation persisted before HTTP; exact form/key/body restored. |
| Lost first response had no operation cookie | Latest host/store-scoped campaign+operation reference persisted before spin; visitor-authorized result lookup recovers it. |
| Old cookie masked a newer lost-response award | Compare operation IDs and prefer the verified newer result; retain the verified older award if newer lookup is missing/unavailable. |

## Test and build gates

| Scope | Final result |
| --- | --- |
| Full storefront suite | **1,127 passed**: 884 server + 243 browser; 0 failures. |
| Full shared contracts | **579 passed**, 0 failures. |
| Full shared data | **1,001 passed**, 0 failures; 4 existing skips (1,005 total). |
| Final admin Lucky Wheel suite | **29/29 passed**. |
| Promotion list/editor behavior | **18/18 passed**. |
| Independent final scoped verification | **84/84 passed**: storefront 37 + admin 29 + migration/contracts/repository 18. These overlap the broader suites. |
| Typechecks | Contracts, data, storefront, Customer Panel and owner passed. |
| Builds | Final storefront and integrated Customer Panel/owner builds passed. |

Neighbor admin tests: **148/151 passed**, with three unchanged source-string assertions failing. Isolated copies of base `e59336cd1` reproduced the identical failures (**7/10 passed**): obsolete separate-publish/editor-source expectations and dirty-guard source matching. They were not rewritten. The listed wheel gates pass; this is not a blanket claim that the entire admin or all-workspace test suite is green.

## Chrome and native acceptance

Real Google Chrome exercised controlled local fixtures at **1440, 1024 and 390 px**. All widths verified contact first, unchecked consent, one award across reopen, preserved form/save key, no runtime errors or horizontal overflow, and readable dark colors. Follow-up checks at all three widths verified lost initial reply + no operation cookie + null settings -> the same award with one spin, Tab wrapping and Escape restoring launcher focus. These are real-browser UI checks with controlled responses, separate from live storefront acceptance.

The isolated database `celebix_wheel226_20261010` passed native225 -> native226 up -> pre-use down -> up, exact restoration of six original function definitions/hashes/owners/ACLs, private grants and FORCE RLS. Native assertions passed atomic consent/no jobs, tenant/visitor isolation, immutable rules, earlier expiry, anonymous WEB evaluation, ordinary batch guest denial, reserve/replay/commit/release, source/campaign deletion, single use and full-refund reporting.

Real overlapping transactions, with observed lock waits, proved: same visitor/different operations -> one award; last quota -> one award; same code -> one hold; release restores eligibility; save versus old-version spin -> version conflict; rollback after use is refused. Quota acceptance created **102 internal reward rows** and still allowed ordinary activation; **100 ordinary active rows** still blocked another. Entitlement/public-projection assertions passed. Controlled assertion fixtures roll back; race fixtures remain only in the explicit isolated database.

## Release state and operating limits

All runtime receipts were collected and rechecked by the release owner. Anonymous panel checks prove login reachability and exact API 401 denial; authenticated Güzide UI acceptance is recorded separately.

| Step | Deployment | Accepted at (UTC) |
| --- | --- | --- |
| Native226 + final read-only probe | PASS; applied 04:48:29 | 05:19:32 |
| OWNER NET | `wheel1d6aaffcfe291a255036` | 04:53:08 |
| OWNER SITE | `wheel6f6b5fde47f56c0eb387` | 04:58:37 |
| STOREFRONT NET | `wheela2b62ed6c098c5259b94` | 05:02:11 |
| STOREFRONT SITE | `wheelb2d49018c39f243349a0` | 05:05:36 |
| PANEL NET | `wheel266cba4a12ce6223f634` | 05:11:22 |
| PANEL SITE | `wheela0b0a35a7954a62f4f69` | 05:17:09 |

The rollout order was OWNER NET → OWNER SITE → STOREFRONT NET → STOREFRONT SITE → CUSTOMER PANEL NET → CUSTOMER PANEL SITE, with each acceptance gating the next publication. All six running images carry the candidate, and all six acceptance receipts record their BUILD_ID. The four admin/storefront receipts explicitly confirm required wheel-route presence; manifest hashes were not recorded. HTTPS checks cover both owner hosts, all six storefront aliases and all eight admin aliases. All four distinct stores have disabled/null public settings. No visitor cookie is issued for disabled settings.

The authenticated Güzide source picker loaded normally and reported no eligible existing discount. Its new-source form exposes percentage, fixed amount and free shipping; no source or campaign was saved. The six-prize editor totals 100%, all five studio tabs and four color controls are present, and the contact-first/unchecked-consent preview is readable. Captured Chrome logs contained 481 historical entries, all before 04:49:10, and zero entries after the 05:17 release acceptance cutoff. Raw authenticated HTTP statuses were not captured; this is client acceptance, not an inferred wire-level assertion.

Two guarded release-tool issues stopped progression before a subsequent application mutation: PDO returned the previous application ID as a string, and a copied private acceptance receipt was root-owned and unreadable by the release process. Two exact canonical ID comparisons were independently reviewed, and receipt ownership was corrected while retaining mode 0600. The reseal preserved the original seal, snapshot and queue state; no queue was duplicated or application security setting relaxed. Final kit hash: `b9335fbc9a37b0c938583f2b19f19070e34649499484c9fe668c7082c2e51d09`.

The full pre-native226 backup was verified at 175,622,363 bytes; SHA256 `eeb1e878a5736e167795ca1cff20106b4674786f84f7c01f2521460185652dfd`. It and the full private configuration snapshot remain on the server; their contents are not part of tracked QA evidence.

- **Rollback:** down is pre-use only. It refuses after any native campaign, award or wheel-consent use, and on function/ACL drift. After use, close new participation and retain compatible readers/evaluators and checkout/order completion paths for issued coupons; do not remove native226 or revert to readers that cannot honor those codes.
- **Entitlement:** removing promotions hides the wheel and blocks new awards. Old result/replay remains readable, but actual redemption still needs the existing promotions entitlement: quote skips promotions and native reserve returns `feature_unavailable` while it is absent.
- **Identity:** repeat limits apply to this browser's secure visitor credential, not a verified person. Clearing browser state or using another browser may allow a new participation. The coupon itself is a bearer code usable across devices; its first valid redemption consumes the right.
- **Reporting:** completed, noncancelled/nonrefunded TRY coupon orders supply financial totals. Full refund removes financial totals without restoring coupon use; partial refunds are not claimed as net revenue.

## Saved evidence

- [Final six-reader/database/configuration verification](evidence/lucky-wheel/final-verification.json).
- [Live native226 application receipt](evidence/lucky-wheel/live-native226-receipt.json), with applied timestamp and source SHA256.
- Six `accept-*.json` files in [the evidence directory](evidence/lucky-wheel/), each with candidate image identity, BUILD_ID and approved-alias HTTPS results; the four admin/storefront receipts also record wheel-route presence.
- [Authenticated Güzide UI acceptance](evidence/lucky-wheel/authenticated-ui.json) and [studio screenshot](evidence/lucky-wheel/authenticated-studio.jpg).
- [Browser acceptance](evidence/lucky-wheel/browser-evidence.json), [recovery and keyboard acceptance](evidence/lucky-wheel/browser-recovery-keyboard.json), [isolated races](evidence/lucky-wheel/isolated-race-receipt.json), [test summary](evidence/lucky-wheel/test-summary.json).

Detailed test/build/review logs remain under `.superpowers/sdd/2026-10-10-lucky-wheel`; controlled-browser screenshots remain under `/tmp/celebix-wheel-visual-20261010`. Worker reports describe their completed source/test stage. Their earlier “no live changes” statements are historical worker scope; the timestamped final receipts describe the later authorized production rollout.

Live acceptance created no campaign, contact, consent, customer, coupon, order or payment sample. It verifies publication, isolation/configuration/readiness, disabled public endpoints and authenticated merchant UI; functional participation and checkout transaction proofs are the controlled browser and isolated SQL gates above.
