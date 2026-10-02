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

Release acceptance remains pending until exact running source/build artifacts, configuration preservation, database authority, public routes and common panel behavior are verified. No new card payment, provider query, callback acknowledgement, order creation, cancellation or financial reconciliation was initiated during this audit.
