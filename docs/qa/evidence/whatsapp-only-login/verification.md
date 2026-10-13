# WhatsApp-only login verification

## Scope

The human replaced password plus WhatsApp MFA with phone plus WhatsApp OTP for store owners, staff and storefront customers. The central Owner TOTP flow remains unchanged. Ordinary store owners manage staff by personal phone and role; invitation admission is retired while historical records and existing memberships are preserved.

## Executed checks

- Owner suite: 1,010 tests, 997 passed, 13 existing skips, no failures. Subsequently reviewed current-actor and public-listener guard changes passed 43 focused Owner/Panel tests.
- Storefront suite: 1,161 passed, no failures or skips. Storefront production build and typecheck passed.
- Merchant native229: 40 isolated PostgreSQL checks passed, including current-account binding, preserved membership ownership, wrong-code counters, replay and invitation retirement.
- Customer native230: actual PostgreSQL/runtime scenario passed, including concurrent verification, lost commit, lost profile response, historical account isolation, exact unused rollback/reapply and refusal after historical use or changed successor definitions.
- Enrollment native231: 23 isolated PostgreSQL checks passed. Central operator enrollment preserves principal/membership IDs; replacement revokes old sessions, requires fresh OTP and preserves the old phone reservation.
- Five real broker integration groups passed across native228–231: signed transport, self-binding, staff login, lost reservation acknowledgment, starter signup and central canonical-store handoff. Parallel completion reuses one handoff, preserves the original eight-hour expiry and emits no full tenant session cookie on the central host.
- Owner production build and typecheck passed after current-actor and listener guards. Panel production build passed after the binding-completion actor fix; its full typecheck also passed after correcting two new test fixtures' RequestInfo/Event typing (six test cases passed).
- Diff whitespace check passed. The one existing Owner test-only asynchronous URL-provider stub was corrected to match its synchronous interface; central production authentication was not changed.

All OTP deliveries in these tests were synthetic. These checks are local evidence, not a live WhatsApp acceptance claim.

## Release gates remaining

Fresh reviewed release artifacts are required for native229 → native230 → native231, trusted ingress and all six shared applications. Existing old-MFA release/policy artifacts are historical and must not be resumed. Keep merchant enforcement disabled until real isolated-store and Alpler phone-login acceptance. Existing unbound principals require explicit personal-phone enrollment or their own verified binding; shop contacts and customer records cannot establish admin ownership.

Customer encrypted expired challenge/completion escrow currently has no bounded retention cleanup. Native expiry/revocation prevents its use; retention cleanup remains a separate operational limitation.
