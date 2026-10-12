# Shared side cart message and logout fixes — 2026-10-12

## Scope and causes

This is a shared Customer Panel fix for current and future tenants. Merchant
reported that the side cart message could not be cleared, rather than an
incorrect storefront rendering.

- The optional `trustMessage` cannot be an empty string under the existing strict
  contract. The controlled input sent that invalid value and reverted.
- Omitting the key then merging a complete cart edit with the previous cart
  restored the old message. Both points are corrected in the composer/model.
- Clearing or entering only whitespace now omits the optional key; applying and
  reopening the editor retains its absence. Other cart settings remain intact.
- Public storefronts already handle the absent key; no production storefront,
  schema, payment, order, or API contract change is required.

Logout's actual provider response was HTTP400 `oidc.invalid_request`, with
`post_logout_redirect_uri not registered`. The shared Logto client had the SITE
logout callback registered but omitted the NET callback. Through the official
Management API, exactly `https://panel.saas-staging.celebix.net/auth/logout/callback`
was added. Full application comparison confirmed every other field and existing
callback remained unchanged. No new credential, grant, wildcard or per-tenant
exception was added. The configuration prerequisite is recorded in
`docs/operations/tenant-admin-auth-rollout.md`.

## Source and local verification

Production candidate: `300f4b9382b87bab0241a13a578873aed161dd56`.

- Regression reproduced before implementation; 86 focused tests passed afterward.
- Actual composer event, canonical parsers, editor state, operation/version and
  API-client payload/response are exercised. Persistence and reopening use an
  in-memory HTTP fixture, not a claim of a live merchant save.
- Empty and whitespace clear, apply/reopen, valid replacement, generic and Siora
  omitted-message render, quantity/readiness/shipping controls and the 500 TL
  free-shipping threshold are covered.
- 13 existing focused authentication/logout tests passed unchanged.
- Clean customer-panel production build and `git diff --check` passed.
- Independent exact-candidate review found no regression in the requested clear
  behavior. An existing unrelated same-field typing limitation remains: a
  temporary trailing space is rejected by strict per-keystroke validation, while
  a complete valid multiword value is accepted. It was not introduced by this fix.

## Live logout acceptance

Real Alpler and Siora NET and Güzide SITE logout requests were followed through
the public provider end/confirm routes and shared logout callbacks. All returned
303 to their own exact `/login` address. Alpler's public branded login page was
also visibly opened in the browser.

These protocol probes used no authenticated session credential. Authenticated
session revocation and the real signed-in Exit button remain pending merchant
login; do not represent those as live verified. No merchant design record was
changed for these probes. Screenshot:
`/tmp/celebix-side-cart-logout-20261012/alpler-login.png`.

## Panel publication

ROOT publishes in NET acceptance then SITE order using the sealed source-only
release kit `.tmp/side-cart-message-release`. Full raw configuration snapshots,
exclusive dispatch intents and receipts are kept privately outside Git. The
four storefront/owner applications are preserved witnesses.

Successful publication order: NET, its ROOT acceptance, then SITE. Both owned
deployments finished and the queue was idle at 12:04 Türkiye time.

| Target | Deployment | Image and SOURCE |
| --- | --- | --- |
| Panel NET | `zcsby6dnbxmvg025hg4oq5mm` | `300f4b9382b87bab0241a13a578873aed161dd56` |
| Panel SITE | `wdremtqbn5kaz5cj8pgtffhq` | `300f4b9382b87bab0241a13a578873aed161dd56` |

Both runtime images and compiled source were verified. All four storefront/owner
containers, exact protected configuration/runtime environment, compiled Google
and PayTR authorities and keyrings were preserved. Native 1770 functions/catalog,
schema/roles and all seven payment214 startup checks remained unchanged. The
source-only panel release performs no provider operation or merchant data write;
the separate exact Logto allowlist update and public logout probes are described
above.

NET acceptance explicitly records that clear/apply/reopen was verified through
the actual component/API fixture and deployed exact source, while a live merchant
design save was unavailable. SITE uses the same verified candidate. Alpler login
remained at the sign-in form; the user login handoff is still open. No authenticated
merchant save or session-revocation completion is claimed. After both deployments,
the public Alpler/Siora/Güzide logout protocol probes again passed to their own
exact `/login` destinations.

Private release receipts and configuration backups must remain outside Git. The
Logto backup/receipt is restricted to `/root/celebix-shared-logout-20261012` on the
server; it is not copied into this report.
