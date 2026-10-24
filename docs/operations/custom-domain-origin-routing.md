# Shared direct-origin routes for custom domains

## Failure and scope

Cloudflare's active fallback is `shops-origin-direct-staging.celebix.site`, pointing to the existing origin server. Cloudflare forwards the original custom Host. An active custom hostname/certificate therefore still needs an origin proxy route. Existing exact merchant files covered old stores; platform wildcard rules deliberately do not match external customer domains. Ezmeo consequently received Traefik's `503 no available server` despite correct DNS and active SSL.

This repair supplies that missing shared projection. It does **not** change the Cloudflare fallback, tunnel, customer DNS, certificates, native functions, application pins, or existing proxy files. The older tunnel/storefront-router documentation describes an earlier path; switching back to it is not part of this repair.

## Authority and publication

- `scripts/custom-domain-origin-reconcile.py` takes one bounded **read-only** snapshot from the existing native staging database. Only active stores and pending/active, provider-bound, nonremoved custom domains are included. The store's unique active, verified platform domain selects the reviewed NET or SITE service. Platform domains need not remain primary/canonical.
- `scripts/custom-domain-origin-routes.py` accepts exactly `{id,hostname,role,platform_hostname}` records. Malformed, duplicate, ambiguous, reserved or oversized snapshots fail the entire render. Routes match exact registered hosts only; no external-host catch-all, arbitrary upstream, tenant fallback, header authority or certificate resolver is created.
- Storefront routes retain the existing signed proxy authority middleware; admin routes preserve actual Host. Exact OTP POST routes retain the existing IP ingress signer. Both use the same chains as `tenant-wildcard-routes.mjs`.
- Pending domains are included to break the origin-health activation dependency. Ordinary application tenant gates still require active/verified domains; existing callbacks and public login endpoints retain their own checks. Routing never activates a domain or creates access/session authority.
- Priorities `15` and `10015` keep existing exact merchant routes (`20`/`100`, OTP `10020`+) intact. One owned file is written atomically only when content changes: `/data/coolify/proxy/dynamic/celebix-custom-domain-origin-routes.yaml`.
- Publication takes the **existing** canonical release lock inside Coolify via its live process root. A busy lock defers work; the script never creates, unlinks, replaces or forces that lock. Missing dependencies or database/render/write errors retain the current proxy file.

## Installation

Run the focused Python suites, exact-candidate `npm run check:signup-release`, and fresh `npm run verify:signup-edge` before initial publication. Confirm the four existing Docker services, authority middleware and file-provider OTP signer referenced by the generator exist.

Install both Python scripts root-owned under `/opt/celebix/custom-domain-origin/`. No new credential is created or stored: the host operator uses the existing local PostgreSQL container socket through Docker, within an explicit read-only transaction, with three-second query and 250-ms lock limits. No application database role is expanded. This host operator must remain root-only.

Run the installed reconciler with `--check` first. It outputs only mode, count and configuration digest. `--apply` writes the single owned route file. Install the corresponding `.service` and `.timer` from `infra/cloudflare/` under `/etc/systemd/system/`, then enable/start the timer after the first successful apply. The oneshot runs at most once per minute, reads a small snapshot, does not call Cloudflare or poll storefronts, and performs no write on unchanged content. Database unavailability is a failed run, never an empty authoritative snapshot.

Validate public trusted HTTPS `/api/health` on both purposes, requiring schemaVersion=1, status=ok, exact hostname and exact expected store UUID (additional dependency diagnostics are legitimate). Recheck/activate through the existing domain controls; do not directly update domain state. Check storefront, admin login and existing merchants, plus NET/SITE fresh unknown-host application404 probes. Verify a second timer run is an unchanged no-op and app/native/proxy baseline invariants remain intact.

The older `verify:custom-domains` script still expects the obsolete tunnel fallback and exactly four health fields, so it is not proof of this direct-origin topology. Record those limitations instead of weakening identity checks or changing the provider to satisfy that verifier.

## Rollback and diagnosis

Stop/disable `celebix-custom-domain-origin.timer`, stop its oneshot, and remove **only** the newly owned route file (or restore its reviewed previous version). Existing legacy/platform files remain untouched. This restores the prior routing state; custom domains depending on this shared file will lose routing, so prefer fixing a failed dependency while retaining the last file. Removing routes does not revoke database access or delete a domain.

Inspect `systemctl status`/bounded service journal for generic failure/defer codes. Validate source digests against the deployed revision before replacing scripts. App rollover or unavailable middleware defers projection; stable Docker service references continue to follow the current deployment. A future topology/database-container change must update and review these fixed identities together.
