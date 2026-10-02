# Shared PayTR tenant verification — 2 October 2026

## Live inventory

Read-only inspection found 11 active store records and four published primary storefronts. Güzide and Hemenaku use the common SITE service; Alpler Spor and Butik Siora use NET. Both storefront services run `c3457675`; both customer panels initially run `bf66681e`. Automatic and preview deployments are disabled and the deployment queue was idle.

Only Güzide has PayTR merchant profiles: validated TEST and LIVE profiles, with the LIVE payment method active and TEST method disabled. Alpler, Siora and Hemenaku have no online provider connection. Hemenaku retains its existing manual payment methods. There are no NET online profiles, methods, payment attempts or pending LIVE verification jobs; the global pending LIVE verification count is also zero.

The user's real Güzide payment was independently confirmed: one captured LIVE PayTR attempt, matching paid WEB order for 1,000 TRY minor units, one item and exactly one `checkout_sale` inventory event with quantity delta −1. No customer details, card values, merchant credentials or provider references are included here.

## Common corrections

The previous bank authentication, callback parsing, source-compatible execution identity, payment recovery and scoped reconciliation corrections already reside in common code and are deployed on SITE and NET. Direct read-only import of each running frame helper confirms PayTR HTTPS bank navigation is confined to isolated payment documents; unsupported providers and unsafe merchant names fail closed and Iyzico keeps its existing policy.

The additional common panel correction separates TEST/LIVE credential verification from approved payment execution. Credential setup can use both environments even when a compiled sandbox approval exists. Existing method-control and setup-readiness execution metadata remain authoritative through their original registry. Profile verification still uses the existing ownership, version, encrypted credential and enabled database authority gates; no merchant is automatically approved by this code change.

Connection cards select the active payment method's profile before another active TEST profile. A pending TEST profile keeps its own save operation disabled while allowing the merchant to switch to LIVE. Iyzico and other provider behavior is preserved.

The return bridge now uses authenticated read-only status independently of iframe presentation. A callback can remove the presentation before browser return without blocking the fixed result page. Only exact GET return paths and the three existing allowed searches receive the nonce bridge and `self`/PayTR frame permission. Ordinary pages, invalid ownership and payment-display requests retain their previous guards. The bridge cannot settle a payment or expose payment details.

## NET capability configuration

Container environment presence is not a complete Coolify environment-row inventory. The official model also contains inactive build bindings and preview rows. The release must preserve every preview row and adjust only specifically reviewed normal LIVE build bindings and the normal NET PayTR runtime mode. It must not insert duplicate approval rows, copy merchant credentials, alter authority definitions or activate merchant profiles.

The supported execution manifest remains `sha256:ed6671e40af5116572449b29f759b79de431550173a7afccf0149566e6b15d2b`. Existing canonical TEST `b332fb0e…` and LIVE `14bbcbf7…` identities must remain intact. NET LIVE support requires official generation on the actual release SHA and a matching enabled database authority; TEST remains closed there. Merchant execution still requires its own validated active profile and method.

## Verification and release gate

The terminal-return regression reproduced two failures before the correction. Focused production ownership/fallback, proxy and standard-hosted tests pass 76/76; frame-policy tests also pass. Panel verification, HTTP, method controls, connection forms and preserved panel/Toshi behavior pass 179/179. Both app typechecks and production builds pass on the integrated candidate. A fixture type annotation from the deployed panel branch was corrected after integration; no production Toshi behavior was changed.

The integrated candidate preserves deployed panel UI work from `bf66681e` and common storefront/search work from `c3457675`. Merge resolution retains the newer reviewed PayTR adapter/generator unchanged. Local disk exhaustion interrupted a panel build; only the two ignored and reproducible app build-cache directories were removed before retry.

## Deployed release

Candidate `99a613f7f133db8312a74fd71463e317add82d07` was published from `codex/shared-catalog-search`. It includes the previously deployed storefront and panel branches. The following four owned Coolify deployments finished in sequence:

| Target | Application | Deployment receipt |
| --- | --- | --- |
| NET storefront | `h55zoba9jh6ij8g6irpqzd9i` | `hd5or6lcam1llvg3ag0vy0zg` |
| SITE storefront | `vtc2aah63jbqnmtxmvykn6jl` | `t9pws9p4bu8b0v7w9qecsnvm` |
| NET customer panel | `e4xe74cmii7jucbkyor0o412` | `dd7c8v3pu6cmzbjf6o326vxg` |
| SITE customer panel | `yk1h6d97z7ex0h74ok3zrj5c` | `l370i55ywhg8shaczf72kpv8` |

The official PayTR generator and its check command passed for the real candidate in three configurations: no approvals, reviewed LIVE only, and reviewed TEST/LIVE. Adapter execution sources and the generator remain identical to the deployed `c3457675` baseline. Independent source and artifact hashes, generated metadata, compiled authorities and actual runtime environment agree for every running image. Enabled database authorities match for each compiled environment. Both storefronts are healthy; panels run successfully without a configured Docker healthcheck.

NET storefront uses reviewed LIVE only; its TEST bindings remain unconsumed. SITE storefront and SITE panel retain reviewed TEST/LIVE bindings. NET panel retains its original disabled execution mode and unconsumed approval rows while allowing independent credential verification. No approval definition or merchant connection was inserted or copied.

The guarded configuration transaction passed a deliberate rollback rehearsal with complete restoration before preparation. Final verification required all four owned finished receipts, exact applied configuration hashes and an idle global queue. All preview rows, row identities, SITE approval values, both panels' payment settings, other environment metadata, domains and deployment hooks were preserved. Only source pins, the existing NET normal LIVE binding values/flags and the existing NET storefront runtime mode were changed.

Both deployed panel packages passed eight pure behavior checks using synthetic fixtures: TEST/LIVE credential verification, preserved execution gates, linked LIVE profile selection, credential catalog projection, unchanged published catalog, pending TEST connectability, unchanged Iyzico behavior and startup wiring. Provider and network calls were zero; no database was imported or called by these probes. The panels use Node20; verification scripts were adapted to transpile existing TypeScript in memory. The initial unsupported type-stripping flag and local evidence-writer error were verification-instrumentation failures; production code did not require another change.

## Postrelease acceptance

At 11:13 UTC all 19 anonymous GETs returned HTTP 200: home, account login, checkout and unauthenticated payment return for each of the four published shops, plus three customer-panel login aliases. Both running storefront frame helpers passed the four scoped PayTR/Iyzico assertions. Anonymous return pages retain `frame-ancestors none` and `X-Frame-Options DENY`; the authorized bridge is covered by the production ownership regression tests and cannot be tested using anonymous requests.

NET's merchant profile, active provider method, pending verification/workflow job and payment-attempt census remains zero and exactly matches the pre-transition snapshot. Güzide's existing captured 10 TL attempt, paid WEB order and one inventory decrement match the pre-release acceptance evidence exactly. No new card payment, provider query, callback acknowledgement, order creation, cancellation or financial reconciliation was initiated during this audit.

The three panel login aliases return HTTP 200 and private no-store. Their responses do not include CSP frame ancestry, X-Frame-Options, HSTS or Referrer-Policy headers; no pre-release panel-header baseline was captured, so this observation is not classified as a release regression. Storefront response header checks pass separately.

Alpler Spor, Butik Siora and Hemenaku still have no online provider connection. Common support is deployed, but each tenant needs its own merchant credentials, verified connection and callback configuration before taking PayTR payments. Real payment acceptance is confirmed only for Güzide's existing user-performed purchase.

Private official proof, configuration snapshots, deployment receipts, actual runtime checks, pure panel behavior reports and passive postrelease evidence are retained under the task's ignored audit directory. This QA-only follow-up does not change the pinned deployed code SHA.
