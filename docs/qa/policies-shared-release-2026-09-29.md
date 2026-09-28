# Policies — shared admin release

## Source and correction

Complete. Released source is `cae4871c6619ce222c69bc599414df48b1b96b8e` from `codex/policies-live`.

The prior Analytics deployment omitted the completed approved Policies work. At the user's correction, original Policies commit `13fb2586636aac38a4df4bfe2d086f8a0ace2cd1` was cleanly applied on exact current live source `e6a1cc9f95369475a0addd24f4847509050c6777`. This retains Analytics and the newer onboarding/setup source. The approved design and previous fixture visual acceptance are recorded in [Policies implementation](../design/policies-approved-ui.md).

Candidate scope is the original21-file Policies frontend change. Production API/HTTP/runtime, SQL, authentication authority, owner, storefront, shared contracts, payment adapters/generators and Analytics are unchanged. The two server page edits provide the existing opaque frontend draft-recovery scope. The ProductDescription preview renderer was extracted byte for byte and re-exported under its original import path; existing product editors remain compatible. No real policy content was edited or saved during deployment acceptance.

## Verification before deployment

- Policies mounted editor/navigation/body/client plus existing HTTP/runtime suite:35/35 passed, exit0.
- Scoped policy presentation and synthetic transport/recovery fixtures:4/4 passed, exit0.
- Full Customer Panel production build:exit0, compile, TypeScript and90static pages completed; policy index and edit routes generated.
- Independent source/contract review:approved, no concrete production finding; seven fixed policies, permissions, exact save/version contract, canonical conflict/unknown-commit recovery, source preservation, per-policy drafts and read-only inspection retained.
- Broader mixed Settings test run:41/45 passed, four failed. These are unchanged static settings/domain expectations. All remaining assertion calls,19 source references across12 unique production inputs, six read/CSS helpers and shared test support match the live baseline. Two callbacks are identical; two remove only obsolete Policy CSS checks replaced by dedicated Policy coverage. These failures are retained as limitations of the broader gate; an all-tests pass is not claimed. [Precise comparison proof](evidence/policies-shared-release/unchanged-settings-assertions.json).

## Completed deployments

| Shared application | Deployment | Result |
| --- | --- | --- |
| NET — Siora and Alpler | `lxbmj5loxh0y4i28ttwuqowu` | Finished; exact candidate image/runtime |
| SITE — Güzide | `f12h9qpccer4s30061ra2eco` | Finished; exact candidate image/runtime |

Deployments used the installed Coolify4.1.2 normal queue helper, sequentially, with saved ownership receipts and exact source pins. Auto/preview deployment settings and existing approval scopes were preserved.

Durable private raw encrypted preimages include both applications, settings and all environment rows in `/data/coolify/backups/celebix-policies-release-20260929/before.json` (directory0700, files0600). Credentials and private preimages are excluded from repository evidence. The final full raw configuration guard passed, both owned deployments finished, both applications running and the global deployment queue idle. Existing settings, hooks, preview values, modes, flags and remaining raw attributes are preserved. Existing source pins/SOURCE_COMMIT and source-bound PayTR digests were updated; inactive NET LIVE values were retained. SITE's existing approved TEST/LIVE authorities match the new source-bound candidate; NET authorities remain inactive. No provider was activated or invoked.

Official payment generation/check passed for the unchanged adapter source. Independent metadata checks pass for both new images. Each runtime matches all18 expected source hashes:10 Policies production files plus8 preserved Analytics/route/proxy files. Both compiled policy index/edit routes exist in their manifests and filesystem. Origin `codex/policies-live` remains the exact released source; documentation is saved separately on `codex/policies-live-evidence`.

## Post-release public checks

Normal curl client with default TLS verification, no cookies or authentication:

| Registered tenant address | Result |
| --- | --- |
| `alpler-spor.admin.saas-staging.celebix.net` | Health200/ok/Redisready; policy index/edit307 to same-host login; login200 |
| `butik-siora.admin.saas-staging.celebix.net` | Same checks pass |
| `guzide-kuyumcu-4.admin.saas-staging.celebix.site` | Same checks pass |
| `admin.guzidekuyumcu.com` | Same checks pass |
| `admin.guzidekuyumcu.com.tr` | Same checks pass |

The registered host list comes from the authoritative read-only inventory recorded during the preceding Analytics release. The two central `panel.saas-staging.celebix.{net,site}` hosts return login200 and both policy guards307; health404/not_found is expected without a store identity.

Alpler's pre-existing TLS failure, recorded in the preceding release, is no longer present in the fresh23:14UTC public probe: normal certificate validation succeeds and tenant health/login/policy guards pass. This Policies rollout made no DNS, certificate or proxy configuration change; resolution is observed without attributing it to this frontend deployment. No TLS validation was bypassed.

Live authenticated editor behavior or content mutation is not claimed. The available browser session requires central login; exact runtime source/compiled routes and anonymous public entry guards are verified. Existing approved fixture visual/behavior acceptance remains the frontend presentation evidence.

Sanitized evidence: [candidate checks](evidence/policies-shared-release/candidate-verification.json), [deployment status](evidence/policies-shared-release/deployments.json), [final preservation guard](evidence/policies-shared-release/verify-final.json), [NET runtime](evidence/policies-shared-release/runtime-panel_net-core.json), [SITE runtime](evidence/policies-shared-release/runtime-panel_site-core.json), [NET independent metadata](evidence/policies-shared-release/runtime-panel_net-metadata-independent.json), [SITE independent metadata](evidence/policies-shared-release/runtime-panel_site-metadata-independent.json), [public HTTP/TLS checks](evidence/policies-shared-release/live-http-smoke.json).
