# Remaining merchant admin UI — shared release

## Released source

Complete. Both shared Customer Panel applications run `eaceed77b4976cd2c98b43d492fe15cdce09083a` from `codex/remaining-admin-ux`.

The source descends from the previous live Policies release `cae4871c6619ce222c69bc599414df48b1b96b8e`. The frontend scope covers customers, promotions, supplementary catalog/imports, inventory, pricing, marketing, content, marketplaces, accounting, SEO, lucky wheel, draft orders, payment links and abandoned carts. Existing approved primary screens are retained. The user canvas remains `#f8f7f5`, with restrained orange, graphite, open sections and minimal working-page copy.

Production backend, contracts, SQL, authentication, owner and storefront source are unchanged. No payment provider, inventory operation, import, campaign or real customer content was executed during acceptance.

## Verification before deployment

- Final combined relevant suite: **301/301 passed**.
- Final typecheck and production build: **exit 0**; diff whitespace check clean.
- Independent source and release-helper reviews: accepted.
- Local fixture visual, keyboard, error retention and responsive checks are recorded with their limits in [implementation verification](remaining-admin-ui-2026-09-29.md).

The existing lockfile was installed locally to repair a missing dependency symlink. Package manifests and lockfile are unchanged. The release adds no dependency, font, raster asset or animation library.

## Completed deployments

| Shared application | Owned deployment | Finished, UTC |
| --- | --- | --- |
| NET — Siora and Alpler | `sfg2zyf3q6z5vnq3ow0yt0rs` | 2026-09-29 11:20:02 |
| SITE — Güzide | `yr939w7kn82lpc23c50857at` | 2026-09-29 11:30:53 |

Both used the installed Coolify 4.1.2 normal queue helper, exact source pins and one owned dispatch per target, sequentially. The final full configuration guard passed after both deployments finished; both runtime images match the released source and the global deployment queue was idle.

The initial preflight rejected the operator's root execution identity because the cooperating release lock belongs to Coolify's normal `www-data` UID/GID 9999. After independent review, only this release's exact private directory and four input files were assigned to that account. Their content hashes and 0700/0600 modes were verified. The shared lock was preserved and the helper ran under UID/GID 9999. No application mutation occurred before the successful snapshot.

Durable raw encrypted preimages of both applications, settings and all environment rows are retained at `/data/coolify/backups/celebix-remaining-admin-release-20260929/before.json`, directory 0700/file 0600. Host and container preimage hashes match. Private configuration and credentials are excluded from repository evidence.

Existing auto/preview settings, hooks, modes, flags, all preview values and other raw attributes are preserved. Only the existing source pins/SOURCE_COMMIT and source-bound PayTR evidence digests changed. NET's inactive LIVE values remain unchanged. SITE retains its existing TEST/LIVE approval scopes. No provider was activated or invoked.

## Runtime acceptance

Each exact running image passed **70/70 source hashes** and **88/88 compiled route checks**, including preserved Policies and Analytics source. Every checked route has a safe manifest target and an existing compiled file. The expected source set is derived from Git blobs for the exact release commit.

Official generation/check and independent payment binding calculations passed for unchanged adapter source. Both runtimes match the new PayTR TEST/LIVE metadata. NET retains null execution authorities and absent runtime approval variables; SITE retains its existing matching approved authorities/runtime settings. Iyzico metadata and its independently recomputed candidate digest match both images, with null execution authority.

A few read-only inspections received no response. A subsequent monitor recorded SSH exit 255 with a connection reset. Successful bounded follow-up inspections completed the required gates; no uncertain deployment dispatch was retried and no duplicate deployment occurred.

## Public acceptance

The same seven hosts and 56 checks per host passed before and after deployment: **392/392** each, with default TLS verification, no cookies and no authentication.

| Registered tenant address | Post-release result |
| --- | --- |
| `alpler-spor.admin.saas-staging.celebix.net` | Health 200/ok/Redis ready; login 200; 54 screen guards redirect to same-host login |
| `butik-siora.admin.saas-staging.celebix.net` | Same checks pass |
| `guzide-kuyumcu-4.admin.saas-staging.celebix.site` | Same checks pass |
| `admin.guzidekuyumcu.com` | Same checks pass |
| `admin.guzidekuyumcu.com.tr` | Same checks pass |

The central `panel.saas-staging.celebix.net` and `panel.saas-staging.celebix.site` hosts return login 200 and the same guarded redirects. Health 404/not_found is expected without a tenant identity. All TLS checks passed; validation was never bypassed.

Authenticated live screen interactions and real mutations are not claimed. Exact runtime source/compiled routes and anonymous entry/health guards are verified; presentation behavior is supported by the recorded local fixtures.

## Saved evidence

- [Candidate verification](evidence/remaining-admin-shared-release/candidate-verification.json)
- [Owned deployments](evidence/remaining-admin-shared-release/deployments.json)
- [Final configuration guard](evidence/remaining-admin-shared-release/verify-final.json)
- [NET source and compiled routes](evidence/remaining-admin-shared-release/runtime-panel_net-core.json), [SITE source and compiled routes](evidence/remaining-admin-shared-release/runtime-panel_site-core.json)
- [NET PayTR metadata](evidence/remaining-admin-shared-release/runtime-panel_net-metadata-independent.json), [SITE PayTR metadata](evidence/remaining-admin-shared-release/runtime-panel_site-metadata-independent.json)
- [NET Iyzico metadata](evidence/remaining-admin-shared-release/runtime-panel_net-iyzico-independent.json), [SITE Iyzico metadata](evidence/remaining-admin-shared-release/runtime-panel_site-iyzico-independent.json)
- [Public checks before](evidence/remaining-admin-shared-release/live-http-before.json), [public checks after](evidence/remaining-admin-shared-release/live-http-after.json)

Release source remains pinned on `codex/remaining-admin-ux`. This report and sanitized evidence are saved separately on `codex/remaining-admin-live-evidence`.
