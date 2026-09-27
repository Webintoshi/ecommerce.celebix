# Onboarding resilience: browser acceptance

Prepared 28 September 2026 for Task8 of the [completion plan](../superpowers/plans/2026-09-27-automatic-store-onboarding-completion.md) and [design](../superpowers/specs/2026-09-27-automatic-store-onboarding-completion-design.md).

This is an acceptance procedure and a controlled test driver. Passing local assertions does not establish live Logto email delivery, wildcard TLS, production restart recovery, or actual browser access. Live results remain pending until root records fresh sanitized evidence. Existing [Alpler account proof](evidence/automatic-store-onboarding/alpler-spor-account.json) establishes committed account data; its browser verification flag was false. The [earlier TLS check](evidence/automatic-store-onboarding/alpler-spor-before-tls.json) did not establish valid HTTPS. Neither is upgraded to a live pass by this document.

## Authorities and exact destinations

| Surface | NET | SITE |
|---|---|---|
| Owner registration | `https://owner.saas-staging.celebix.net/kayit` | `https://owner.saas-staging.celebix.site/kayit` |
| Owner durable status | `https://owner.saas-staging.celebix.net/onboarding/status` | `https://owner.saas-staging.celebix.site/onboarding/status` |
| Safe status GET | `https://owner.saas-staging.celebix.net/api/self-serve/status` | `https://owner.saas-staging.celebix.site/api/self-serve/status` |
| Panel bootstrap | `https://panel.saas-staging.celebix.net/auth/bootstrap` | `https://panel.saas-staging.celebix.site/auth/bootstrap` |
| Panel OIDC callback | `https://panel.saas-staging.celebix.net/auth/callback` | `https://panel.saas-staging.celebix.site/auth/callback` |
| Panel fresh login | `https://panel.saas-staging.celebix.net/auth/login?destination=<slug>.admin.saas-staging.celebix.net` | `https://panel.saas-staging.celebix.site/auth/login?destination=<slug>.admin.saas-staging.celebix.site` |
| Products | `https://<slug>.admin.saas-staging.celebix.net/products` | `https://<slug>.admin.saas-staging.celebix.site/products` |
| Published design | `https://<slug>.admin.saas-staging.celebix.net/settings/design` | `https://<slug>.admin.saas-staging.celebix.site/settings/design` |
| Delivery settings | `https://<slug>.admin.saas-staging.celebix.net/settings/shipping` | `https://<slug>.admin.saas-staging.celebix.site/settings/shipping` |
| Store admin/setup | `https://<slug>.admin.saas-staging.celebix.net/setup` | `https://<slug>.admin.saas-staging.celebix.site/setup` |
| Public storefront | `https://<slug>.saas-staging.celebix.net/` | `https://<slug>.saas-staging.celebix.site/` |

`<slug>` must be the fixture's existing committed tenant slug. It is a destination, never status authority. The status reader uses the Owner cookie and immutable original scope. NET/SITE paths are tested independently; a pass for one family does not approve the other. No hostname/address/TLS workaround or cross-family fallback is permitted.

Alpler already exists on NET:

- Admin: `https://alpler-spor.admin.saas-staging.celebix.net/`.
- Setup: `https://alpler-spor.admin.saas-staging.celebix.net/setup`.
- Storefront: `https://alpler-spor.saas-staging.celebix.net/`.
- Fresh login: `https://panel.saas-staging.celebix.net/auth/login?destination=alpler-spor.admin.saas-staging.celebix.net`.

Do not create another Alpler account/store, mint an old-attempt status cookie, replay a callback, or substitute a SITE slug for this tenant.

## Controlled fixture

From the repository root:

```sh
node --check tests/saas-phase2/onboarding-resilience/acceptance-fixture.mjs
node tests/saas-phase2/onboarding-resilience/acceptance-fixture.mjs > /tmp/celebix-onboarding-acceptance-controlled.json
```

The driver executes a fixed allowlist of existing local behavioral tests, with a minimal child environment and no inherited database/provider credentials. It captures child output and emits only group pass/fail counts, safe failure codes, source HEAD identity, worktree-dirty boolean, scope check names and pending gates. It never emits test failure payloads, cookie values, codes, authorization URLs or headers. A failed group exits nonzero; it cannot be converted into an acceptance pass by skipped tests or an empty suite.

Groups:

| Group | What it verifies | Evidence boundary |
|---|---|---|
| `status_proof_cookie` | Distinct canonical32byte proof, fixed24h cookie, committed-only issuance,401/503 and safe DTO/URLs | Controlled repositories; real SQL remains root's isolated PG gate |
| `pending_signed_protocol` | Signed canonical202, exact Owner URL, grant disposal,≤100ms cache wait in remaining5s, no pending issuer/redeemer, replay denial, old result compatibility | Fake verified provider; no actual email delivery or live session |
| `status_component_dom` | Real React DOM pending→ready, actual5s poll, terminal stop, hidden pause/resume, unavailable/expired safe actions | happy-dom; no native browser screenshot/layout/console claim |
| `fresh_returning_login` | Fresh OIDC transaction, browser proof, immutable identity, exact destination and membership checks | Controlled service/repository tests |
| `runtime_failures_recovery` | Transient initialization/provider cache recovery, coalescing/key rotation, completion uncertainty, worker bounds/fencing/retry | Controlled failures; process/database durability proven separately in PG |
| `setup_readonly_permissions` | Exact tenant health/capabilities, published blank design, absent products/logo, permission-vs-unavailable, payment scope truth | Stubbed transport; no payment/provider execution |
| `delivery_model` | Missing fee vs explicit zero, integer cents, preserved configuration semantics | Pure model/presentation; no merchant setting save |

The additional direct scope checks run both exact NET and SITE handler configurations: pending has no destinations; ready produces exact fresh-login/public URLs; missing proof, attempt hint and wrong request origin cannot reach the reader; cookie reads never renew expiry; expired/unavailable have401/503; pending response has exact canonical202 body. These checks use a narrow controlled status port. They do not claim real database cross-scope binding, durable snapshot freshness or live rollout.

The driver uses the current working tree. `sourceShaAtStart` and `sourceSha` identify the starting and ending HEAD; `sourceStable` and `worktreeDirty` must be preserved when recording evidence. A clean deployed image must be verified against the final reviewed SHA separately. No package/product rebuild is needed for these two preparation files.

## Recorded controlled run

The preparation run at `2026-09-27T21:51:56.783Z` passed **159/159 reported tests**, zero failures/skips, both direct NET/SITE scope checks. The DOM group's one reported wrapper also verifies three child React/happy-dom cases. Source start/end HEAD was `fcb09e6a70259f76224915da6366b70f1be84f21`, stable during this run; the worktree was dirty, so this is working-tree evidence, not a deployed-source receipt. Sanitized output is `/tmp/celebix-onboarding-acceptance-controlled.json`; root can archive it with final acceptance evidence after rerunning against the reviewed clean source.

| Group | Reported pass count |
|---|---:|
| `status_proof_cookie` | 11 |
| `pending_signed_protocol` | 44 |
| `status_component_dom` | 1 |
| `fresh_returning_login` | 12 |
| `runtime_failures_recovery` | 69 |
| `setup_readonly_permissions` | 17 |
| `delivery_model` | 5 |

## NET/SITE acceptance matrix

Run every applicable row once on NET and once on SITE with independently scoped synthetic fixtures. Record `pending`, `pass`, `fail` or `not_authorized`; do not infer a live pass from the controlled column.

| ID | Action and expected result | Controlled coverage | NET live | SITE live |
|---|---|---|---|---|
| A01 | Open exact Owner `/kayit`; meaningful form, consent, new signup requests fresh login; no blank/framework overlay | Existing registration/provider fixtures | Pending | Pending |
| A02 | In isolated fixture, complete fresh verified identity→same original tenant operation; verification fixture is visibly labeled synthetic | Composition+completion tests | Pending; real signup needs explicitly authorized test identity and actual user code | Same |
| A03 | Submit twice/slug or identity conflict: controlled rejection/idempotent existing operation; never a second tenant/owner/subscription/domain/media/design set | Concurrent resume/slug rejection tests; duplicate-submit/existing-email E2E and real uniqueness remain root PG gates | Pending | Pending |
| A04 | Incomplete access yields signed HTTP202 canonical `schemaVersion,kind,statusUrl`; exact configured Owner only | Pending protocol + both scope checks | Pending | Pending |
| A05 | Pending Panel callback303 reaches Owner status; only Panel pre-auth cookie removed; Owner proof remains usable | Enabled in-process flow + completion tests | Pending | Pending |
| A06 | Owner proof is HttpOnly/Secure/SameSite=Lax, `__Host`, Path `/`, no Domain, fixed24h; absent from URL/HTML/JSON/localStorage; GET does not renew it | Codec/handler tests | Pending; inspect attributes only | Pending; inspect attributes only |
| A07 | Status pending polls5s;503 waits15s; hidden tab pauses; ready/attention/expired/failed stop automatic polling | DOM harness + delay/DTO tests | Pending native timing/visibility | Pending native timing/visibility |
| A08 | Another cookie jar gets401; an attemptId/slug hint is rejected; NET proof under SITE scope denied and inverse denied | Cookie/origin checks; SQL168 scoped QA is a separate gate | Pending | Pending |
| A09 | Expired proof401 gives normal login/support guidance, never another registration for uncertain/verified attempts | DOM harness + safe projection PG | Pending synthetic expiry only | Pending synthetic expiry only |
| A10 | Bad signature/status/key order/foreign statusUrl/forged identity/browser binding fails closed; no redirect/session mutation | Signed protocol/auth tests | Pending isolated injection only | Pending isolated injection only |
| A11 | Cache read slow/unsettled/fails or budget exhausted: no handoff issuer, initial grant disposed, no code replay, fixed pending status when authenticated response arrives within unchanged5s | Executor/handler tests | Pending | Pending |
| A12 | DB timeout, lost COMMIT, concurrent callback, process restart: same immutable payload/idempotency/fingerprint recovered; no force-clear/reset; status stays truthful | Controlled completion/worker tests; real interleaving/restart root PG gate | Pending isolated fault fixture | Pending isolated fault fixture |
| A13 | Ready only after fresh<5min exact tenant access snapshot; stale/wrong store/scope/TLS/404 becomes pending/unavailable; no network probe during callback | Cached SQL tests, access/edge mocks | Pending actual DNS/TLS | Pending actual DNS/TLS |
| A14 | Ready's button starts a new exact-destination returning login; verified identity and current active membership required; status/worker never mints session | Returning-login tests | Pending normal browser login | Pending normal browser login |
| A15 | Other tenant destination/session or insufficient role denied; setup marks restricted and avoids protected read ports | Returning-login + setup loader tests | Pending synthetic other tenant/restricted role only | Pending synthetic other tenant/restricted role only |
| A16 | Setup displays account access separately from empty products, optional logo, design publication, delivery and payment; unavailable never means missing | Setup model/presentation tests | Pending read-only UI | Pending read-only UI |
| A17 | Delivery missing/legacy fee stays action required; explicit zero is free delivery; integer cents rendered correctly | Pure delivery/setup tests | Pending read-only settings | Pending read-only settings |
| A18 | Test/configured/offline/live payment labels reflect active matching admin+storefront authority; closed flags remain closed | Setup scope/model tests + root runtime metadata gate | Pending; no provider execution | Pending; preserve existing SITE scope, no provider execution |
| A19 | Old Owner/new Panel works; new Owner emission-disabled/old Panel works; consumer installed before emitter activation | Existing result and rollout tests | Pending image/flag review | Pending image/flag review |
| A20 | Supported scope worker heartbeat fresh; pending recovery visible; sanitized enums/counts/correlation only | Worker/operations tests + root PG | Pending deployed supervised worker | Pending deployed supervised worker |

A transport that exceeds its unchanged5s deadline may fail with controlled unavailability before the Owner can return202. It must never replay the OIDC code or issue a session later from status proof. Recover via the separate Owner status page and a fresh verified login when ready. Record timeout behavior explicitly; do not claim all slow callbacks return a browser redirect.

## Existing Alpler: native browser procedure

Use the current session's CUA tool and its returned browser/app documentation. Do not start shell Playwright, another automation browser, or browser extensions as a substitute. Follow the user's existing session and root's authorization. Never collect or log a password, OTP, code/state query, cookie value or authorization header.

1. Confirm exact NET admin/storefront DNS and certificate validation is green in root's fresh TLS evidence. Keep TLS validation enabled.
2. Open the exact fresh-login destination above. Complete normal Logto login with the actual existing account and user-provided verification when requested. Do not reuse a signup callback or old OTP.
3. Confirm canonical Alpler admin origin, working shell, no framework overlay/blank state, and relevant console error count. Capture only sanitized page identity and status booleans; do not copy transient callback URL parameters.
4. Visit `/products` read-only: the current empty or populated catalog is truthful, draft/create navigation resolves, and no other tenant data appears. Do not create/edit/upload/delete on the existing merchant.
5. Visit `/settings/design` read-only: published blank starter remains valid; optional logo is not an access failure; draft and published state are distinct. Do not change/publish existing design.
6. Visit `/settings/shipping` read-only: missing/explicit zero/current fee states are truthful; unavailable/permission errors are distinguished. Do not save a fee or initiate a shipment.
7. Visit `/setup` read-only: account access, products, design, domains, delivery and payment each match actual established context. No duplicate visible page title inside working screens; useful next action and semantic heading remain available.
8. Open the exact Alpler public storefront: valid certificate, meaningful published starter and truthful empty catalog; no invented products or checkout-ready claim. Do not place an order, execute a provider/payment, subscribe to a paid plan or consent to marketing.
9. Reload normal admin/storefront pages. Verify the callback endpoint is never polled/replayed and access continues through normal session/membership resolution.

SITE runs the same procedure with its task-owned existing/synthetic tenant; Alpler NET is not re-created to obtain SITE coverage.

## Isolated merchant continuation

The Task8 plan includes draft product/image upload, design publication and delivery save. Those writes belong only to an explicitly isolated synthetic merchant fixture with its own approved namespace/data and root-owned QA lifecycle. This preparation performs none of them. Keep these gates pending until root exercises the actual product/design/delivery round trip, verifies published storefront output and restores/removes only task-owned fixture data. Current model/read-only checks do not establish successful upload/publication or a live shipping save.

For an “another browser” case, use a genuinely separate approved cookie jar/profile, not a second tab sharing cookies. Clear/expire only the synthetic fixture's status proof through the controlled fixture mechanism. Never alter the Alpler user's cookies or production SQL to synthesize expiry/faults.

## Evidence and release gate

Record safe fields only: reviewed source/image identity; scope/family; canonical URL with query removed; generic page/stage code; HTTP status; cookie attribute booleans; issuer/redeemer call counts in controlled tests; timeout duration; certificate-valid boolean; heartbeat age; row counts/hashes from root's synthetic-only PG verifier; payment mode/authority booleans. Exclude all credentials, raw env/labels, source/customer rows and authentication screenshots containing private identity or verification fields.

For each native UI step record page URL/title, nonblank content, no framework overlay, relevant console error count, and a visible interaction result. Add screenshots only when they contain no secrets/customer PII and genuinely establish the claimed view; desktop/mobile layout and keyboard behavior stay pending until observed.

Root owns fresh167/168/169 up/assertions/down/up and two-connection recovery proof, existing merchant preservation hashes, source-bound payment metadata, migration/consumer/emitter/worker ordering, live8URL/TLS and browser acceptance, and rollback. Keep status emission false until compatible Panel images are confirmed. On rollback disable Owner emission/worker first and preserve durable attempt/job/proof state. SQL168 down intentionally refuses remaining proof bindings. Mark the plan's completion boxes only from fresh actual results.
