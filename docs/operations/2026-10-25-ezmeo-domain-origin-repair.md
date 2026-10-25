# Ezmeo custom domain origin repair — 25 October 2026

## Result

- `https://ezmeo.com` is active and primary; storefront returns trusted HTTPS200.
- `https://admin.ezmeo.com/login` is active and canonical, shows Ezmeo's existing WhatsApp login, and returns trusted HTTPS200.
- The former platform storefront returns308 to the matching custom-domain path and query.
- Panel displays both addresses as live, with DNS, SSL and origin ready.

## Cause and change

Cloudflare hostname/SSL were already active and TXT records matched. The direct SaaS fallback reached Traefik, which had no exact routes for new custom domains and returned503. Legacy merchants worked through individual existing route files.

Installed the shared exact-host projection described in [custom-domain-origin-routing.md](custom-domain-origin-routing.md), for ten current registered custom hosts. One new file was atomically added to the proxy configuration. The enabled host timer repeats one bounded read-only native query every minute, writes only when the domain snapshot changes, and uses the existing canonical publication lock. Subsequent runs succeeded with `changed=false` and identical configuration digest `c85ab353309bcb7f510915d335b9ff0a166675c9c45cd6cecfab48cd7de13a1d`.

Ezmeo was rechecked and made primary using its authenticated existing domain settings. No direct domain-state SQL update was used. Cloudflare fallback/DNS/tunnel/certificate settings and credentials were not altered.

## Verification

- Fifteen focused Python tests pass, including invalid snapshots, authority/OTP preservation and atomic-write failure retention; generator tests were observed failing before implementation.
- Exact-candidate signup compatibility guard passes:1428 inputs, current signup and historical tariff suites.
- Fresh NET/SITE edge checks pass before and after: trusted HTTPS certificates and application404 for previously unknown platform admin/storefront names.
- Both custom Ezmeo health endpoints return200, exact hostname and the expected store UUID. Foreign forwarded-host/protocol headers do not change the reported tenant.
- Güzide, Alpler and Lilyum storefront/admin health still return the correct identities; existing proxy-file hashes are identical.
- All six app container/image/config identities are unchanged. The2059 native routines retain the same definition fingerprint. No application rebuild or deployment was required.
- Chrome visibly opens the new storefront and branded admin login. No OTP was sent, customer session created, order placed or payment performed.

Operational receipts remain in the local ignored `.tmp/ezmeo-domain-origin-20261025/` directory. A default Python urllib client was denied by Cloudflare during one probe; actual curl readiness clients, the owner server and Chrome all succeeded. No WAF/security setting was changed to obtain a passing result.

## Rollback

Stop/disable `celebix-custom-domain-origin.timer`, stop the oneshot, and remove only `/data/coolify/proxy/dynamic/celebix-custom-domain-origin-routes.yaml`. This restores the prior routing state while retaining all legacy/platform files, but new domains relying on the projection would again be unavailable. Prefer retaining the last successful file when a periodic read fails.
