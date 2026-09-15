# Design final — controlled Panel staging acceptance

Status: **PANEL STAGING DEPLOYED — AUTHENTICATED READ-ONLY ACCEPTANCE PENDING LOGIN — A03 PARTIAL**.

## Exact source and authorization

`RELEASE_SHA=e241ee7911dbff31d2c384184577ffabb3cfc7fd`.
Starting head `dd46590a3e7772ccb1839c6accff0c60ca1048a2`; the candidate adds only `VisualStorefrontCanvas.tsx` and its behavior regression. PR79 stays draft/unmerged on `codex/mira-design-settings-fix`; base remains `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`.

User authorization: ATLAS-DESIGN-FINAL supplied September15,2026 (attachment230b7b9b-d9a6-4f8a-803d-080b20659742). This is a **new exact-candidate authorization**, not automatic transfer of a prior payment approval. Only Customer Panel staging `celebix-panel-staging-auth01` may be manually released; no merge, other app, provider calls, DNS/auth changes or live design writes.

## Candidate verification

- RED: missing-category heading assertion failed (10PASS/1FAIL), then expanded empty-row regression also failed (10PASS/2FAIL).
- GREEN: behavior12/12, related design/model/client85/85, Panel typecheckPASS.
- Full Panel suite1426PASS/0FAIL/1existingSKIP on e241ee79; seven existing platform-config module-type warnings.
- Panel production buildPASS,82static pages, e241ee79.
- Diff-checkPASS. No shared storefront source changed since previous d5df7e5a evidence, so no repeated storefront build/PG suite. Previous45server,65composer/contract,18isolatedPG evidence retain their original bindings in [A03 report](design-a03-closeout.md).
- Task independent review: spec/qualityApproved, noCritical/Important. Nonblocking test-strengthening suggestion: explicitly bind every ID/status assertion to its own wrapper.
- Final independent integrated release review: Approved for exact e241ee79 candidate; no Critical/Important. Release/runtime and live acceptance remain separate gates.

### Isolated rendered matrix

| Viewport | Evidence | Result |
|---|---|---|
|1440|[Fixture1440](evidence/design-final/fixture-1440.png)|Missing heading between two real PG-snapshot rows; no document overflow; controls48px|
|1024|[Fixture1024](evidence/design-final/fixture-1024.png)|Same order/heading/status; no document overflow; controls48px|
|390|[Fixture390](evidence/design-final/fixture-390.png)|Same order/heading/status; no document overflow; controls48px|

Header modal opened and Escape restored focus to Areas summary with2px outline. Observed console errors/warnings empty. This is localhost snapshot evidence, not a live tenant. Synthetic product URLs still fail image-byte delivery (`naturalWidth=0`), explicitly **not loaded-media/CDN certification**. No safe product-media asset existed in this fixture's public directory; no CDN upload or parser relaxation introduced.

[Recorded viewport/focus/media measurements](evidence/design-final/browser-results.json).

## Fresh rollback/preflight

Observed September15,2026 using existing authenticated Coolify and existing SSH key with strict host verification. Browser terminal WebSocket failed; SSH succeeded without copying/extracting credentials.

- Actual container: `yk1h6d97z7ex0h74ok3zrj5c-180932265111`, ID `6d2d3647ba00c8f9b20dfac6f7217a2ec6237a5c42e3d4ebee15a4fb37a94c06`.
- Actual image: `sha256:3d75ca94d3e1ff32911152f0a2ef9292402939dcd20d33d9f1ef4b57aa4637d8`; retained tag `yk1h6d97z7ex0h74ok3zrj5c:c09d59a21944fb24ef82cf904db5e444ec1d4fd5`.
- Runtime SOURCE_COMMIT and generated payment metadata SHA: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`. Last deployment `c9xons49la0cdfkb97ko4hsr`.
- Source branch/pin: `codex/design-tabs-save-fix-live` / same c09d59a fullSHA.
- Domains preserved: `panel.saas-staging.celebix.site`, `guzide-kuyumcu-4.admin.saas-staging.celebix.site`, `admin.guzidekuyumcu.com.tr`, `admin.guzidekuyumcu.com`.
- Nixpacks; npmci; `npm run build:coolify:customer-panel`; existing start command; NIXPACKS_NODE_VERSION22 build-only.
- Panel,Owner,Storefront,Worker model settings all AutoDeploy=false /Preview=false; global queued/in_progress/pending query empty.
- Existing hooks preserved. READ ONLY transaction verified migration120/125/100/112 readiness including112backfill; exact digest-matched124assertions passed read-only. No migration/backfill executed. Existing pg SSL alias deprecation warning observed; settings unchanged.
- Existing runtime node20 does not support generator strip/transform flags; attempted --check commands failed before execution and changed no files. Build runtime is separately configuredNode22. Actual release generator/check remains mandatory.

## Payment candidate binding

No diff from running c09d59a to candidate in payment-adapters/contracts/generators/migration scripts/package/lockfiles. PayTR sourceDigest unchanged: `sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d`.

| Binding | Previous c09d59a | Authorized e241ee79 |
|---|---|---|
|TEST, approved_test_sandbox|sha256:dd3c5a3c2b631b7f252fe709d76cec56238eda43a612f3cbe66ac2898a24fcbe|sha256:19c53892142024b40625aa9f9ab4be125a957e621c3e9c16a303cf9d08aeae3a|
|LIVE, approved_live|sha256:eaf1a6f8ec7e459f0b2ec6370f4bdf6ef9e74900a708a1aa62fdee825f269f26|sha256:10c5c75cd9a5a350d4f780feffec765598a878eace2c00be91ba533c8c641155|

Official generator and check both passed in an isolated local copy with exact candidate and unchanged modes. Iyzico authority remains null. Credentials/provider state are not changed. This proves build binding only, not payment execution acceptance.

## Controlled deployment result

Manual deployment `suxuulr8ej5kgx5pg35ejbp7` started September15 at08:33:37UTC and finished successfully at08:38:11UTC. Immediately before starting, PR79 was OPEN/DRAFT at exact RELEASE_SHA, all four application triggers remained OFF, and the global deployment queue was empty. Only Panel source branch/pin, SOURCE_COMMIT and the two authorized evidence digests changed; modes and credentials were not changed. Checkout log identifies exact RELEASE_SHA; helper checkout hashes for both changed source/test files match local e241ee79. Coolify removes `.git`, so `git rev-parse` inside the imported artifact is unavailable, not an additional SHA proof. Nixpacks selected nodejs_22; both official generators emitted the expected candidate digests; release compilation, typecheck and82-page build passed.

- Actual running container: `yk1h6d97z7ex0h74ok3zrj5c-083337526568`, ID `10d3229ccf7007d88d06a44f0589f971d25591d7837ae0f32569e16caa585791`.
- Actual image ID: `sha256:37a23810cae9215cce63261effab6c813b1f83aafebd48f29337c2ec8c290ce4`.
- Actual runtime SOURCE_COMMIT: `e241ee7911dbff31d2c384184577ffabb3cfc7fd`; image tag binds the same SHA. Runtime canvas hash matches candidate (`46031af2ee2c8765d1fc3d0d3f7d586455bafc7f5dbe69bc6a57af2d5397318f`).
- Runtime generated PayTR file SHA256: `917b207aa7a861ccf91febb1e713a9a6d4d79803157badaa8328c0fd99b6ac4d`; Iyzico file SHA256: `b6fa44d1719fb144a236dbc036cf50a6af6ef5486867a2812e12cf98afff950c`. Both match byte-for-byte the exact candidate artifacts verified by official generator `check:true` on local Node24.11.1. Their gitSha values equal RELEASE_SHA, TEST/LIVE approval evidence matches above, Iyzico authority is null.
- Runtime remains Node20.20.2; direct runtime `npm run check:paytr-build` exits9 (`bad option: --experimental-strip-types`) before executing. The Iyzico command in that chained invocation was not reached. This direct runtime check is **not PASS**. Supported-runtime official checks plus exact runtime file-hash equality establish metadata consistency; no runtime upgrade, flag bypass, permission change or provider call occurred.
- New `.com` and preserved `.com.tr` admin `/api/health`: HTTP200 after deployment.
- Both post-hooks report `already_applied`; no new migration/backfill. Original hook hashes remain unchanged.
- Final global queue empty; AutoDeploy/Preview remain OFF on all four apps. Other app last deployment IDs unchanged: Owner `i5cdnj4dadq4iqbcee342faz`, Storefront `l894vxpekp211thqfav173rc`, Worker `twxisohfg18kk3498dow9si1`. No Umami operation.
- Verified rollback image `sha256:3d75ca94d3e1ff32911152f0a2ef9292402939dcd20d33d9f1ef4b57aa4637d8` and its c09d59a tag still exist. No rollback performed; successful staging candidate remains available.

Unchanged hook SHA256: pre `0430bc04a96bb7322875ac85dc9916dde822e51bf9392a1fe5a28830f9140253`; post `a594d05ac19cc95ff4eba0d19e5617987c21ce3d885642f89b270f0b0852d78e`. Pre-deployment checks completed. No new migration/backfill was needed by the read-only readiness evidence.

Release install output reports30 existing dependency advisories (1low,12moderate,15high,2critical) and a missing optional `/etc/ssl/certs/coolify-ca.crt` extra-certificate warning. No dependency, certificate or infrastructure change was made within this narrow release.

## Authenticated acceptance still pending

The connected Chrome profile opened the safe Güzide admin login screen, then its central sign-in link at `https://auth.saas-staging.celebix.site/sign-in`. Authenticated live acceptance awaits the user's own login; no credential or cookie was read or copied. No live screenshot or tenant/catalog/media/toolbar acceptance is claimed before that login. No live field or save/publish action has been taken.

Live read-only Güzide store `a828862c-4cc1-475a-89cc-5fbee31eb43f` acceptance now awaits login on the deployed exact candidate. No live save/publish/autosave/upload/delete is permitted. A01/A02/A04–A07 retain their passing isolated frontend regression evidence, not live mutation acceptance. Testimonials lack a proven safe unpublished public-equivalent read path and remain unavailable; A03 remains PARTIAL, not seven-of-seven closure or LOCK GREEN.
