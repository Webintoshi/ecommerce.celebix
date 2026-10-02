# Güzide real-user PayTR checkout — 2 October 2026

## Scope and evidence

The user requested a real normal Chrome checkout of Güzide's Test product, quantity one, 10.00 TRY. Customer contact/address details and the card were supplied by the user. No card data or private customer contact data is included in this record. No card data was entered by the agent.

The authorized PayTR payment button was clicked once. Chrome then displayed a blocked frame. Its actual Console reported that framing `https://inbound.apigateway.vakifbank.com.tr` violated the merchant policy `frame-src https://www.paytr.com`. This is an observed bank ACS navigation, not an inferred provider error.

## Bank frame correction

Commit `ebdd5dad561dd9ce6f74570da44ce6236fae9628` adds a bounded shared payment-frame policy: exact PayTR origin, observed exact Vakifbank HTTPS origin, and the verified merchant's `/odeme/hizli/sonuc` return path. Existing Iyzico origins retain only their original origin permission. Invalid provider origins and unsafe merchant names fail closed. The return bridge's authentication and nonce policy remain intact.

Verification: RED observed, then 44/44 relevant tests; shared storefront typecheck, production build and independent security review passed. Both shared storefront deployments finished:

- NET: `z565qqs24w7w8nbhvviido2c`
- SITE: `q14b3uqzpjb4jqh325yrmcar`

Post-release private snapshot verification reported global idle, exact commit and preserved configuration. Running image/source/manifest/generated artifacts were independently verified. NET remains noApproval; SITE canonical TEST/LIVE execution identities and database authority match their prior approved identities.

## Current payment evidence

The bank ACS page did not complete. The user reported that no transaction appeared in the card activity. This alone is not used to declare a payment failed.

The submitted attempt expired its local presentation/hold while investigation continued. It was moved to `provider_outcome_unknown` using the existing durable operation, exact store/attempt/session/cart/version/credential/amount/real-expiry checks and a successful rollback rehearsal. The approved LIVE reconciliation runtime queried only this submitted attempt and returned `processing`. No callback or paid order was synthesized; no payment cancellation or second card submission was made.

The merchant PayTR panel confirms its callback URL is `https://guzidekuyumcu.com/api/payments/paytr/callback`. It reports actual callback delivery failures: HTTP 400 / INVALID, with automatic retries. The panel's payment status is `-`; this is not interpreted as a successful or failed payment. The binding, LIVE amount and approved database execution authority were found and matched in a read-only check.

## Callback investigation

The existing generic callback outcome diagnostic recorded success callbacks only, leaving failed callback rejection opaque. Finite diagnostic classes are added for status, total amount shape, payment context presence, payment type, test mode and generic outcome. They contain no raw amount, provider ID, hash, reason message, card data, headers or credential. Authentication and HTTP behavior are unchanged; diagnostic exceptions cannot alter acknowledgement.

Verification: RED observed, then 42/42 relevant callback tests and typecheck passed. Genuine fixture signatures preserve failed → OK and wrong hash → INVALID with logging absent, active or throwing. Adapter source and execution manifest are unchanged.

Diagnostic release `519ea523d9e9e8b8ef47390ef37038cb0d165e54` also preserves the concurrent Siora UI release. SITE deployment `wvi8blfnl4qcse903is5a8ve` and NET deployment `yze52ec74yfskmn2li9pw8fy` finished. Final global-idle, exact running image/source/manifest/generated-artifact/approval and SITE database-authority checks passed.

The new SITE container observed genuine automatic callbacks at 21:21:07Z and 21:21:08Z, both `failed / zero / absent payment context / card / absent test mode`, followed by rejection. The submitted test's PayTR detail continues to show minute-by-minute automatic retries and HTTP 400 / INVALID. Diagnostics intentionally omit the provider reference; individual audit lines are not claimed to identify that test by themselves. Inspection confirms the adapter's positive-only total-amount parser rejects a signed failed callback with zero before verifying its hash. A narrow failure-only correction is being tested; successful payments must still have a positive amount and every callback must still pass signature and authority checks.

## Signed zero-total failure correction

Only the exact raw total `"0"` with status `failed` is added to amount parsing. HMAC verification, canonical fields, bounded values, environment, positive expected amount and currency checks remain enforced. Failure settlement cannot create a paid order or consume stock; successful zero/underpaid callbacks remain rejected. Failed callbacks with additional payment context are outside this observed correction and were not broadened.

RED reproduced the signed failed-zero rejection. Adapter/config tests passed 26/26; relevant generic runtime/route/preflight tests passed 83/83; build-binding/generator tests passed 18/18 after their observed RED. Typechecks, production shared-storefront build and independent code/security reviews passed.

The independently hashed new six-file execution manifest is `sha256:ed6671e40af5116572449b29f759b79de431550173a7afccf0149566e6b15d2b`. Its adapter diff is exactly the narrow guard correction; reviewed diff SHA256 is `492833b0e1da3780098eb17802a5f27c90723adff66236821ef3dfacc7c7e0c5`. The explicit reviewed compatibility mapping preserves prior per-environment canonical execution identities, while candidate metadata records the actual new source and Git SHA. Unknown source manifests, forged metadata, mismatched environments and missing approvals still fail closed. This is a source transition and is not described as an unchanged source.

Release `b73fc7435c5b897c617649fc2fcf477289b27d41` finished on SITE `at5ra92vf5jo2zde2m9syucj` and NET `e8jo659rdzjp53d0s1en05hi`. Both actual healthy running images/source manifests/generated artifacts/approval profiles and SITE database authority passed final read-only verification; global deployment queue was idle.

At 21:43:08.098Z the submitted test acquired a genuine authenticated `failed` callback observation, proving the adapter correction works for that exact attempt. Its existing unknown-state lifecycle deliberately recorded the observation and returned processing rather than terminal settlement. The verified immutable failure observation was then used for one guarded reconciliation through existing authority-bound claim/finalize functions. Exact versions, credentials, LIVE 1000 TRY, canonical authority, observation and operation fingerprints, inventory and absent conflicting outcomes were checked. Independent SQL review and rollback rehearsal passed; the exact guarded transaction was committed once. Post-read confirmed failed attempt v7 / failed terminal session v4, own reservation released, physical stock unchanged at 2, and no order. No provider call, synthetic callback, direct status update, cancellation or capture was performed.

## Historical processing acknowledgement

The old callback operation's immutable snapshot remains unknown even after reconciliation. Replaying it previously returned RETRY forever. The runtime correction acknowledges only a replayed historical processing result when current durable authority is already failed and fresh callback verification independently confirms failed with the same non-null provider reference and expected amount/currency. Unknown, captured, contradictory, malformed and invalidly signed results remain excluded. It changes neither settlement nor inventory.

The real replay scenario reproduced RED; relevant runtime/PayTR route/adapter tests passed 94/94 and storefront typecheck passed. Production shared-storefront build and independent review passed. Adapter execution manifest and generator are unchanged from b73.

Release `370f340bfa87822357fce8746ca4c8c2c77ecd7a` finished on SITE `krnj2cnpu9tswu4czkmyrbi5` and NET `e8jcw9gubtjajdf2yh9foc8e`. The first NET queue request stopped before insertion while SITE's recorded application status was still updating; read-only status confirmed healthy running state before the one actual NET queue. Final global-idle, raw-configuration, exact healthy images/source/generated artifacts/approval and SITE database-authority checks passed. The exact submitted test's PayTR panel now shows notification status `Tamamlandı`, with no HTTP INVALID/RETRY error; this is successful delivery of its failed-payment result, not a successful payment.

## New normal Chrome attempt

After verified failure recovery, the user-supplied customer details were entered again in normal Chrome. A new LIVE 1000 TRY provider-ready session was created at 21:53:48Z, with a 15-minute local hold. PayTR displayed a blank card form and 10.00 TL total. The user is being asked to re-enter the card; card input values were not read. Screenshot is private under `.tmp/paytr-real-checkout-20261001/paytr-new-normal-chrome-20261002.png`.

Final scoped read-only verification still reports awaiting-customer attempt v2 / provider-ready session v2, no callback/receipt/order, one own hold and unchanged physical stock 2. The new card/payment button has not been submitted by the agent. A real successful bank authentication, paid order and exactly-once stock decrease remain pending human card entry and bank verification.

## Acceptance still pending

A successful real bank authentication, genuine successful provider callback, paid WEB order, 10.00 TRY total and exactly-once inventory effect have not yet been verified. The original unknown outcome was resolved using its authenticated failed callback before the new card form was prepared. The new attempt awaits human card entry and bank authentication. Evidence screenshots and reviewed operational scripts are private under `.tmp/paytr-real-checkout-20261001/`.

## Follow-up BKM bank authentication block

The 21:53Z card screen expired while the user could not open it. The user explicitly confirmed that this new screen was never submitted. The exact expired attempt/session was closed once through the existing durable cancellation function after an exact-version/credential/cart/customer/amount/authority/event/reservation guard and successful ROLLBACK rehearsal. Physical Test stock and version remained unchanged, no callback or order existed, and only its own reservation was released.

A fresh normal Chrome LIVE 10.00 TRY session was then prepared at 22:37:46Z. The user entered their card and submitted payment themselves at approximately 22:38:20Z. No card values were read or captured by the agent. PayTR recorded this exact 10.00 TRY transaction, with card bank Yapi Kredi and pending status. Its provider token subsequently became invalid, which is not treated as an authoritative failed payment.

The original error tab was restored through Chrome's visible Recently Closed menu. Its actual Console proves: `Framing 'https://goguvenliodeme.bkm.com.tr/' violates ... frame-src https://www.paytr.com https://inbound.apigateway.vakifbank.com.tr https://guzidekuyumcu.com/odeme/hizli/sonuc`. This is a second observed ACS destination; the earlier Vakifbank correction did not cover it. PayTR settings independently confirm the correct site and callback URLs and enabled live mode; its API warnings list for October 2 has no entries.

The shared frame policy adds only the exact observed BKM HTTPS origin. Unknown origins, unrelated providers, trusted merchant validation and narrow return path remain unchanged. The new real-origin regression reproduced RED, then the 45 relevant helper/proxy tests passed. Storefront typecheck, production build and independent code review passed. The latest Siora header release is merged and preserved. Payment adapter/runtime/generator execution sources and canonical authorities are unchanged.

A genuine successful bank authentication/callback/order and exactly-once inventory decrease remain pending. The submitted 22:38Z transaction is not cancelled or charged again while its outcome is unknown.

## 23:22Z restart request

The user requested reopening the card-entry test in normal Chrome. The current cart's 10.00 TRY checkout was reopened and its authorized contact/delivery details filled. Normal hosted-card preparation returned its generic initialization error; the existing submitted attempt was still pending in the PayTR merchant detail with no callback or order. No new card charge was submitted.

Root reviewed the new exact-target operational guards, successfully rehearsed the transaction with ROLLBACK, and committed the existing `payment_attempt_mark_unknown` operation once for the expired submitted attempt. The reviewed SQL preserved physical stock and the held reservation unchanged. The approved LIVE runtime then reconciled this single attempt once and returned `processing`. Post-read confirmed `provider_outcome_unknown` / session `processing`, no terminal result, callback count 0 and no order. The old attempt was neither cancelled nor fabricated as failed. Private `reconcile-bkm-submitted-10tl-*` files are already applied; do not rerun their commit.


BKM release `138e073ecde396d026787e45cbcb7b0915896898` finished on SITE `mx1leks05j3pvlyzobuhdemm` and NET `esijpmx9z14rpoy4xtih0z5q`. Final global-idle/configuration verification and both exact healthy images/source/generated artifact/approval profiles/SITE database authority passed. A separate read-only import of the deployed shared helper on both actual containers confirmed BKM permission, preserved Vakifbank permission, rejected an attacker origin and absence of wildcards, without calling the provider. No credentials, schema, authority profiles or submitted payment states were changed by this release.


## Permanent checkout recovery candidate

This candidate replaces bank-by-bank merchant frame enumeration with HTTPS bank navigation only on the isolated, authorized payment documents. The initial presentation still requires the exact sealed provider token URL; default/script/connection/form/object sources stay closed. Ordinary storefront pages and Iyzico provider rules remain unchanged.

Source-bound read-only recovery chooses the latest owned cart or buy-now session, preserving the real nonterminal status after presentation expiry. A valid older hosted cookie cannot override the current source, and an unbound older receipt cannot supply the current payment summary. New checkout commands for the same pending source return the fixed result page without provider initialization or another charge. Expired unknown payments remain unknown, with no fabricated failure.

Future PayTR presentation/token window is30minutes; its local hold is35minutes including settlement grace. Iyzico remains15minutes. Observation cookies are24hours; an authenticated still-valid source can observe a longer nonterminal payment without extending its token or returning private customer data. Existing deadlines are not rewritten.

The production supervisor opens the existing exact approved runtime for every bounded run. Signed terminal callback observations retained before the release are consumed using the original immutable binding/event/fingerprint through atomic claim/final evidence checks. Contradictory evidence and uncertain transactions fail closed. The generic provider-query finalization also checks contradictory callbacks while holding the attempt lock; original lifecycle functions and compiled TEST/LIVE authority identities remain unchanged.

Verification before release: sharedstorefront796/796tests; saas-data785PASS/2existingSKIP/0FAIL; shared typecheck and productionbuildPASS. Legacyadmin copy check and webpack build with local public build-only fixture PASS (the default worktree Turbopack build cannot resolve the shared dependency layout; its first webpack attempt lacked a public Supabase URL). Focused callback/adapter/repository136/136PASS.191 actual SQL behavior and UP/DOWN recovery rehearsed with ROLLBACK only. Final192 native SQL9/9PASS includes both generic query-versus-callback races, evidence recovery, READ ONLY replay and guarded DOWN/reapply. Root combined191+192 rehearsal alsoPASS with ROLLBACK; no financial mutation occurred. Latest deployed Siora4793 and documentation903a122f are merged and preserved.

At the last exact read the submitted10.00TRY test remains unknown/processing, with no callback/order and unchanged physical stock. The merchant browser session expired and a new login was requested. No new card payment or cancellation was attempted. A full successful bank/card purchase is not claimed by these code and schema checks.

## Permanent recovery release and normal Chrome acceptance

Candidate `17bfd5703fb14c21fdaeb857e8655f43c9ee9de9` is deployed on both shared storefront targets. SITE receipt `kihla7bvj86lnxk71yiaedj0` and NET receipt `x125wc1bf57c9nkarbgrqdsm` finished. Final checks verify global idle, preserved application configuration, both healthy running images and exact source SHA, generated adapter artifacts, unchanged canonical execution identities, NET noApproval and SITE approved database authority.

Reviewed migrations 191 and 192 were committed once after a combined ROLLBACK rehearsal. Independent post-COMMIT read-only assertions passed. No financial rows were modified by the DDL or assertions.

Normal Chrome fetched the new storefront and repeated the authorized Test product checkout with the user-supplied customer details. Preparing the same cart navigated to `/checkout/payment/result`, showing “Ödeme sonucu kontrol ediliyor”, preserved cart and a refresh control. The earlier generic initialization error did not recur. The exact submitted attempt remains unknown/processing, with no callback or paid order and physical stock 2. No second charge or cancellation was made. Private screenshot: `.tmp/paytr-real-checkout-20261001/checkout-recovery-live-normal-chrome-20261002.png`.

Read-only production worker acceptance verifies candidate bytes and PID1 startup. SITE resolves its approved runtime and processes the current LIVE attempt; NET stops at the missing approval gate without invoking reconciliation. SITE's first bounded batch also selects 16 historical TEST attempts while TEST execution is disabled. Their rejection is fail-closed, but retaining them before the batch limit can delay new LIVE work. A scoped selection correction is required before claiming reliable queue acceptance. Legacy payments must retain their financial status and immutable approval bindings.

## Scoped production queue correction

The worker now supplies only its enabled compiled execution tuples after the database approval preflight. A new read-only selector matches that exact immutable provider/environment/version/digest and the enabled database approval before the 25-attempt limit. Active leases are excluded and the existing `updated_at,id` fairness order is retained in the returned array. The legacy selector is preserved. Normal CLI and production supervisor both pass the same scope; missing scope cannot fall back to the legacy selector or mark an ineligible payment unknown.

Root verification: 30 targeted application/data tests, both typechecks and shared production build passed. A real supervisor-to-worker integration test reproduced the missing scope as RED before the forwarding fix. Independently reviewed native PostgreSQL 16 tests passed 17/17, including TEST25 starving LIVE32, scoped selection, hostile input, revoked approval, leases, actual lifecycle fairness and guarded DOWN/reapply. Migration 193 was rehearsed with ROLLBACK, applied once and independently verified in READ ONLY. The live scoped batch contains only LIVE entries with active profiles and valid current credentials; no historical payment rows were rewritten.

The exact submitted 10.00 TRY cart still has no later payment attempt, callback or order, and physical stock remains 2. Bank payment success is not inferred from source-code, queue or release checks.
