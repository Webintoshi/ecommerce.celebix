# Güzide domain replacement cutover

Scope: move `guzidekuyumcu.com` and `admin.guzidekuyumcu.com` to the existing Güzide tenant while retaining the `.com.tr` storefront/admin pair and `guzidekuyumcu.myqukasoft.com` as fallbacks. This runbook does not authorize a live change by itself.

## Controlled order

1. Verify a database backup and apply migration `202609140128_store_domain_replacement_bundles` before the matching application release. A code rollback leaves the additive replacement and action history in place. The migration down path is only for an unused, empty replacement schema and refuses before mutation when either history table contains rows.
2. While the `.com.tr` pair remains primary/canonical, prepare exactly one replacement bundle for the new apex and managed admin hostname. Provider provisioning happens after the database prepare transaction. If one provider side succeeds and the other fails, replay the same operation ID to resume only the missing side.
3. Read the target Cloudflare zone at execution time. Confirm its assigned nameservers still equal `dayana.ns.cloudflare.com` and `peyton.ns.cloudflare.com`; do not infer authority from an earlier report. Copy and compare every mail and non-web service record before any registrar nameserver change.
4. Create the ownership/certificate and routing records required by the provider in the zone that will actually be authoritative. If the registrar still delegates elsewhere, update the registrar only after the target zone is complete; records in a non-authoritative zone are not readiness proof.
5. Verify the new apex and admin hostname independently: authoritative DNS, provider hostname state, managed TLS, origin health, and exact tenant/store resolution. DNS/Cloudflare changes are external operations and are not atomic with the database transaction.
6. Only after both hostnames are ready, activate the prepared bundle with its exact replacement ID and expected version. This one database transaction changes the storefront primary and admin canonical pair together. A domain rollback restores the old pair and records an immutable rollback action; it is distinct from rolling application code back.
7. Verify `https://guzidekuyumcu.com`, admin login → callback → panel → logout → login, and both `.com.tr` fallbacks. Keep `guzidekuyumcu.myqukasoft.com` unchanged.
8. Configure `www.guzidekuyumcu.com` as a redirect to the apex, not as a second tenant or replacement bundle. Acceptance requires a valid HTTPS certificate and a redirect that preserves both path and query string, for example `/urun?ref=x` → `https://guzidekuyumcu.com/urun?ref=x`; a CNAME alone is not acceptance.

## Stop and rollback rules

- Do not activate while either new hostname is unverified, reports the wrong tenant, lacks valid TLS, or the authoritative mail record set differs from the approved inventory.
- Before activation, cancel the prepare with the same durable workflow if the cutover is abandoned. A replay of that cancelled prepare must not recreate provider hostnames.
- After activation, use the supported replacement rollback action to restore the old primary/canonical pair. Do not delete replacement/action history and do not run the schema down migration.
- A rolled-back, still-verified target may be reactivated only through a new action operation ID and the current expected replacement version. The single open replacement slot remains occupied, preventing an unlimited second bundle.
